'use strict';
/* 3-ball field in GlowScript (VPython's 3D engine). GlowScript + jQuery load only when the section is near the screen. */
(() => {
  const PL = window.PitchLab, P = window.PitchPhysics, $ = (id) => document.getElementById(id);
  if (!$('field')) return;
  const DEG = Math.PI / 180;
  const { sub, norm, unit } = P.vec;

  const st = { elev: 0, azim: 0, hand: 'R', aim: 'real', slow: 10, playing: false, t: 0, paused02: false };
  const COLORS = { A: [0.9, 0.28, 0.3], B: [0.18, 0.44, 0.86], C: [0.12, 0.62, 0.33] };
  const CSS = { A: '#e5484d', B: '#2f6fdb', C: '#1f9d55' };
  const balls = [{ id: 'A', on: true, src: 1 }, { id: 'B', on: true, src: 2 }, { id: 'C', on: true, src: 4 }].map((b) => ({ ...b, relH: 1.78, relS: 0.55, ext: 1.74 }));
  function loadVideo(b, i) { const p = PL.VIDEO[i]; Object.assign(b, { src: i, kph: p.kph, rpm: p.rpm, tilt: PL.parseClock(p.clock), gyro: p.gyro, name: null, typeKey: PL.TYPE_KEY[p.type] || 'fourSeam' }); }
  balls.forEach((b) => loadVideo(b, b.src));

  function simulate(b) {
    const eff = PL.effFromGyro(b.gyro);
    const res = P.simulate({ hand: st.hand, speedKmh: b.kph, rpm: b.rpm, tilt: b.tilt, efficiency: eff, release: PL.releaseOf(st.hand, b.relH, b.relS, b.ext), target: { x: 0, z: 0.76 },
      aimMode: st.aim, pitchType: b.typeKey, elevationDeg: st.elev, azimuthDeg: st.azim });
    const wh = res.spinRate > 0 ? unit(res.omega) : unit(res.transverseAxis);
    return { eff, active: b.rpm * eff, rate: res.spinRate, omegaHat: wh, axisXYZ: [-wh[1], wh[2], -wh[0]], real: { path: res.path }, ghost: { path: res.ghostPath },
      time: res.flightTime, plate: res.plate, plateKmh: res.plateSpeedKmh, vb: res.releaseMovementCm.z, hb: -res.releaseMovementCm.x,
      angles: res.angles, ground: res.ground, call: P.zoneCall(res) };
  }

  /* ---------- cards ---------- */
  const options = PL.VIDEO.map((p, i) => `<option value="${i}">${p.label}</option>`).join('') + '<option value="custom">自訂（自己輸入／從上方送來）</option>';
  const T = PL.term;
  for (const b of balls) {
    const el = document.createElement('article');
    el.className = 'fcard'; el.style.setProperty('--c', CSS[b.id]); el.id = 'fcard-' + b.id;
    el.innerHTML = `
      <div class="fc-head"><span class="fc-name"><i></i>球 ${b.id}</span><select data-k="src" aria-label="球 ${b.id} 資料來源">${options}</select><label><input type="checkbox" data-k="on" checked>顯示</label></div>
      <div class="fc-grid in">
        <div>${T('kph')}<input type="number" class="num" data-k="kph" min="60" max="170" step="0.1" inputmode="decimal"><small>kph</small></div>
        <div>${T('rpm')}<input type="number" class="num" data-k="rpm" min="0" max="3500" step="1" inputmode="numeric"><small>rpm</small></div>
        <div>${T('clock', '轉軸')}<input type="text" class="num" data-k="clock" inputmode="numeric" aria-label="轉軸幾點鐘"><span class="fc-steps"><button type="button" data-step="-0.25">−15</button><button type="button" data-step="0.25">+15</button></span></div>
        <div>${T('gyro', '陀螺')}<input type="number" class="num" data-k="gyro" min="0" max="90" step="0.1" inputmode="decimal"><small>°</small></div>
      </div>
      <input type="range" class="fc-gyro" data-k="gyroR" min="0" max="90" step="0.1" aria-label="陀螺角滑桿">
      <div class="fc-grid auto">
        <div>${T('active', '啟用中')}<b data-o="active"></b></div>
        <div>${T('eff')}<b data-o="eff"></b></div>
        <div class="span2">${T('vec')}<b data-o="vec" class="fc-vec"></b></div>
      </div>
      <div class="fc-grid out">
        <div>${T('vb', '垂直')}<b data-o="vb"></b></div>
        <div>${T('hb', '水平')}<b data-o="hb"></b></div>
        <div><span class="term plain">到本壘</span><b data-o="time"></b></div>
        <div><span class="term plain">進壘球速</span><b data-o="pkph"></b></div>
      </div>
      <div class="fc-release">
        <div><span class="term plain">出手</span><select data-k="slot" aria-label="球 ${b.id} 出手方式">${PL.SLOTS.map((s) => `<option value="${s.key}">${s.name}</option>`).join('')}<option value="custom">自訂</option></select></div>
        <div>${T('relH', '高度')}<input type="number" class="num" data-k="relH" min="0.5" max="2.3" step="0.01" inputmode="decimal"></div>
        <div>${T('relS', '左右')}<input type="number" class="num" data-k="relS" min="0" max="1.3" step="0.01" inputmode="decimal"></div>
        <div>${T('ext', '延伸')}<input type="number" class="num" data-k="ext" min="0.8" max="2.4" step="0.01" inputmode="decimal"></div>
      </div>
      <p class="fc-angle" data-o="angle"></p>
      <p class="fc-actual" data-o="actual"></p>`;
    $('f-cards').appendChild(el);
    b.el = el;
    const q = (s) => el.querySelector(s);
    b.q = q;
    q('[data-k=src]').addEventListener('change', (e) => { if (e.target.value !== 'custom') loadVideo(b, Number(e.target.value)); else b.src = 'custom'; fill(b); recompute(true); });
    q('[data-k=on]').addEventListener('change', (e) => { b.on = e.target.checked; recompute(true); });
    const custom = () => { b.src = 'custom'; b.name = null; q('[data-k=src]').value = 'custom'; };
    const num = (k, lo, hi) => q(`[data-k=${k}]`).addEventListener('input', (e) => {
      const v = Number(e.target.value), ok = e.target.value !== '' && v >= lo && v <= hi;
      e.target.classList.toggle('bad', !ok); if (!ok) return;
      b[k] = v; custom(); if (k === 'gyro') q('[data-k=gyroR]').value = v; recompute(false);
    });
    num('kph', 60, 170); num('rpm', 0, 3500); num('gyro', 0, 90);
    const relNum = (k, lo, hi) => { const el = q(`[data-k=${k}]`); el.addEventListener('input', (e) => { const v = Number(e.target.value), ok = e.target.value !== '' && v >= lo && v <= hi; e.target.classList.toggle('bad', !ok); if (!ok) return; b[k] = v; q('[data-k=slot]').value = slotOf(b); recompute(false); }); el.addEventListener('change', () => recompute(true)); };
    relNum('relH', 0.5, 2.3); relNum('relS', 0, 1.3); relNum('ext', 0.8, 2.4);
    q('[data-k=slot]').addEventListener('change', (e) => { const s = PL.SLOTS.find((x) => x.key === e.target.value); if (!s) return; Object.assign(b, { relH: s.h, relS: s.s, ext: s.e }); fill(b); recompute(true); });
    q('[data-k=gyroR]').addEventListener('input', (e) => { b.gyro = Number(e.target.value); q('[data-k=gyro]').value = b.gyro; custom(); recompute(false); });
    q('[data-k=clock]').addEventListener('input', (e) => { const t = PL.parseClock(e.target.value); e.target.classList.toggle('bad', t === null); if (t === null) return; b.tilt = t; custom(); recompute(false); });
    q('[data-k=clock]').addEventListener('blur', (e) => { e.target.value = PL.clockText(b.tilt); e.target.classList.remove('bad'); });
    el.querySelectorAll('[data-step]').forEach((btn) => btn.addEventListener('click', () => { b.tilt = (((b.tilt + Number(btn.dataset.step)) % 12) + 12) % 12; q('[data-k=clock]').value = PL.clockText(b.tilt); custom(); recompute(true); }));
    ['kph', 'rpm', 'gyro', 'gyroR', 'clock'].forEach((k) => q(`[data-k=${k}]`).addEventListener('change', () => recompute(true)));
  }
  function slotOf(b) { const s = PL.SLOTS.find((x) => Math.abs(x.h - b.relH) < .005 && Math.abs(x.s - b.relS) < .005 && Math.abs(x.e - b.ext) < .005); return s ? s.key : 'custom'; }
  function fill(b) {
    const q = b.q;
    q('[data-k=src]').value = String(b.src);
    q('[data-k=kph]').value = b.kph; q('[data-k=rpm]').value = b.rpm; q('[data-k=clock]').value = PL.clockText(b.tilt);
    q('[data-k=gyro]').value = b.gyro; q('[data-k=gyroR]').value = b.gyro;
    q('[data-k=relH]').value = b.relH.toFixed(2); q('[data-k=relS]').value = b.relS.toFixed(2); q('[data-k=ext]').value = b.ext.toFixed(2); q('[data-k=slot]').value = slotOf(b);
    b.el.querySelectorAll('.bad').forEach((x) => x.classList.remove('bad'));
  }
  balls.forEach(fill);
  function updateCard(b) {
    const r = b.res, q = (k) => b.el.querySelector(`[data-o=${k}]`);
    b.el.classList.toggle('off', !b.on);
    q('active').innerHTML = `${Math.round(r.active)}<small>rpm</small>`;
    q('eff').innerHTML = `${Math.round(r.eff * 100)}<small>%</small>`;
    q('vec').textContent = `(${r.axisXYZ.map((v) => v.toFixed(2)).join(', ')})`;
    q('vb').innerHTML = `${r.vb.toFixed(1)}<small>cm</small>`;
    q('hb').innerHTML = `${r.hb.toFixed(1)}<small>cm</small>`;
    q('time').innerHTML = `${r.time.toFixed(2)}<small>s</small>`;
    q('pkph').innerHTML = `${r.plateKmh.toFixed(1)}<small>kph</small>`;
    const sg = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
    q('angle').innerHTML = `${T('elev', '出手仰角')} ${sg(r.angles.elevation)}°　${T('azim', '偏角')} ${sg(r.angles.azimuth)}°　${st.aim === 'real' ? `（${PL.TYPE_NAME[b.typeKey]}的真實仰角）` : ''}　→ <b class="call-${r.call}">${r.call === 'ground' ? `落地（離本壘 ${r.ground.toPlate.toFixed(1)} m）` : r.call === 'strike' ? '好球' : '壞球'}</b>`;
    const act = q('actual');
    if (b.src !== 'custom') { const p = PL.VIDEO[b.src]; act.hidden = false; act.innerHTML = `PitchLab 實測：垂直 <b>${p.v}</b>、水平 <b>${p.h}</b> cm${st.hand === 'L' ? '（右投實測）' : ''}`; }
    else if (b.name) { act.hidden = false; act.textContent = `從上方 3D 球送來：${b.name}`; }
    else act.hidden = true;
  }

  /* ---------- movement chart ---------- */
  const mv = $('f-move');
  function drawMove() {
    const dpr = Math.min(2, devicePixelRatio || 1), W = mv.clientWidth, H = mv.clientHeight;
    if (!W || !H) return;
    if (mv.width !== Math.round(W * dpr) || mv.height !== Math.round(H * dpr)) { mv.width = Math.round(W * dpr); mv.height = Math.round(H * dpr); }
    const c = mv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const Rr = 70, sc = (Math.min(W, H) / 2 - 22) / Rr, cx = W / 2, cy = H / 2, X = (h) => cx + h * sc, Y = (v) => cy - v * sc;
    c.font = '10.5px sans-serif'; c.lineWidth = 1;
    for (let g = -60; g <= 60; g += 20) {
      c.strokeStyle = g ? '#e6ecee' : '#b8c4ca';
      c.beginPath(); c.moveTo(X(g), Y(-Rr)); c.lineTo(X(g), Y(Rr)); c.moveTo(X(-Rr), Y(g)); c.lineTo(X(Rr), Y(g)); c.stroke();
      c.fillStyle = '#8796a0'; c.textAlign = 'center'; if (g) { c.fillText(g, X(g), cy + 12); c.textAlign = 'right'; c.fillText(g, cx - 4, Y(g) + 3); }
    }
    c.fillStyle = '#5d7080'; c.textAlign = 'left'; c.fillText('← 一壘側', 4, cy - 6); c.textAlign = 'right'; c.fillText('三壘側 →', W - 4, cy - 6);
    c.textAlign = 'left'; c.fillText('↑ 掉得少（cm）', cx + 4, 12);
    for (const b of balls) {
      if (!b.on || !b.res) continue;
      const col = CSS[b.id], cl = (v) => Math.max(-Rr, Math.min(Rr, v));
      if (b.src !== 'custom') {
        const p = PL.VIDEO[b.src];
        c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath(); c.arc(X(cl(p.h)), Y(cl(p.v)), 8, 0, 2 * Math.PI); c.stroke();
        c.setLineDash([3, 3]); c.lineWidth = 1.2; c.beginPath(); c.moveTo(X(cl(p.h)), Y(cl(p.v))); c.lineTo(X(cl(b.res.hb)), Y(cl(b.res.vb))); c.stroke(); c.setLineDash([]);
      }
      c.fillStyle = col; c.beginPath(); c.arc(X(cl(b.res.hb)), Y(cl(b.res.vb)), 7, 0, 2 * Math.PI); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillText(b.id, X(cl(b.res.hb)), Y(cl(b.res.vb)) + 3.5); c.font = '10.5px sans-serif';
    }
  }

  /* ---------- full screen ---------- */
  const fs = PL.fullscreenLab($('field-wrap'), [
    { el: $('fcard-A'), title: '球 A', icon: '🔴', place: { left: 12, top: 60, width: 330 }, open: true },
    { el: $('fcard-B'), title: '球 B', icon: '🔵', place: { left: 354, top: 60, width: 330 }, open: false },
    { el: $('fcard-C'), title: '球 C', icon: '🟢', place: { left: 696, top: 60, width: 330 }, open: false },
    { el: $('f-move-win'), title: '位移圖', icon: '📈', place: { right: 12, bottom: 12, width: 320 }, open: true },
    { el: $('f-opts'), title: '選項', icon: '⚙', place: { right: 12, top: 60, width: 300 }, open: false }
  ], { title: '3D 球場 · 三顆球比較' });
  $('fs-field').addEventListener('click', () => { fs.toggle(true); boot(); });

  /* ---------- GlowScript scene (lazy) ---------- */
  let ready = false, booting = false, scene = null, recompute = () => { balls.forEach((b) => { b.res = simulate(b); updateCard(b); }); drawMove(); };
  recompute();
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  async function boot() {
    if (booting) return; booting = true;
    try {
      if (!window.jQuery) await loadScript('lib/glow/jquery.min.js');
      if (!window.jQuery.ui) await loadScript('lib/glow/jquery-ui.custom.min.js');
      if (typeof window.sphere !== 'function') await loadScript('lib/glow/glow.min.js');
      initScene();
      $('field-loading').hidden = true;
    } catch (e) { $('field-loading').textContent = '3D 球場載入失敗，請重新整理頁面。'; booting = false; }
  }
  if (window.IntersectionObserver) new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) boot(); }, { rootMargin: '600px' }).observe($('field'));
  else boot();
  window.addEventListener('field-send', () => { boot(); takeQueue(); });
  function takeQueue() {
    const q = window.__fieldQueue || []; window.__fieldQueue = [];
    for (const [id, p] of q) {
      const b = balls.find((x) => x.id === id); if (!b) continue;
      Object.assign(b, { kph: p.kph, rpm: p.rpm, tilt: p.tilt, gyro: +(+p.gyro).toFixed(1), src: p.video != null ? p.video : 'custom', name: p.name, on: true, typeKey: p.typeKey || b.typeKey });
      if (p.relH != null) Object.assign(b, { relH: p.relH, relS: p.relS, ext: p.ext });
      b.q('[data-k=on]').checked = true; fill(b);
    }
    if (q.length) recompute(true);
  }

  function initScene() {
    const stageEl = $('field-stage');
    window.__context = { glowscript_container: window.jQuery('#glowscript').removeAttr('id') };
    const size = () => (fs.isOn() ? [innerWidth, innerHeight] : [stageEl.clientWidth, Math.round(Math.min(620, Math.max(340, stageEl.clientWidth * 0.56)))]);
    const [w0, h0] = size();
    scene = canvas({ width: w0, height: h0, background: vec(0.62, 0.83, 0.9) });
    scene.userpan = true;
    const S = (x, y, z) => vec(x, z, -y), Sv = (a) => vec(a[0], a[2], -a[1]);
    const BOX = (x, y, z, sx, sy, sz, col) => box({ pos: S(x, y, z), size: vec(sx, sz, sy), color: col });
    box({ pos: S(0, 9, -0.06), size: vec(70, 0.1, 70), color: vec(0.33, 0.6, 0.3), shininess: 0 });
    cylinder({ pos: S(0, 0, -0.01), axis: vec(0, 0.012, 0), radius: 3.6, color: vec(0.7, 0.53, 0.36), shininess: 0 });
    cylinder({ pos: S(0, 18.44, -0.01), axis: vec(0, 0.25, 0), radius: 2.74, color: vec(0.7, 0.53, 0.36), shininess: 0 });
    BOX(0, 18.44, 0.255, 0.61, 0.15, 0.012, color.white);
    BOX(0, 0.215, 0.006, 0.43, 0.43, 0.012, color.white);
    const zx = 0.216 + P.BALL.radius, py = P.PLATE_Y;
    curve({ pos: [S(-zx, py, 0.46), S(zx, py, 0.46), S(zx, py, 1.07), S(-zx, py, 1.07), S(-zx, py, 0.46)], color: vec(1, 0.9, 0.2), radius: 0.008 });
    box({ pos: S(0, py, 0.765), size: vec(2 * zx, 0.61, 0.004), color: vec(1, 0.9, 0.2), opacity: 0.12 });
    curve({ pos: [S(-0.03, py, 0.76), S(0.03, py, 0.76)], color: color.white, radius: 0.004 });
    curve({ pos: [S(0, py, 0.73), S(0, py, 0.79)], color: color.white, radius: 0.004 });
    const figure = (x, y, base, h, col, parts) => {
      const leg = (h - base) * 0.47, torso = leg * 0.8;
      parts.push(BOX(x - 0.09, y, base + leg / 2, 0.1, 0.12, leg, col), BOX(x + 0.09, y, base + leg / 2, 0.1, 0.12, leg, col),
        BOX(x, y, base + leg + torso / 2, 0.36, 0.2, torso, col), sphere({ pos: S(x, y, base + leg + torso + 0.12), radius: 0.12, color: col }));
      return base + leg + torso;
    };
    const pc = vec(0.72, 0.5, 0.32), batterParts = [];
    const shoulder = figure(0, 18.1, 0.25, 1.85, pc, []);
    let arm = null;
    const drawArm = () => {
      const sx = st.hand === 'R' ? -0.2 : 0.2, a = balls[0], rp = PL.releaseOf(st.hand, a.relH, a.relS, a.ext), sh = [sx, 18.1, shoulder - 0.06];
      if (arm) arm.visible = false;
      arm = cylinder({ pos: S(...sh), axis: Sv(sub([rp.x, rp.y + 0.1, rp.z], sh)), radius: 0.045, color: pc });
    };
    drawArm();
    const bs = figure(-0.95, 0.05, 0, 1.75, vec(0.36, 0.38, 0.72), batterParts);
    batterParts.push(cylinder({ pos: S(-0.78, -0.12, bs - 0.05), axis: Sv([-0.12, -0.3, 0.72]), radius: 0.03, color: vec(0.55, 0.37, 0.2) }));
    const markers = [];
    for (let d = 0; d <= 18; d++) {
      markers.push(BOX(1.5, d, 0.02, 0.4, 0.03, 0.03, color.white));
      if (d % 2 === 0) markers.push(label({ pos: S(1.95, d, 0.08), text: `${d} m`, height: 11, box: false, line: false, opacity: 0, color: color.white }));
    }
    markers.forEach((m) => { m.visible = false; });

    const R_SHOW = 0.075, A_S = 4 / 13, seamBody = [];
    for (let i = 0; i <= 120; i++) { const t = 2 * Math.PI * i / 120; seamBody.push(vec((1 - A_S) * Math.cos(t) + A_S * Math.cos(3 * t), (1 - A_S) * Math.sin(t) - A_S * Math.sin(3 * t), 2 * Math.sqrt(A_S * (1 - A_S)) * Math.sin(2 * t)).norm()); }
    for (const b of balls) {
      const c = COLORS[b.id], col = vec(c[0], c[1], c[2]);
      b.g = {
        ball: sphere({ radius: R_SHOW, color: vec(0.97, 0.96, 0.93), make_trail: true, trail_color: col, trail_radius: 0.012, retain: 2000 }),
        ghost: sphere({ radius: R_SHOW * 0.8, color: vec(0.6, 0.63, 0.66), opacity: 0.55, make_trail: true, trail_color: vec(0.6, 0.63, 0.66), trail_radius: 0.005, visible: false }),
        axis: arrow({ color: col, shaftwidth: 0.022, headwidth: 0.05, headlength: 0.06 }),
        tag: label({ text: b.id, height: 12, box: false, line: false, opacity: 0, color: col, yoffset: 18 }),
        seam: null
      };
    }
    const placeSeam = (b) => {
      const g = b.g, w = Sv(b.res.omegaHat), body = vec(0, 0, 1), turn = body.cross(w), ang = Math.acos(Math.max(-1, Math.min(1, body.dot(w))));
      const pts = seamBody.map((q) => (turn.mag > 1e-9 ? q.rotate({ angle: ang, axis: turn }) : q).multiply(R_SHOW * 1.03));
      if (g.seam) g.seam.visible = false;
      g.seam = curve({ pos: pts, color: vec(0.8, 0.08, 0.15), radius: R_SHOW * 0.06 }); g.seam.origin = g.ball.pos; g.wS = w;
    };
    const at = (path, t) => { if (t >= path[path.length - 1].t) return path[path.length - 1].p; let i = 1; while (path[i].t < t) i++; const a = path[i - 1], c = path[i], u = (t - a.t) / (c.t - a.t); return [0, 1, 2].map((k) => a.p[k] + (c.p[k] - a.p[k]) * u); };
    const pose = (b, t) => {
      const g = b.g, r = b.res;
      g.ball.pos = Sv(at(r.real.path, t)); g.seam.origin = g.ball.pos; g.ghost.pos = Sv(at(r.ghost.path, t));
      g.axis.pos = g.ball.pos.sub(g.wS.multiply(0.16)); g.axis.axis = g.wS.multiply(0.32); g.tag.pos = g.ball.pos;
    };
    const vis = () => {
      for (const b of balls) {
        const g = b.g, on = b.on;
        g.ball.visible = on; if (g.seam) g.seam.visible = on; g.tag.visible = on;
        g.axis.visible = on && $('f-axis').checked; g.ghost.visible = on && $('f-ghost').checked;
        g.ball.make_trail = on && $('f-trail').checked; g.ghost.make_trail = g.ghost.visible && $('f-trail').checked;
        if (!g.ball.make_trail) g.ball.clear_trail(); if (!g.ghost.make_trail) g.ghost.clear_trail();
      }
    };
    const VIEWS = {
      batter: { pos: [-0.9, 0.12, 1.6], look: [-0.45, 16.7, 1.55] }, catcher: { pos: [0.2, -2.8, 1.35], look: [0, 10, 0.95] },
      pitcher: { pos: [-1.1, 21.8, 2.25], look: [0, 0, 0.75] }, side: { pos: [-13.5, 8.6, 1.6], look: [0, 8.6, 1.0] }, top: { pos: [0.3, 9.2, 15], look: [0, 9.2, 0] }
    };
    const setView = (k) => {
      const v = VIEWS[k];
      scene.up = k === 'top' ? vec(0, 0, -1) : vec(0, 1, 0);
      batterParts.forEach((o) => { o.visible = k !== 'batter'; });
      scene.camera.pos = S(...v.pos); scene.camera.axis = S(...v.look).sub(S(...v.pos));
      document.querySelectorAll('#f-views button').forEach((x) => x.classList.toggle('on', x.dataset.view === k));
    };
    $('f-views').addEventListener('click', (e) => { const btn = e.target.closest('button'); if (btn) setView(btn.dataset.view); });

    let maxT = 1, ended = false;
    const hud = () => {
      const L = [`t = ${st.t.toFixed(3)} s${st.slow > 1 ? `（放慢 ${st.slow} 倍）` : ''}`];
      for (const b of balls) if (b.on) { const r = b.res; L.push(`球 ${b.id}  ${st.t >= r.time ? (r.ground ? `落地：離本壘 ${r.ground.toPlate.toFixed(1)} m` : `到本壘 ${r.time.toFixed(2)} s　進壘高 ${r.plate[2].toFixed(2)} m　${r.call === 'strike' ? '好球' : '壞球'}`) : `距本壘 ${Math.max(0, at(r.real.path, st.t)[1] - P.PLATE_Y).toFixed(1)} m`}`); }
      $('f-hud').textContent = L.join('\n');
    };
    const throwAll = () => {
      st.t = 0; st.playing = true; st.paused02 = false; ended = false; $('f-pause-note').style.display = 'none'; $('f-pause').textContent = '❚❚ 暫停';
      for (const b of balls) { b.g.ball.clear_trail(); b.g.ghost.clear_trail(); pose(b, 0); b.g.ball.clear_trail(); b.g.ghost.clear_trail(); }
    };
    recompute = (replay) => {
      for (const b of balls) { b.res = simulate(b); updateCard(b); placeSeam(b); }
      drawArm();
      maxT = Math.max(0.3, ...balls.filter((b) => b.on).map((b) => b.res.time));
      vis(); drawMove();
      if (replay) throwAll(); else { balls.forEach((b) => pose(b, Math.min(st.t, b.res.time))); hud(); }
    };
    let last = performance.now();
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!st.playing) return;
      const t0 = st.t; let t1 = t0 + dt / st.slow;
      if ($('f-pause02').checked && !st.paused02 && t0 < 0.2 && t1 >= 0.2) { t1 = 0.2; st.paused02 = true; st.playing = false; $('f-pause-note').style.display = 'block'; $('f-pause').textContent = '▶ 繼續'; }
      st.t = t1;
      for (const b of balls) {
        const r = b.res, sd = Math.max(0, Math.min(t1, r.time) - Math.min(t0, r.time));
        if (sd > 0 && r.rate > 0) b.g.seam.rotate({ angle: r.rate * sd, axis: b.g.wS, origin: b.g.ball.pos });
        pose(b, Math.min(t1, r.time));
      }
      hud();
      if (st.t >= maxT + 0.05) { st.playing = false; ended = true; }
    };
    $('f-play').addEventListener('click', throwAll);
    $('f-pause').addEventListener('click', () => {
      if (ended) { throwAll(); return; }
      st.playing = !st.playing; if (st.playing) $('f-pause-note').style.display = 'none';
      $('f-pause').textContent = st.playing ? '❚❚ 暫停' : '▶ 繼續';
    });
    $('f-slow').addEventListener('change', (e) => { st.slow = Number(e.target.value); hud(); });
    ['f-trail', 'f-axis', 'f-ghost'].forEach((id) => $(id).addEventListener('change', vis));
    $('f-markers').addEventListener('change', (e) => markers.forEach((m) => { m.visible = e.target.checked; }));
    $('f-hand').addEventListener('change', (e) => { st.hand = e.target.value; drawArm(); recompute(true); });
    $('f-aim').addEventListener('change', (e) => {
      if (e.target.value === 'manual') { const a = balls[0].res.angles; st.elev = +a.elevation.toFixed(2); st.azim = +a.azimuth.toFixed(2); $('f-elev').value = st.elev; $('f-azim').value = st.azim; }
      st.aim = e.target.value; $('f-manual').hidden = st.aim !== 'manual'; recompute(true);
    });
    for (const [k, id, lo, hi] of [['elev', 'f-elev', -10, 15], ['azim', 'f-azim', -8, 8]]) $(id).addEventListener('input', (e) => { const v = Number(e.target.value), ok = e.target.value !== '' && v >= lo && v <= hi; e.target.classList.toggle('bad', !ok); if (ok) { st[k] = v; recompute(false); } });
    ['f-elev', 'f-azim'].forEach((id) => $(id).addEventListener('change', () => recompute(true)));
    const resize = () => { const [w, h] = size(); scene.width = w; scene.height = h; };
    window.addEventListener('resize', () => { resize(); drawMove(); });
    setView('catcher');
    ready = true;
    takeQueue();
    recompute(true);
    requestAnimationFrame(frame);
    window.__field = { st, balls, setView, scene, recompute, fs };
  }
  window.addEventListener('resize', drawMove);
  if (window.ResizeObserver) new ResizeObserver(drawMove).observe(mv);
  void ready;
})();
