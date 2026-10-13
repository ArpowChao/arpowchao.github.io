'use strict';
/* GlowScript (VPython's 3D engine) rendering of the same pitch model as the Python program on this page. */
(() => {
  const P = window.PitchPhysics;
  const $ = (id) => document.getElementById(id);
  const st = { hand: 'R', key: 'fourSeam', speedKmh: 152, rpm: 2300, tilt: 1, efficiency: 0.8, seams: 'four', slow: 8 };
  const tiltText = (h) => { let H = Math.floor(h + 1e-9), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return `${H % 12 || 12}:${String(M).padStart(2, '0')}`; };
  const presetFor = (k) => { const p = P.PRESETS[k]; return st.hand === 'L' ? { ...p, tilt: (12 - p.tilt) % 12 } : p; };

  // ---------- GlowScript scene ----------
  window.__context = { glowscript_container: $('glowscript') && window.jQuery('#glowscript').removeAttr('id') };
  const wrap = $('glow-wrap');
  const W = () => wrap.clientWidth, H = () => Math.round(Math.min(560, Math.max(320, wrap.clientWidth * 0.6)));
  const scene = canvas({ width: W(), height: H(), background: vec(0.06, 0.11, 0.15), range: 5 });
  const S = (x, y, z) => vec(x, z, -y);              // physics (x, y→mound, z↑) → screen (x, y↑, z→viewer)
  const Sv = (a) => vec(a[0], a[2], -a[1]);
  const CAMS = {
    behind: { center: S(0, 3.2, 0.95), forward: vec(0, -0.12, -1), range: 2.7 },
    side: { center: S(0, 8.6, 0.9), forward: vec(1, -0.1, 0.02), range: 5.8 },
    pitcher: { center: S(0.2, 14, 1.1), forward: vec(-0.02, -0.28, 1), range: 3.4 },
    top: { center: S(0, 9, 0.3), forward: vec(0.001, -1, -0.35), range: 7 }
  };
  function setCam(k) { const c = CAMS[k]; scene.center = c.center; scene.forward = c.forward.norm(); scene.range = c.range; }

  box({ pos: S(0, 9, -0.03), size: vec(9, 0.04, 22), color: vec(0.28, 0.45, 0.30), shininess: 0 });
  cylinder({ pos: S(0, 18.44, -0.02), axis: vec(0, 0.22, 0), radius: 2.7, color: vec(0.62, 0.48, 0.32), shininess: 0 });
  box({ pos: S(0, 18.44, 0.22), size: vec(0.61, 0.03, 0.15), color: color.white });
  box({ pos: S(0, 0.215, 0.005), size: vec(0.43, 0.01, 0.43), color: color.white });
  const zx = 0.216 + P.BALL.radius, py = P.PLATE_Y;
  curve({ pos: [S(-zx, py, 0.46), S(zx, py, 0.46), S(zx, py, 1.07), S(-zx, py, 1.07), S(-zx, py, 0.46)], color: color.white, radius: 0.008 });

  const R_SHOW = 0.11;
  const ball = sphere({ radius: R_SHOW, color: color.white, make_trail: true, trail_color: vec(1, 0.5, 0.15), trail_radius: 0.012 });
  const ghost = sphere({ radius: R_SHOW * 0.8, color: vec(0.6, 0.65, 0.7), opacity: 0.5, make_trail: true, trail_color: vec(0.6, 0.65, 0.7), trail_radius: 0.006 });
  const axisArrow = arrow({ color: vec(1, 0.8, 0.2), shaftwidth: 0.02 });
  const forceArrow = arrow({ color: vec(1, 0.45, 0.1), shaftwidth: 0.03 });
  const A_S = 4 / 13, seamBody = [];
  for (let i = 0; i <= 120; i++) {
    const t = 2 * Math.PI * i / 120;
    seamBody.push(vec((1 - A_S) * Math.cos(t) + A_S * Math.cos(3 * t), (1 - A_S) * Math.sin(t) - A_S * Math.sin(3 * t), 2 * Math.sqrt(A_S * (1 - A_S)) * Math.sin(2 * t)).norm());
  }
  let seam = null;

  // ---------- pitch ----------
  let res = null, tSim = 0, wS = vec(0, 1, 0), wRate = 0, last = performance.now(), flying = false;
  const at = (path, t) => {
    if (t >= path[path.length - 1].t) return path[path.length - 1].p;
    let i = 1; while (path[i].t < t) i++;
    const a = path[i - 1], b = path[i], u = (t - a.t) / (b.t - a.t);
    return [0, 1, 2].map((k) => a.p[k] + (b.p[k] - a.p[k]) * u);
  };
  function throwPitch() {
    res = P.simulate({ hand: st.hand, speedKmh: st.speedKmh, rpm: st.rpm, tilt: st.tilt, efficiency: st.efficiency });
    wRate = res.spinRate;
    wS = wRate > 0 ? Sv(res.omega).norm() : vec(0, 1, 0);
    tSim = 0; flying = true;
    ball.clear_trail(); ghost.clear_trail();
    ball.pos = Sv(res.path[0].p); ghost.pos = Sv(res.ghostPath[0].p);
    // seam curve with the four-/two-seam axis turned onto the spin axis
    const bodyAxis = st.seams === 'four' ? vec(0, 0, 1) : vec(-1, 1, 0).norm();
    const turnAxis = bodyAxis.cross(wS), turnAngle = Math.acos(Math.max(-1, Math.min(1, bodyAxis.dot(wS))));
    const pts = seamBody.map((q) => (turnAxis.mag > 1e-9 ? q.rotate({ angle: turnAngle, axis: turnAxis }) : q).multiply(R_SHOW * 1.02));
    if (seam) seam.visible = false;
    seam = curve({ pos: pts, color: vec(0.8, 0.08, 0.15), radius: R_SHOW * 0.05 });
    seam.origin = ball.pos;
    axisArrow.visible = wRate > 0;
    const m = res.releaseMovementCm;
    $('glow-result').textContent = `旋轉造成的位移（捕手視角）\n水平 ${Math.abs(m.x).toFixed(0)} cm　垂直 ${m.z >= 0 ? '+' : '−'}${Math.abs(m.z).toFixed(0)} cm\n飛行時間 ${res.flightTime.toFixed(3)} s`;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (!res || !flying) return;
    const step = dt / st.slow;
    tSim += step;
    ball.pos = Sv(at(res.path, tSim)); ghost.pos = Sv(at(res.ghostPath, tSim));
    seam.origin = ball.pos;
    if (wRate > 0) {
      seam.rotate({ angle: wRate * step, axis: wS, origin: ball.pos });
      axisArrow.pos = ball.pos.sub(wS.multiply(R_SHOW * 1.8)); axisArrow.axis = wS.multiply(R_SHOW * 3.6);
    }
    if (res.magnusN > 0.01) {
      const f = Sv(res.magnusDirection).norm();
      forceArrow.visible = true; forceArrow.pos = ball.pos.add(f.multiply(R_SHOW)); forceArrow.axis = f.multiply(R_SHOW * (1 + 3 * res.magnusOverWeight));
    } else forceArrow.visible = false;
    if (tSim > Math.max(res.flightTime, res.path[res.path.length - 1].t) + 0.02) flying = false;
  }

  // ---------- controls ----------
  function sync() {
    $('vp-speed').value = st.speedKmh; $('vp-rpm').value = st.rpm; $('vp-tilt').value = st.tilt; $('vp-eff').value = Math.round(st.efficiency * 100);
    $('vp-speed-out').textContent = `${st.speedKmh} km/h`; $('vp-rpm-out').textContent = `${st.rpm} rpm`;
    $('vp-tilt-out').textContent = tiltText(st.tilt); $('vp-eff-out').textContent = `${Math.round(st.efficiency * 100)} %`;
  }
  function applyPreset(k) {
    const p = presetFor(k);
    Object.assign(st, { key: k, speedKmh: p.speedKmh, rpm: p.rpm, tilt: p.tilt, efficiency: p.efficiency, seams: p.seams });
    $('vp-preset').value = k; sync(); throwPitch();
  }
  const sel = $('vp-preset');
  for (const [k, p] of Object.entries(P.PRESETS)) { const o = document.createElement('option'); o.value = k; o.textContent = p.name; sel.appendChild(o); }
  sel.addEventListener('change', () => applyPreset(sel.value));
  const bind = (id, key, f) => $(id).addEventListener('input', (e) => { st[key] = f(Number(e.target.value)); sync(); });
  bind('vp-speed', 'speedKmh', (v) => v); bind('vp-rpm', 'rpm', (v) => v); bind('vp-tilt', 'tilt', (v) => v); bind('vp-eff', 'efficiency', (v) => v / 100);
  ['vp-speed', 'vp-rpm', 'vp-tilt', 'vp-eff'].forEach((id) => $(id).addEventListener('change', throwPitch));
  $('vp-slow').addEventListener('change', (e) => { st.slow = Number(e.target.value); });
  $('vp-cam').addEventListener('change', (e) => setCam(e.target.value));
  $('vp-throw').addEventListener('click', throwPitch);
  document.querySelectorAll('[data-hand]').forEach((b) => b.addEventListener('click', () => {
    st.hand = b.dataset.hand;
    document.querySelectorAll('[data-hand]').forEach((x) => x.classList.toggle('active', x === b));
    applyPreset(st.key);
  }));
  window.addEventListener('resize', () => { scene.width = W(); scene.height = H(); });

  // Python source + copy
  fetch('pitch_spin_vpython.py').then((r) => r.text()).then((t) => { $('code').textContent = t; }).catch(() => { $('code').textContent = '請用「下載 .py」取得程式碼。'; });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('code').textContent); $('copy').textContent = '已複製 ✓'; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($('code')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $('copy').textContent = '已選取，請按 Ctrl+C'; }
    setTimeout(() => { $('copy').textContent = '複製程式碼'; }, 2000);
  });

  setCam('behind');
  applyPreset('fourSeam');
  requestAnimationFrame(frame);
  window.__vp = { st, applyPreset, throwPitch, scene };
})();
