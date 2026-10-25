/*
 * physics.js -- browser port of the baseball_aero Python package.
 *
 * Every function mirrors the Python function of the same name; the Python
 * package is the reference implementation and tools/check_port.js verifies
 * that this file reproduces its numbers. The Falkner-Skan family and laminar
 * template are constructed numerically in JavaScript by flow_tables.js.
 *
 * Units: SI everywhere.  World frame = PITCHf/x (x catcher's right, y towards
 * the mound, z up).
 */
(function (root) {
  'use strict';
  const TB = root.BA_TABLES || (typeof require !== 'undefined' ? require('./flow_tables.js') : null);
  const C = TB.const;
  const PI = Math.PI;

  // ------------------------------------------------------------ vectors --
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const n = norm(a); return n > 0 ? mul(a, 1 / n) : [0, 0, 0]; };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // ---------------------------------------------------------- quaternions --
  // [x, y, z, w], same convention as scipy.spatial.transform.Rotation
  const Q = {
    identity: () => [0, 0, 0, 1],
    fromRotvec(v) {
      const th = norm(v);
      if (th < 1e-12) return [v[0] / 2, v[1] / 2, v[2] / 2, 1];
      const s = Math.sin(th / 2) / th;
      return [v[0] * s, v[1] * s, v[2] * s, Math.cos(th / 2)];
    },
    mul(a, b) { // a * b  (apply b first, then a)
      return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    },
    apply(q, v) {
      const u = [q[0], q[1], q[2]], w = q[3];
      const t = mul(cross(u, v), 2);
      return add(add(v, mul(t, w)), cross(u, t));
    },
    normalize(q) { const n = Math.hypot(q[0], q[1], q[2], q[3]); return q.map(x => x / n); }
  };

  // ---------------------------------------------------------------- air --
  const G0 = 9.80665, RU = 8.31446261815324, MD = 0.0289652, MV = 0.01801528;
  function airFromConditions(Tc = 20, RH = 0.5, elev = 0, stationPressure = null) {
    const T = Tc + 273.15;
    const p = stationPressure != null ? stationPressure
      : 101325 * Math.pow(1 - 0.0065 * elev / 288.15, G0 * MD / (RU * 0.0065));
    const psat = 611.21 * Math.exp((18.678 - Tc / 234.5) * Tc / (257.14 + Tc));
    const pv = Math.min(clamp(RH, 0, 1) * psat, p);
    const rho = ((p - pv) * MD + pv * MV) / (RU * T);
    const mu = 1.716e-5 * Math.pow(T / 273.15, 1.5) * (273.15 + 110.4) / (T + 110.4);
    return { T, p, RH, elev, rho, mu, nu: mu / rho, a: Math.sqrt(1.4 * p / rho) };
  }

  // --------------------------------------------------------------- ball --
  function makeBall(o = {}) {
    const b = Object.assign({ mass: 0.145, diameter: 0.074, seam_height: 0.0009, seam_width: 0.004,
                              p: 3.0, spin_decay_time: 25.0 }, o);
    b.R = b.diameter / 2; b.A = PI * b.R * b.R;
    return b;
  }

  // -------------------------------------------------------------- seams --
  function seamCurve(t, p) {
    const c = Math.cos(t), s = Math.sin(t);
    const z2 = 1 - Math.pow(Math.abs(c), 2 * p) - Math.pow(Math.abs(s), 2 * p);
    return [Math.sign(c) * Math.pow(Math.abs(c), p), Math.sign(s) * Math.pow(Math.abs(s), p),
            Math.sign(Math.sin(2 * t)) * Math.sqrt(Math.max(z2, 0))];
  }
  function sampleSeam(n = 1200, p = 3) {
    const pts = [], tan = [], ds = [];
    for (let i = 0; i < n; i++) {
      const t = 2 * PI * i / n;
      const P = seamCurve(t, p);
      pts.push(P);
      tan.push(unit(sub(seamCurve(t + 1e-6, p), seamCurve(t - 1e-6, p))));
      ds.push(norm(sub(seamCurve(t + 2 * PI / n, p), P)));
    }
    return { pts, tan, ds, n };
  }
  function orientationForSpinAxis(w, ballAxis = 'z', rollDeg = 0) {
    let wh = norm(w) < 1e-12 ? [0, 0, 1] : unit(w);
    const e = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[ballAxis];
    const v = cross(e, wh), c = dot(e, wh);
    let base;
    if (norm(v) < 1e-12) base = c > 0 ? Q.identity() : Q.fromRotvec(mul(ballAxis !== 'x' ? [1, 0, 0] : [0, 0, 1], PI));
    else base = Q.fromRotvec(mul(unit(v), Math.atan2(norm(v), c)));
    return Q.mul(Q.fromRotvec(mul(wh, rollDeg * PI / 180)), base);
  }
  const advanceOrientation = (q, w, dt) => Q.normalize(Q.mul(Q.fromRotvec(mul(w, dt)), q));
  function flowBasis(vhat, hint) {
    let h = hint || [0, 0, 1];
    let e1 = sub(h, mul(vhat, dot(h, vhat)));
    if (norm(e1) < 1e-8) { h = [1, 0, 0]; e1 = sub(h, mul(vhat, dot(h, vhat))); }
    e1 = unit(e1);
    return [e1, cross(vhat, e1)];
  }

  // ------------------------------------------------- Falkner-Skan lookups --
  const FS = TB.fs;
  const nLam = FS.lam.length, etaStep = FS.eta_step, nEta = FS.fp[0].length;
  function fsIndex(lam) {
    lam = clamp(lam, FS.lam[0], FS.lam[nLam - 1]);
    let lo = 0, hi = nLam;                       // searchsorted (left) - 1
    while (lo < hi) { const m = (lo + hi) >> 1; if (FS.lam[m] < lam) lo = m + 1; else hi = m; }
    const j = clamp(lo - 1, 0, nLam - 2);
    return [j, (lam - FS.lam[j]) / (FS.lam[j + 1] - FS.lam[j])];
  }
  function velocityAt(lam, yOverTheta) {
    const [j, w] = fsIndex(lam);
    const It = FS.I_theta[j] * (1 - w) + FS.I_theta[j + 1] * w;
    const eta = clamp(yOverTheta * It, 0, (nEta - 1) * etaStep);
    const pos = Math.min(eta / etaStep, nEta - 1.0000001), i0 = Math.floor(pos), f = pos - i0;
    const row = r => FS.fp[r][i0] * (1 - f) + FS.fp[r][i0 + 1] * f;
    return clamp(row(j) * (1 - w) + row(j + 1) * w, 0, 1);
  }

  // ------------------------------------------------------ laminar template --
  const TM = TB.tmpl;
  function interp(x, xs, ys) {
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    const dx = xs[1] - xs[0];                    // uniform grid
    const i = Math.min(n - 2, Math.floor((x - xs[0]) / dx));
    const f = (x - xs[i]) / (xs[i + 1] - xs[i]);
    return ys[i] * (1 - f) + ys[i + 1] * f;
  }
  function interpGeneral(x, xs, ys) {
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] * (1 - f) + ys[hi] * f;
  }
  function thetaM(theta, V, nu, R) { return interp(theta, TM.theta, TM.C) * Math.sqrt(nu * R / V); }
  function lamAt(theta) { return interp(theta, TM.theta, TM.lam); }
  function ReK(theta, V, nu, R, k) {
    const tm = thetaM(theta, V, nu, R);
    const u = velocityAt(lamAt(theta), tm > 0 ? k / tm : 0);
    return C.K * V * Math.sin(theta) * u * k / nu;
  }
  function delta99(theta, V, nu, R) {
    const lam = lamAt(theta), [j, w] = fsIndex(lam);
    const e = FS.eta99[j] * (1 - w) + FS.eta99[j + 1] * w;
    const It = FS.I_theta[j] * (1 - w) + FS.I_theta[j + 1] * w;
    return e / It * thetaM(theta, V, nu, R);
  }

  // ------------------------------------------------------- coefficients --
  const cdBaseball = (Re, S) => {
    const ramp = 1 / (1 + Math.pow(Math.max(Re, 1) / C.cd_re_mid, C.cd_re_exp));
    return C.cd_high + (C.cd_low - C.cd_high) * ramp + C.cd_spin_k * S * S;
  };
  const clNathan = S => (S = Math.abs(S)) < 0.1 ? 1.5 * S : 0.09 + 0.6 * S;

  // ----------------------------------------------------------- separation --
  function basePressure(th) {
    const w = clamp((th - C.theta_sep_lam) / (C.theta_sep_turb - C.theta_sep_lam), 0, 1);
    return C.cp_base_lam + w * (C.cp_base_turb - C.cp_base_lam);
  }
  function _A(th) { const i2 = 0.5 * th - 0.25 * Math.sin(2 * th);
    const i4 = 0.375 * th - 0.25 * Math.sin(2 * th) + Math.sin(4 * th) / 32; return i2 - 2.25 * i4; }
  function _B(th) { return 0.5 * PI - (0.5 * th - 0.25 * Math.sin(2 * th)); }
  function stripForces(thSep, phi) {
    const n = phi.length, dphi = 2 * PI / n;
    let cd = 0, c1 = 0, c2 = 0;
    for (let j = 0; j < n; j++) {
      const th = thSep[j], s = Math.sin(th) ** 2, cpb = basePressure(th);
      cd += s / 2 - 0.5625 * s * s - cpb * s / 2;
      const g = _A(th) + cpb * _B(th);
      c1 -= g * Math.cos(phi[j]); c2 -= g * Math.sin(phi[j]);
    }
    return { cd: cd * dphi / PI, c1: c1 * dphi / PI, c2: c2 * dphi / PI };
  }
  function circularSmooth(y, width) {
    const n = y.length, dphi = 2 * PI / n, sigma = Math.max(width, 1e-9) / dphi;
    const half = Math.floor(Math.min(Math.floor(n / 2), Math.max(1, Math.ceil(3 * sigma))));
    const k = []; let ks = 0;
    for (let x = -half; x <= half; x++) { const v = Math.exp(-0.5 * (x / sigma) ** 2); k.push(v); ks += v; }
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let x = -half; x <= half; x++) s += y[((i + x) % n + n) % n] * k[x + half];
      out[i] = s / ks;
    }
    return out;
  }

  // ---------------------------------------------------------- the model --
  class Model {
    constructor(opts = {}) {
      this.air = opts.air || airFromConditions(20, 0.5, 0);
      this.ball = opts.ball || makeBall();
      this.Re_k_crit = opts.Re_k_crit || C.Re_k_crit;
      this.useSeam = opts.useSeam !== false;
      this.nPhi = 36;
      this.seam = sampleSeam(1200, this.ball.p);
      this.phi = []; for (let j = 0; j < this.nPhi; j++) this.phi.push(-PI + 2 * PI * j / this.nPhi + PI / this.nPhi);
      this._cdMean = null;
    }
    mapToFlow(rot, vhat, e1h) {
      const [e1, e2] = flowBasis(vhat, e1h);
      const S = this.seam, out = { theta: [], phi: [], eff: [], e1, e2 };
      for (let i = 0; i < S.n; i++) {
        const n = Q.apply(rot, S.pts[i]), T = Q.apply(rot, S.tan[i]);
        out.theta.push(Math.acos(clamp(dot(n, vhat), -1, 1)));
        out.phi.push(Math.atan2(dot(n, e2), dot(n, e1)));
        const ep = unit(cross(vhat, n));
        out.eff.push(Math.abs(dot(T, ep)));
      }
      return out;
    }
    separationProfile(V, rot, vhat, e1) {
      const { nu } = this.air, { R, seam_height: k } = this.ball, n = this.nPhi;
      const m = this.mapToFlow(rot, vhat, e1);
      const thLam = C.theta_sep_lam, width = C.trip_width * this.Re_k_crit;
      const fMax = new Array(n).fill(0), thTrip = new Array(n).fill(Infinity), thBlock = new Array(n).fill(Infinity);
      const status = new Array(m.theta.length);
      let exposed = 0;
      for (let i = 0; i < m.theta.length; i++) {
        const th = m.theta[i];
        const up = th > C.theta_trip_min && th < thLam;
        const Rk = ReK(th, V, nu, R, k) * m.eff[i];
        const block = lamAt(th) < C.lambda_block;
        let f = 0.5 * (1 + Math.tanh((Rk - this.Re_k_crit) / width));
        if (!(up && !block)) f = 0;
        const j = clamp(Math.floor((m.phi[i] + PI) / (2 * PI) * n), 0, n - 1);
        if (f > fMax[j]) fMax[j] = f;
        if (f > 0.25 && th < thTrip[j]) thTrip[j] = th;
        if (up && block && th < thBlock[j]) thBlock[j] = th;
        if (up) exposed += this.seam.ds[i] * R * m.eff[i] * Math.sin(th);
        status[i] = !up ? 0 : (block ? 3 : (Rk > this.Re_k_crit ? 2 : 1));
      }
      let thSep = fMax.map((f, j) => Math.min(thLam + f * (C.theta_sep_turb - thLam), thBlock[j]));
      if (C.smoothing > 0) thSep = circularSmooth(thSep, C.smoothing);
      return { thSep, fMax, thTrip: thTrip.map(x => isFinite(x) ? x : NaN), exposed, status, map: m };
    }
    cdMech(cdP, cdSeam, fMax) {
      const frac = fMax.reduce((a, b) => a + b, 0) / fMax.length;
      return cdP + C.cf_sub + frac * (C.cf_super - C.cf_sub) + cdSeam;
    }
    cdMechMean(V) {
      if (!this._cdMean) {
        // Fixed orientation quadrature nodes; forces at each node are evaluated
        // here in JavaScript. Seeded Shoemake sampling is only a fallback.
        let s = 12345; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
          t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        const rots = TB.cd_rots ? TB.cd_rots.slice() : [];
        for (let i = rots.length; i < 64; i++) { const u1 = rnd(), u2 = rnd(), u3 = rnd();
          rots.push([Math.sqrt(1 - u1) * Math.sin(2 * PI * u2), Math.sqrt(1 - u1) * Math.cos(2 * PI * u2),
                     Math.sqrt(u1) * Math.sin(2 * PI * u3), Math.sqrt(u1) * Math.cos(2 * PI * u3)]); }
        const Vs = [], vals = [];
        for (let i = 0; i < 10; i++) {
          const Vi = 15 + 5 * i; let acc = 0;
          for (const r of rots) {
            const sp = this.separationProfile(Vi, r, [1, 0, 0], [0, 0, 1]);
            const res = stripForces(sp.thSep, this.phi);
            acc += this.cdMech(res.cd, C.ridge_cd * 1.8 * sp.exposed * this.ball.seam_height / this.ball.A, sp.fMax);
          }
          Vs.push(Vi); vals.push(acc / rots.length);
        }
        this._cdMean = [Vs, vals];
      }
      return interpGeneral(V, this._cdMean[0], this._cdMean[1]);
    }
    forces(vRel, w, rot, wantProfile = false) {
      const { rho, nu } = this.air, ball = this.ball;
      const V = norm(vRel);
      if (V < 1e-6) return { force: [0, 0, 0], V: 0 };
      const vhat = mul(vRel, 1 / V), q = 0.5 * rho * ball.A * V * V, Re = V * ball.diameter / nu;
      const wPerp = sub(w, mul(vhat, dot(w, vhat))), wpm = norm(wPerp), wm = norm(w);
      let e1, e2;
      if (wpm < 1e-6) [e1, e2] = flowBasis(vhat); else { e1 = mul(wPerp, 1 / wpm); e2 = cross(vhat, e1); }
      const S = wpm * ball.R / V, eff = wm > 1e-9 ? wpm / wm : 0;
      const mc = cross(w, vhat), mhat = norm(mc) > 1e-12 ? unit(mc) : [0, 0, 0];
      const CD = cdBaseball(Re, S), CL = clNathan(S);
      let F = add(mul(vhat, -CD * q), mul(mhat, CL * q));
      const out = { V, Re, S, eff, CD, CL, vhat, e1, e2, mhat, C_ssw: 0, C_m: 0, CD_mech: 0, dCD: 0 };
      if (this.useSeam && rot) {
        const sp = this.separationProfile(V, rot, vhat, e1);
        const res = stripForces(sp.thSep, this.phi);
        out.C_ssw = res.c1;
        out.C_m = res.c2 * Math.exp(-((S / C.S_blend) ** 2));
        F = add(F, add(mul(e1, out.C_ssw * q), mul(e2, out.C_m * q)));
        const cdSeam = C.ridge_cd * 1.8 * sp.exposed * ball.seam_height / ball.A;
        out.CD_mech = this.cdMech(res.cd, cdSeam, sp.fMax);
        out.dCD = out.CD_mech - this.cdMechMean(V);
        F = sub(F, mul(vhat, out.dCD * q));
        out.thSep = sp.thSep; out.fMax = sp.fMax; out.thTrip = sp.thTrip;
        if (wantProfile) out.profile = sp;
      }
      out.force = F;
      return out;
    }
  }

  // ----------------------------------------------------------- trajectory --
  const FT = 0.3048, IN = 0.0254, MPH = 0.44704, RPM = 2 * PI / 60;
  const PLATE_FRONT_Y = 17 / 12 * FT;
  function integrate(model, pos0, vel0, w0, rot0, { dt = 5e-4, tMax = 2.0, stopY = null, stopGround = false, wind = [0, 0, 0] } = {}) {
    const m = model.ball.mass, tau = model.ball.spin_decay_time, g = [0, 0, -G0];
    let x = pos0.slice(), v = vel0.slice(), w = w0.slice(), rot = rot0 || Q.identity(), t = 0;
    const T = [0], X = [x.slice()], Vv = [v.slice()], Rq = [rot.slice()];
    const acc = (xx, vv, ww, rr) => add(mul(model.forces(sub(vv, wind), ww, rr).force, 1 / m), g);
    const nMax = Math.floor(tMax / dt);
    for (let s = 0; s < nMax; s++) {
      const wh = mul(w, Math.exp(-0.5 * dt / tau)), wn = mul(w, Math.exp(-dt / tau));
      const rh = advanceOrientation(rot, w, 0.5 * dt), rn = advanceOrientation(rot, w, dt);
      const k1v = acc(x, v, w, rot), k1x = v;
      const k2x = add(v, mul(k1v, 0.5 * dt)), k2v = acc(add(x, mul(k1x, 0.5 * dt)), k2x, wh, rh);
      const k3x = add(v, mul(k2v, 0.5 * dt)), k3v = acc(add(x, mul(k2x, 0.5 * dt)), k3x, wh, rh);
      const k4x = add(v, mul(k3v, dt)), k4v = acc(add(x, mul(k3x, dt)), k4x, wn, rn);
      x = add(x, mul(add(add(k1x, mul(k2x, 2)), add(mul(k3x, 2), k4x)), dt / 6));
      v = add(v, mul(add(add(k1v, mul(k2v, 2)), add(mul(k3v, 2), k4v)), dt / 6));
      w = wn; rot = rn; t += dt;
      T.push(t); X.push(x.slice()); Vv.push(v.slice()); Rq.push(rot.slice());
      if (stopY != null && x[1] <= stopY) break;
      if (stopGround && x[2] <= 0 && t > 0.05) break;
    }
    return { t: T, pos: X, vel: Vv, rot: Rq };
  }
  function atPlaneY(tr, y) {
    for (let i = 0; i < tr.pos.length; i++) if (tr.pos[i][1] <= y) {
      if (i === 0) return [tr.t[0], tr.pos[0], tr.vel[0]];
      const y0 = tr.pos[i - 1][1], y1 = tr.pos[i][1], f = (y0 - y) / (y0 - y1);
      const L = (a, b) => add(a, mul(sub(b, a), f));
      return [tr.t[i - 1] + f * (tr.t[i] - tr.t[i - 1]), L(tr.pos[i - 1], tr.pos[i]), L(tr.vel[i - 1], tr.vel[i])];
    }
    return null;
  }
  function spinVector(spec, vhat) {
    const ang = (spec.break_clock % 12) * 2 * PI / 12;
    let mh = add(mul([0, 0, 1], Math.cos(ang)), mul([1, 0, 0], Math.sin(ang)));
    mh = unit(sub(mh, mul(vhat, dot(mh, vhat))));
    const at = unit(cross(vhat, mh)), gr = spec.gyro_deg * PI / 180;
    const axis = unit(add(mul(at, Math.sin(gr)), mul(vhat, Math.cos(gr))));
    return mul(axis, spec.spin_rpm * RPM);
  }
  const DEFAULT_SPEC = { speed_mph: 95, spin_rpm: 2300, break_clock: 12, gyro_deg: 90, release_height_ft: 5.8,
    release_side_ft: -1.8, extension_ft: 6.0, aim_height_ft: 2.5, aim_side_ft: 0.0, ball_axis: 'z', roll_deg: 0 };
  function releaseState(spec) {
    spec = Object.assign({}, DEFAULT_SPEC, spec);
    const pos0 = [spec.release_side_ft * FT, (60.5 - spec.extension_ft) * FT, spec.release_height_ft * FT];
    const tgt = [spec.aim_side_ft * FT, PLATE_FRONT_Y, spec.aim_height_ft * FT];
    const d = unit(sub(tgt, pos0)), V = spec.speed_mph * MPH, w = spinVector(spec, d);
    return { spec, pos0, vel0: mul(d, V), vhat: d, V, w, rot0: orientationForSpinAxis(w, spec.ball_axis, spec.roll_deg) };
  }
  function pitchSummary(model, specIn, dt = 5e-4) {
    const rs = releaseState(specIn);
    const tr = integrate(model, rs.pos0, rs.vel0, rs.w, rs.rot0, { dt, stopY: PLATE_FRONT_Y });
    const ref0 = new Model({ air: model.air, ball: model.ball, Re_k_crit: model.Re_k_crit, useSeam: false });
    const ref = integrate(ref0, rs.pos0, rs.vel0, [0, 0, 0], null, { dt, stopY: PLATE_FRONT_Y });
    const [tf, pf, vf] = atPlaneY(tr, PLATE_FRONT_Y), [, pr] = atPlaneY(ref, PLATE_FRONT_Y);
    const f0 = model.forces(rs.vel0, rs.w, rs.rot0);
    return {
      traj: tr, ref, release: rs, f0,
      flight_time: tf, plate_speed_mph: norm(vf) / MPH, release_speed_mph: rs.V / MPH,
      speed_loss_pct: 100 * (1 - norm(vf) / rs.V),
      ivb: (pf[2] - pr[2]) / IN, hb: (pf[0] - pr[0]) / IN, drop: (rs.pos0[2] - pf[2]) / IN,
      plate_x_ft: pf[0] / FT, plate_z_ft: pf[2] / FT, revolutions: rs.spec.spin_rpm / 60 * tf,
    };
  }

  // ------------------------------------------------------- 3-D flow field --
  const sm3 = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  class Field3D {
    constructor(fr, R, includeMagnus = true) {
      this.R = R; this.V = fr.V; this.vhat = fr.vhat; this.u = mul(fr.vhat, -1);
      this.e1 = fr.e1; this.e2 = fr.e2; this.thSep = fr.thSep; this.CD = fr.CD + fr.dCD;
      this.phi = []; const n = fr.thSep.length;
      for (let j = 0; j < n; j++) this.phi.push(-PI + 2 * PI * j / n + PI / n);
      let side = add(mul(fr.e1, fr.C_ssw), mul(fr.e2, fr.C_m));
      if (includeMagnus) side = add(side, mul(fr.mhat, fr.CL));
      side = sub(side, mul(this.u, dot(side, this.u)));
      this.Cside = norm(side); this.sideDir = this.Cside > 1e-9 ? unit(side) : fr.e1;
      this.b0 = R * this.thSep.reduce((a, t) => a + Math.sin(t), 0) / n;
      this.alpha = clamp(this.Cside * R * R / (2 * this.b0 * this.b0), 0, 0.35);
      this.sSepMean = this.thSep.reduce((a, t) => a + (-R * Math.cos(t)), 0) / n;
      const p3 = [], t3 = [];
      for (let k = -1; k <= 1; k++) for (let j = 0; j < n; j++) { p3.push(this.phi[j] + 2 * PI * k); t3.push(this.thSep[j]); }
      this.p3 = p3; this.t3 = t3;
    }
    sepAt(phi) { return interpGeneral(phi, this.p3, this.t3); }
    velocity(p) {
      const R = this.R, V = this.V, u = this.u;
      const r = norm(p), rs = Math.max(r, R), rh = mul(p, 1 / Math.max(r, 1e-12)), ud = dot(rh, u);
      const k = 0.5 * (R / rs) ** 3;
      const upot = mul(add(u, mul(sub(u, mul(rh, 3 * ud)), k)), V);
      const s = dot(p, u), lat = sub(p, mul(u, s));
      const phi = Math.atan2(dot(lat, this.e2), dot(lat, this.e1));
      const th = this.sepAt(phi), sS = -R * Math.cos(th), rhoS = R * Math.sin(th);
      const slope0 = Math.cos(th) / Math.max(Math.sin(th), 1e-3), L = 1.6 * R, x = Math.max(s - sS, 0);
      const farOf = ss => 0.95 * this.b0 * Math.pow(1 + Math.max(ss - this.sSepMean, 0) / (C.spread * R), 1 / 3);
      let edge;
      if (x < L) { const t = x / L, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2;
        edge = h00 * rhoS + h10 * L * slope0 + h01 * farOf(sS + L); } else edge = farOf(s);
      const xb = Math.max(s - this.sSepMean, 0);
      const centre = mul(this.sideDir, -Math.tan(this.alpha) * xb);
      const zeta = norm(sub(lat, centre)) / Math.max(edge, 1e-9);
      const sig2 = (0.5 * edge) ** 2, arg = 1 - this.CD * R * R / (2 * Math.max(sig2, 1e-12));
      let A = arg > 0 ? 1 - Math.sqrt(clamp(arg, 0, 1)) : 1; A = Math.min(A, 0.95);
      A = A + (1 + C.backflow - A) * Math.exp(-((xb / (C.recirc * R)) ** 2));
      const G = Math.exp(-2 * zeta * zeta), mag = V * (1 - A * G);
      let uw = mul(add(u, mul(this.sideDir, -Math.tan(this.alpha))), mag);
      const gate = sm3((s - sS + 0.05 * R) / (0.7 * R)), W = sm3((1.9 - zeta) / 0.5) * gate;
      uw = mul(uw, 1 - Math.exp(-(rs - R) / (0.06 * R)));
      this.lastW = W; this.lastGate = gate;
      return add(mul(upot, 1 - W), mul(uw, W));
    }
    seedsUpstream(radii = [0.22, 0.45, 0.75, 1.1, 1.55, 2.1], nAz = 10, s0 = -3.2) {
      const R = this.R, q = cross(this.u, this.e1), out = [];
      radii.forEach((rr, i) => { const off = (i % 2) * PI / nAz;
        for (let j = 0; j < nAz; j++) { const a = 2 * PI * j / nAz + off;
          out.push(add(mul(this.u, s0 * R), mul(add(mul(this.e1, Math.cos(a)), mul(q, Math.sin(a))), rr * R))); } });
      return out;
    }
    seedsSeparation(n = 24, lift = 0.03) {
      const out = [];
      for (let i = 0; i < n; i++) { const a = -PI + 2 * PI * i / n, th = this.sepAt(a);
        out.push(mul(add(mul(this.vhat, Math.cos(th)), mul(add(mul(this.e1, Math.cos(a)), mul(this.e2, Math.sin(a))), Math.sin(th))), (1 + lift) * this.R)); }
      return out;
    }
    streamline(seed, dsR = 0.03, sEnd = 6.5, maxSteps = 900) {
      const R = this.R, ds = dsR * R, pts = [mul(seed, 1 / R)], sp = [norm(this.velocity(seed)) / this.V];
      let p = seed.slice(), stuck = 0;
      const dir = q => unit(this.velocity(q));
      for (let s = 0; s < maxSteps; s++) {
        const k1 = dir(p), k2 = dir(add(p, mul(k1, ds / 2))), k3 = dir(add(p, mul(k2, ds / 2))), k4 = dir(add(p, mul(k3, ds)));
        let pn = add(p, mul(add(add(k1, mul(k2, 2)), add(mul(k3, 2), k4)), ds / 6));
        const rn = norm(pn); if (rn < 1.004 * R) pn = mul(pn, 1.004 * R / rn);
        stuck = dot(sub(pn, p), this.u) < 0.1 * ds ? stuck + 1 : 0;
        p = pn; pts.push(mul(p, 1 / R)); sp.push(norm(this.velocity(p)) / this.V);
        if (dot(p, this.u) / R >= sEnd || stuck >= 60 || norm(p) > 8 * R) break;
      }
      return { pts, sp };
    }
    momentumCheck(sOverR = 6, n = 241) {
      const R = this.R, V = this.V, q = cross(this.u, this.sideDir);
      let D = 0; const a0 = -3 * R, da = 6 * R / (n - 1);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const p = add(mul(this.u, sOverR * R), add(mul(this.sideDir, a0 + i * da), mul(q, a0 + j * da)));
        const uu = dot(this.velocity(p), this.u); D += uu * (V - uu) * da * da; }
      return D / (0.5 * V * V * PI * R * R);
    }
  }
  function resample(pts, sp, n = 80) {
    const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + norm(sub(pts[i], pts[i - 1])));
    const L = d[d.length - 1], P = [], S = [];
    for (let k = 0; k < n; k++) { const t = L * k / (n - 1);
      P.push([0, 1, 2].map(c => interpGeneral(t, d, pts.map(q => q[c])))); S.push(interpGeneral(t, d, sp)); }
    return { pts: P, sp: S };
  }

  const BA = { Q, vec: { add, sub, mul, dot, cross, norm, unit }, airFromConditions, makeBall, sampleSeam, seamCurve,
    orientationForSpinAxis, advanceOrientation, flowBasis, velocityAt, ReK, delta99, thetaM, lamAt,
    cdBaseball, clNathan, stripForces, basePressure, Model, integrate, atPlaneY, spinVector, releaseState,
    pitchSummary, Field3D, resample, units: { FT, IN, MPH, RPM }, PLATE_FRONT_Y, CONST: C };
  root.BA = BA;
  if (typeof module !== 'undefined') module.exports = BA;
})(typeof window !== 'undefined' ? window : globalThis);
