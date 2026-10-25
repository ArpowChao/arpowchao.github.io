/*
 * worker.js -- background computation for the web UI.
 *
 * Runs in a Web Worker (other CPU cores) so the 3-D view never freezes:
 *   'compute' : trajectory + spinless twin, then the 12 seam phases one by one
 *               (forces, separation line, 3-D mean streamlines)
 *   'inst'    : instantaneous streamlines for one phase at one instant
 *
 * When the page is opened from file:// the browser may refuse to start a
 * worker; the page then loads this same file as a normal script and calls
 * BAWorker.handle() on the main thread (same results, just not parallel).
 */
(function (root) {
  'use strict';
  const inWorker = typeof importScripts === 'function' && typeof window === 'undefined';
  if (inWorker && !root.BA) importScripts('flow_tables.js?v=11', 'physics.js?v=11');
  const BA = root.BA;
  const NPH = 12;
  let job = null;

  const flat = arr => { const o = new Float32Array(arr.length * 3); arr.forEach((p, i) => { o[3 * i] = p[0]; o[3 * i + 1] = p[1]; o[3 * i + 2] = p[2]; }); return o; };

  function fieldParams(F) {
    const R = F.R;
    return { u: F.u, vhat: F.vhat, e1: F.e1, e2: F.e2, sideDir: F.sideDir, alpha: F.alpha,
             b0: F.b0 / R, sSepMean: F.sSepMean / R, CD: F.CD, Cside: F.Cside };
  }

  function computePhase(j, i) {
    const { model, rs, farLines } = j;
    const rot = BA.orientationForSpinAxis(rs.w, rs.spec.ball_axis, rs.spec.roll_deg + 360 * i / NPH);
    const fr = model.forces(rs.vel0, rs.w, rot, true);
    const F = new BA.Field3D(fr, model.ball.R);
    const radii = farLines ? [.12, .22, .33, .45, .58, .72, .88, 1.05, 1.25, 1.5, 1.85, 2.3]
                           : [.1, .17, .25, .33, .42, .52, .63, .75, .88, 1.02, 1.18, 1.36];
    const seeds = F.seedsUpstream(radii, 16, -3.0).map(p => ({ p, k: 0 }))
      .concat(F.seedsSeparation(36, .02).map(p => ({ p, k: 1 })));
    const streams = seeds.map(s => {
      const L = F.streamline(s.p, .035, 6.5, 700), r = BA.resample(L.pts, L.sp, 70);
      return { k: s.k, pts: flat(r.pts), sp: Float32Array.from(r.sp) };
    });
    j.fields[i] = { F, fr };
    const status = fr.profile.status.filter((_, k) => k % 4 === 0);
    return {
      i, rot,
      fr: { Re: fr.Re, S: fr.S, eff: fr.eff, CD: fr.CD, CL: fr.CL, dCD: fr.dCD, C_ssw: fr.C_ssw, C_m: fr.C_m,
            vhat: fr.vhat, e1: fr.e1, e2: fr.e2, mhat: fr.mhat, thSep: fr.thSep, fMax: fr.fMax, thTrip: fr.thTrip, status },
      field: fieldParams(F), streams,
    };
  }

  function start(msg, post) {
    const p = msg.params;
    const model = new BA.Model({ air: BA.airFromConditions(p.temp, p.rh / 100, p.alt),
                                 ball: BA.makeBall({ seam_height: p.kh * 1e-3 }), Re_k_crit: p.rk });
    const rs = BA.releaseState(p.spec);
    const s = BA.pitchSummary(model, p.spec);
    job = { id: msg.id, model, rs, farLines: p.farLines, modes: p.modes, fields: [], order: [] };
    const sub = a => a.filter((_, k) => k % 3 === 0 || k === a.length - 1);
    post({ type: 'summary', id: msg.id,
      summary: { flight_time: s.flight_time, plate_speed_mph: s.plate_speed_mph, speed_loss_pct: s.speed_loss_pct,
                 ivb: s.ivb, hb: s.hb, drop: s.drop, revolutions: s.revolutions,
                 f0: { Re: s.f0.Re, S: s.f0.S, CD: s.f0.CD, dCD: s.f0.dCD, CL: s.f0.CL, mhat: s.f0.mhat, e1: s.f0.e1, vhat: s.f0.vhat },
                 traj: sub(s.traj.pos), ref: sub(s.ref.pos) },
      release: { vhat: rs.vhat, w: rs.w, V: rs.V, vel0: rs.vel0, spec: rs.spec } });
    // ---- with / without comparison --------------------------------------
    // full model            : spin + seams (the trajectory above)
    // spin, no seam effects : Magnus only            -> isolates the seam effect
    // no spin               : gravity + drag         -> isolates the spin effect
    // no spin, seams        : fixed orientation      -> seam force on a ball that
    //                         does not turn (knuckleball-like)
    const PFY = BA.PLATE_FRONT_Y;
    const noSeamModel = new BA.Model({ air: model.air, ball: model.ball, Re_k_crit: model.Re_k_crit, useSeam: false });
    const trNoSeam = BA.integrate(noSeamModel, rs.pos0, rs.vel0, rs.w, rs.rot0, { dt: 5e-4, stopY: PFY });
    const trSeamOnly = BA.integrate(model, rs.pos0, rs.vel0, [0, 0, 0], rs.rot0, { dt: 5e-4, stopY: PFY });
    const result = tr => { const hit=BA.atPlaneY(tr, PFY); return {plate:hit[1],time:hit[0],traj:sub(tr.pos)}; };
    post({ type: 'compare', id: msg.id, cmp: {
      full: result(s.traj), noSeam: result(trNoSeam),
      noSpin: result(s.ref), seamOnly: result(trSeamOnly) } });

    // separation line at 72 seam phases (every 5 deg): cheap (forces only),
    // lets the page move the separation line continuously with the ball
    const NR = 72, rings = [];
    for (let r = 0; r < NR; r++) {
      const rot = BA.orientationForSpinAxis(rs.w, rs.spec.ball_axis, rs.spec.roll_deg + 360 * r / NR);
      const fr = model.forces(rs.vel0, rs.w, rot, true);
      rings.push({ thSep: fr.thSep, fMax: fr.fMax, thTrip: fr.thTrip, C_ssw: fr.C_ssw,
                   status: fr.profile.status.filter((_, k) => k % 4 === 0) });
    }
    post({ type: 'rings', id: msg.id, rings });

    // phases, starting from the one on screen, yielding between them so a
    // newer request can cancel this one
    const first = msg.startPhase || 0;
    job.order = Array.from({ length: NPH }, (_, k) => (first + k) % NPH);
    const myId = msg.id;
    const next = () => {
      if (!job || job.id !== myId || !job.order.length) return;
      const i = job.order.shift();
      const out = computePhase(job, i);
      post({ type: 'phase', id: myId, data: out },
           out.streams.flatMap(s => [s.pts.buffer, s.sp.buffer]));
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }

  // -- instantaneous streamlines: mean field + synthetic fluctuations ---------
  function fluct(p, F, fr, t, modes) {
    const R = F.R, V = F.V, u = F.u;
    const um = F.velocity(p), W = (F.lastW || 0) * (F.lastGate || 0);
    if (W < 1e-3) return um;
    const s = BA.vec.dot(p, u);
    const env = W * (1 - Math.exp(-Math.max(s - F.sSepMean, 0) / (0.6 * R)));
    const x = BA.vec.mul(BA.vec.sub(p, BA.vec.mul(u, V * t)), 1 / R);
    let up = [0, 0, 0];
    for (const m of modes) up = BA.vec.add(up, BA.vec.mul(m.a, m.amp * Math.sin(BA.vec.dot(m.k, x) + m.ph)));
    const fS = 0.2 * V / (2 * R), rotA = t * fS * 0.6 * 2 * Math.PI;
    const sd = BA.vec.add(BA.vec.mul(fr.e1, Math.cos(rotA)), BA.vec.mul(fr.e2, Math.sin(rotA)));
    const shed = BA.vec.mul(sd, 0.12 * V * env * Math.sin(2 * Math.PI * fS * t - 2 * Math.PI * (s / R) / 4.0));
    return BA.vec.add(BA.vec.add(um, BA.vec.mul(up, 0.30 * V * env)), shed);
  }
  function inst(msg, post) {
    if (!job || job.id !== msg.id || !job.fields[msg.i]) { post({ type: 'inst', id: msg.id, none: true }); return; }
    // (msg.i is a phase index or a comparison key such as 'v_smooth')
    const { F, fr } = job.fields[msg.i], R = F.R, ds = 0.04 * R, V = F.V, modes = job.modes;
    const seeds = F.seedsSeparation(36, .02).concat(F.seedsUpstream([.1, .17, .25, .33], 12, -3.0));
    const lines = seeds.map(seed => {
      let p = seed.slice(); const pts = [BA.vec.mul(p, 1 / R)], sp = [BA.vec.norm(fluct(p, F, fr, msg.t, modes)) / V];
      const dir = q => BA.vec.unit(fluct(q, F, fr, msg.t, modes));
      for (let k = 0; k < 260; k++) {
        const k1 = dir(p), k2 = dir(BA.vec.add(p, BA.vec.mul(k1, ds / 2))), k3 = dir(BA.vec.add(p, BA.vec.mul(k2, ds / 2))), k4 = dir(BA.vec.add(p, BA.vec.mul(k3, ds)));
        p = BA.vec.add(p, BA.vec.mul(BA.vec.add(BA.vec.add(k1, BA.vec.mul(k2, 2)), BA.vec.add(BA.vec.mul(k3, 2), k4)), ds / 6));
        const r = BA.vec.norm(p); if (r < 1.004 * R) p = BA.vec.mul(p, 1.004 * R / r);
        pts.push(BA.vec.mul(p, 1 / R)); sp.push(BA.vec.norm(fluct(p, F, fr, msg.t, modes)) / V);
        if (BA.vec.dot(p, F.u) / R > 6.5 || r > 5 * R) break;
      }
      return { pts: flat(pts), sp: Float32Array.from(sp) };
    });
    post({ type: 'inst', id: msg.id, lines }, lines.flatMap(l => [l.pts.buffer, l.sp.buffer]));
  }

  // -- comparison flow fields (one instant each) -----------------------------
  //  smooth : same ball and spin but NO seams -> the boundary layer stays
  //           laminar everywhere and separates at the smooth-sphere 82 deg;
  //           drag is the subcritical smooth-sphere value
  //  noSpin : the release orientation, not turning -> seam effects only
  function variant(msg, post) {
    if (!job || job.id !== msg.id) return;
    const { model, rs } = job, C = BA.CONST;
    let fr;
    if (msg.which === 'smooth') {
      fr = model.forces(rs.vel0, rs.w, rs.rot0, true);
      fr = Object.assign({}, fr, { thSep: fr.thSep.map(() => C.theta_sep_lam), fMax: fr.fMax.map(() => 0),
        thTrip: fr.thTrip.map(() => NaN), C_ssw: 0, C_m: 0, dCD: 0.47 - fr.CD,
        profile: Object.assign({}, fr.profile, { status: fr.profile.status.map(() => 0) }) });
    } else {
      fr = model.forces(rs.vel0, [0, 0, 0], rs.rot0, true);
    }
    const F = new BA.Field3D(fr, model.ball.R);
    const seeds = F.seedsUpstream([.1, .17, .25, .33, .42, .52, .63, .75, .88, 1.02, 1.18, 1.36], 16, -3.0).map(p => ({ p, k: 0 }))
      .concat(F.seedsSeparation(36, .02).map(p => ({ p, k: 1 })));
    const streams = seeds.map(sd => { const L = F.streamline(sd.p, .035, 6.5, 700), r = BA.resample(L.pts, L.sp, 70);
      return { k: sd.k, pts: flat(r.pts), sp: Float32Array.from(r.sp) }; });
    job.fields['v_' + msg.which] = { F, fr };
    const status = fr.profile.status.filter((_, k) => k % 4 === 0);
    post({ type: 'variant', id: msg.id, which: msg.which, data: {
      i: 'v_' + msg.which, rot: rs.rot0,
      fr: { Re: fr.Re, S: fr.S, eff: fr.eff, CD: fr.CD, CL: fr.CL, dCD: fr.dCD, C_ssw: fr.C_ssw, C_m: fr.C_m,
            vhat: fr.vhat, e1: fr.e1, e2: fr.e2, mhat: fr.mhat, thSep: fr.thSep, fMax: fr.fMax, thTrip: fr.thTrip, status },
      field: fieldParams(F), streams } }, streams.flatMap(x => [x.pts.buffer, x.sp.buffer]));
  }

  function handle(msg, post) {
    if (msg.type === 'compute') start(msg, post);
    else if (msg.type === 'inst') inst(msg, post);
    else if (msg.type === 'variant') variant(msg, post);
  }

  if (inWorker) {
    self.onmessage = e => handle(e.data, (d, tr) => self.postMessage(d, tr || []));
  } else {
    root.BAWorker = { handle };
  }
})(typeof window !== 'undefined' ? window : self);
