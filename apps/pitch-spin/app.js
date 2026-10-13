'use strict';
(() => {
  const P = window.PitchPhysics, T = window.THREE;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DEG = Math.PI / 180;

  const state = { hand: 'R', preset: 'fourSeam', speedKmh: 152, rpm: 2300, tilt: 1, efficiency: 0.8, seams: 'four', view: 'catcher', slow: 40, result: null, presetResults: {} };

  // ---------- helpers ----------
  const tiltText = (h) => { let H = Math.floor(h + 1e-9), M = Math.round((h - H) * 60); if (M === 60) { H += 1; M = 0; } H = H % 12 || 12; return `${H}:${String(M).padStart(2, '0')}`; };
  const presetFor = (key, hand) => {
    const p = P.PRESETS[key];
    return hand === 'L' ? { ...p, tilt: (12 - p.tilt) % 12, observed: [-p.observed[0], p.observed[1]] } : p;
  };
  const cfg = () => ({ hand: state.hand, speedKmh: state.speedKmh, rpm: state.rpm, tilt: state.tilt, efficiency: state.efficiency });
  // physics (x: catcher's right, y: toward mound, z: up) → three.js (X right, Y up, Z toward catcher)
  const toThree = (v) => new T.Vector3(v[0], v[2], -v[1]);

  // ---------- 3D baseball ----------
  const canvas = $('ball-canvas');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.1, 100);
  scene.add(new T.HemisphereLight(0xffffff, 0x2b3a46, 1.15));
  const key = new T.DirectionalLight(0xffffff, 1.9); key.position.set(3, 4, 5); scene.add(key);
  const rim = new T.DirectionalLight(0x9fc4ff, .6); rim.position.set(-4, 1, -3); scene.add(rim);

  const SEAM_A = 4 / 13;
  const seamAt = (t) => new T.Vector3((1 - SEAM_A) * Math.cos(t) + SEAM_A * Math.cos(3 * t), (1 - SEAM_A) * Math.sin(t) - SEAM_A * Math.sin(3 * t), 2 * Math.sqrt(SEAM_A * (1 - SEAM_A)) * Math.sin(2 * t)).normalize();
  // Body-frame axes that give 4 / 2 seam crossings per revolution for this seam curve.
  const BODY_AXIS = { four: new T.Vector3(0, 0, 1), two: new T.Vector3(-1, 1, 0).normalize() };

  function leatherTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = '#f3eee1'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(150,135,110,${Math.random() * .08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
    const tex = new T.CanvasTexture(c); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(3, 2);
    return tex;
  }

  const ball = new T.Group();
  ball.add(new T.Mesh(new T.SphereGeometry(1, 72, 54), new T.MeshStandardMaterial({ color: 0xffffff, map: leatherTexture(), roughness: .78, metalness: 0 })));
  (function buildSeams() {
    const N = 2400, pts = [], cum = [0];
    for (let i = 0; i < N; i++) pts.push(seamAt(i / N * Math.PI * 2));
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + pts[i % N].distanceTo(pts[i - 1]));
    const curve = new T.CatmullRomCurve3(pts.filter((_, i) => i % 6 === 0).map((p) => p.clone().multiplyScalar(1.002)), true);
    ball.add(new T.Mesh(new T.TubeGeometry(curve, 600, .011, 6, true), new T.MeshStandardMaterial({ color: 0xcfc4ab, roughness: .9 })));
    const stitches = 108, arms = new T.InstancedMesh(new T.BoxGeometry(.11, .026, .024), new T.MeshStandardMaterial({ color: 0xc4162b, roughness: .55 }), stitches * 2);
    const total = cum[N], m = new T.Matrix4();
    let j = 0;
    for (let s = 0; s < stitches; s++) {
      const target = (s + .5) / stitches * total;
      while (cum[j + 1] < target) j++;
      const p = pts[j % N], next = pts[(j + 1) % N], prev = pts[(j - 1 + N) % N];
      const tan = next.clone().sub(prev).normalize(), n = p.clone().normalize(), b = new T.Vector3().crossVectors(n, tan).normalize();
      for (const side of [1, -1]) {
        const dir = b.clone().multiplyScalar(side).addScaledVector(tan, .55).normalize();
        const y = new T.Vector3().crossVectors(n, dir).normalize();
        const center = p.clone().multiplyScalar(1.006).addScaledVector(dir, .052);
        m.makeBasis(dir, y, n); m.setPosition(center);
        arms.setMatrixAt(s * 2 + (side > 0 ? 0 : 1), m);
      }
    }
    ball.add(arms);
  })();
  scene.add(ball);

  function makeArrow(color, radius) {
    const g = new T.Group(), mat = new T.MeshStandardMaterial({ color, roughness: .4, emissive: color, emissiveIntensity: .25 });
    const shaft = new T.Mesh(new T.CylinderGeometry(radius, radius, 1, 16), mat);
    const head = new T.Mesh(new T.ConeGeometry(radius * 3, radius * 8, 20), mat);
    g.add(shaft, head); g.userData = { shaft, head, radius };
    return g;
  }
  function setArrow(g, origin, dir, length) {
    const { shaft, head, radius } = g.userData, h = radius * 8, L = Math.max(length - h, .01);
    g.position.copy(origin);
    g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize());
    shaft.scale.set(1, L, 1); shaft.position.set(0, L / 2, 0);
    head.position.set(0, L + h / 2, 0);
  }
  const axisArrow = makeArrow(0xf5c542, .02), magnusArrow = makeArrow(0xef7a2c, .03), velArrow = makeArrow(0x6fa8ff, .025);
  scene.add(axisArrow, magnusArrow, velArrow);

  // airflow streaks past the ball (relative wind = −v)
  const streakCount = 70, streakGeo = new T.BufferGeometry(), streakPos = new Float32Array(streakCount * 6), streakSeed = [];
  for (let i = 0; i < streakCount; i++) streakSeed.push({ a: Math.random() * Math.PI * 2, r: 1.15 + Math.random() * 1.1, s: Math.random() });
  streakGeo.setAttribute('position', new T.BufferAttribute(streakPos, 3));
  const streaks = new T.LineSegments(streakGeo, new T.LineBasicMaterial({ color: 0x9fb8c8, transparent: true, opacity: .35 }));
  scene.add(streaks);

  // orbit camera
  const orbit = { az: 0, el: 6 * DEG, r: 6.2 };
  const VIEWS = { catcher: [0, 6], pitcher: [180, 8], side: [-90, 6] };
  function placeCamera() {
    const { az, el, r } = orbit;
    camera.position.set(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
    camera.lookAt(0, 0, 0);
  }
  function setView(v) {
    state.view = v; const [az, el] = VIEWS[v]; orbit.az = az * DEG; orbit.el = el * DEG; placeCamera();
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, az: orbit.az, el: orbit.el }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit.az = drag.az - (e.clientX - drag.x) * .008;
    orbit.el = clamp(drag.el + (e.clientY - drag.y) * .008, -1.2, 1.2);
    placeCamera();
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('active'));
  });
  ['pointerup', 'pointercancel'].forEach((t) => canvas.addEventListener(t, () => { drag = null; }));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); orbit.r = clamp(orbit.r * (1 + Math.sign(e.deltaY) * .08), 3.6, 11); placeCamera(); }, { passive: false });

  function resize3D() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w < 520 ? 40 : 32; camera.updateProjectionMatrix();
  }

  let spinAngle = 0, q0 = new T.Quaternion(), omegaHat = new T.Vector3(0, 1, 0), omegaRate = 0, vHat = new T.Vector3(0, 0, 1);
  function updateBallPose() {
    const r = state.result;
    vHat = toThree(r.v0).normalize();
    omegaRate = r.spinRate;
    omegaHat = omegaRate > 0 ? toThree(r.omega).normalize() : new T.Vector3(0, 1, 0);
    q0.setFromUnitVectors(BODY_AXIS[state.seams], omegaHat);
    axisArrow.visible = omegaRate > 0;
    setArrow(axisArrow, omegaHat.clone().multiplyScalar(-1.75), omegaHat, 3.65);
    const mDir = toThree(r.magnusDirection);
    magnusArrow.visible = r.magnusN > .01;
    if (magnusArrow.visible) setArrow(magnusArrow, mDir.clone().multiplyScalar(1.04), mDir, .35 + 1.6 * r.magnusOverWeight);
    setArrow(velArrow, vHat.clone().multiplyScalar(1.04), vHat, 1.0);
    const rps = state.rpm / 60;
    $('stage-note').textContent = state.slow ? `實際每秒 ${rps.toFixed(0)} 圈，畫面放慢 ${state.slow} 倍　·　拖曳可轉動視角` : `已暫停（實際每秒 ${rps.toFixed(0)} 圈）　·　拖曳可轉動視角`;
  }

  let lastT = performance.now(), streakPhase = 0;
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    if (state.slow) spinAngle += omegaRate * dt / state.slow;
    const qs = new T.Quaternion().setFromAxisAngle(omegaHat, spinAngle);
    ball.quaternion.copy(qs.multiply(q0));
    // streaks: move along −v̂ (relative wind), on a cylinder around the flight line
    if (state.slow) streakPhase += dt * 1.2 * 40 / state.slow;
    const up = Math.abs(vHat.y) < .9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
    const e1 = new T.Vector3().crossVectors(vHat, up).normalize(), e2 = new T.Vector3().crossVectors(vHat, e1).normalize();
    for (let i = 0; i < streakCount; i++) {
      const s = streakSeed[i], u = ((s.s + streakPhase) % 1) * 9 - 4.5; // along −v
      const base = e1.clone().multiplyScalar(Math.cos(s.a) * s.r).addScaledVector(e2, Math.sin(s.a) * s.r);
      const p1 = base.clone().addScaledVector(vHat, -u), p2 = base.clone().addScaledVector(vHat, -u - .45);
      streakPos.set([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z], i * 6);
    }
    streakGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
    drawPlate(now);
  }

  // ---------- catcher's-view pitch path ----------
  const plateCanvas = $('plate-canvas'), pctx = plateCanvas.getContext('2d');
  let pitchStart = performance.now();
  const PLAYBACK = 4;
  function setupCanvas(c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w, h };
  }
  function drawPlate(now) {
    const r = state.result; if (!r) return;
    const { ctx, w, h } = setupCanvas(plateCanvas);
    const cam = { x: 0, y: -1.3, z: .85 }, f = h * 1.55, cx = w / 2, cy = h * .48;
    const proj = (p) => { const d = p[1] - cam.y; return { x: cx + f * (p[0] - cam.x) / d, y: cy - f * (p[2] - cam.z) / d, s: f / d }; };
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#eef3f4'); g.addColorStop(1, '#dfe8e3');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // ground horizon + mound
    const horizon = proj([0, 60, 0]).y;
    ctx.fillStyle = '#d6e2d6'; ctx.fillRect(0, horizon, w, h - horizon);
    const mound = proj([0, 18.4, 0]); ctx.fillStyle = '#cbb89a'; ctx.beginPath(); ctx.ellipse(mound.x, mound.y, mound.s * 2.7, mound.s * .5, 0, 0, Math.PI * 2); ctx.fill();
    // home plate
    const hp = [[-.216, .43, 0], [.216, .43, 0], [.216, .216, 0], [0, 0, 0], [-.216, .216, 0]].map(proj);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); hp.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.fill();
    // strike zone at the front of the plate (ball-edge rule widens it by one radius)
    const zx = .216 + P.BALL.radius, zb = .46, zt = 1.07;
    const a = proj([-zx, P.PLATE_Y, zt]), b = proj([zx, P.PLATE_Y, zb]);
    ctx.strokeStyle = '#1f314088'; ctx.lineWidth = 1.5; ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeStyle = '#1f314022'; ctx.lineWidth = 1; ctx.beginPath();
    for (const k of [1, 2]) { const x = a.x + (b.x - a.x) * k / 3, y = a.y + (b.y - a.y) * k / 3; ctx.moveTo(x, a.y); ctx.lineTo(x, b.y); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); }
    ctx.stroke();
    // paths
    const drawPath = (path, color, dash, width) => {
      ctx.save(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      path.forEach((pt, i) => { const q = proj(pt.p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke(); ctx.restore();
    };
    drawPath(r.ghostPath, '#93a1a9', [4, 4], 1.4);
    drawPath(r.path, '#ef7a2c', [], 2);
    // animated balls
    const tNow = ((now - pitchStart) / 1000) / PLAYBACK, T1 = r.flightTime;
    const at = (path, t) => { if (t >= path[path.length - 1].t) return path[path.length - 1].p; let i = 1; while (path[i].t < t) i++; const A = path[i - 1], B = path[i], u = (t - A.t) / (B.t - A.t); return [0, 1, 2].map((k) => A.p[k] + (B.p[k] - A.p[k]) * u); };
    const tt = Math.min(tNow, T1);
    for (const [path, color] of [[r.ghostPath, '#aab6bd'], [r.path, '#ef7a2c']]) {
      const q = proj(at(path, tt)), rad = Math.max(2, q.s * P.BALL.radius);
      ctx.fillStyle = color; ctx.globalAlpha = path === r.path ? 1 : .7;
      ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      if (path === r.path) { ctx.strokeStyle = '#8a3c10'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    if (tNow >= T1) {
      const qg = proj(r.ghostPlate), qr = proj(r.plate);
      ctx.strokeStyle = '#c4472f'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(qg.x, qg.y); ctx.lineTo(qr.x, qr.y); ctx.stroke(); ctx.setLineDash([]);
      const d = Math.hypot(r.releaseMovementCm.x, r.releaseMovementCm.z);
      ctx.fillStyle = '#1f3140'; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`旋轉讓球偏了 ${d.toFixed(0)} 公分`, 10, h - 12);
    }
    if (tNow > T1 + 1.6) pitchStart = now; // loop
    ctx.fillStyle = '#5d7080'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(state.hand === 'R' ? '右投（從三壘側出手）' : '左投（從一壘側出手）', w - 10, 16);
  }

  // ---------- movement chart ----------
  function drawMovement() {
    const r = state.result; if (!r) return;
    const { ctx, w, h } = setupCanvas($('move-canvas'));
    const R = 70, pad = 24, cx = w / 2, cy = h / 2, s = Math.min(w, h) / 2 / (R + 8) * .95;
    const X = (v) => cx + v * s, Y = (v) => cy - v * s;
    ctx.fillStyle = '#f7f9f9'; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1; ctx.font = '10px sans-serif'; ctx.fillStyle = '#8796a0'; ctx.textAlign = 'center';
    for (let v = -60; v <= 60; v += 20) {
      ctx.strokeStyle = v === 0 ? '#b8c4ca' : '#e6ecee';
      ctx.beginPath(); ctx.moveTo(X(v), Y(-R)); ctx.lineTo(X(v), Y(R)); ctx.moveTo(X(-R), Y(v)); ctx.lineTo(X(R), Y(v)); ctx.stroke();
      if (v) { ctx.fillText(String(v), X(v), cy + 12); ctx.textAlign = 'right'; ctx.fillText(String(v), cx - 4, Y(v) + 3); ctx.textAlign = 'center'; }
    }
    ctx.fillStyle = '#5d7080'; ctx.font = '10.5px sans-serif';
    const armLeft = state.hand === 'R';
    ctx.textAlign = 'left'; ctx.fillText(`← 三壘側${armLeft ? '（手臂側）' : '（手套側）'}`, 4, h - 6);
    ctx.textAlign = 'right'; ctx.fillText(`一壘側${armLeft ? '（手套側）' : '（手臂側）'} →`, w - 4, h - 6);
    ctx.textAlign = 'left'; ctx.fillText('↑ 往上', cx + 4, 12);
    // other pitches (model)
    for (const [k, res] of Object.entries(state.presetResults)) {
      const m = res.releaseMovementCm, isSel = k === state.preset;
      ctx.fillStyle = isSel ? '#9aa9b1' : '#c3ced3';
      ctx.beginPath(); ctx.arc(X(m.x), Y(m.z), 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7d8d96'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(P.PRESETS[k].name.replace(/（.*）/, ''), X(m.x) + 6, Y(m.z) + 3);
    }
    if (state.preset) {
      const o = presetFor(state.preset, state.hand).observed;
      ctx.strokeStyle = '#c4472f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(o[0]), Y(o[1]), 6, 0, Math.PI * 2); ctx.stroke();
    }
    const m = r.releaseMovementCm;
    ctx.strokeStyle = '#ef7a2c88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(X(m.x), Y(m.z)); ctx.stroke();
    ctx.fillStyle = '#ef7a2c'; ctx.beginPath(); ctx.arc(X(clamp(m.x, -R, R)), Y(clamp(m.z, -R, R)), 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // ---------- clock control ----------
  const clock = $('clock');
  (function buildClock() {
    let svg = '<circle r="54" fill="#f7f9f9" stroke="#cfd9dd" stroke-width="1.5"/>';
    for (let i = 0; i < 48; i++) { const a = i * 7.5 * DEG, r1 = i % 4 ? 49 : 45; svg += `<line x1="${(Math.sin(a) * r1).toFixed(2)}" y1="${(-Math.cos(a) * r1).toFixed(2)}" x2="${(Math.sin(a) * 52).toFixed(2)}" y2="${(-Math.cos(a) * 52).toFixed(2)}" stroke="#a9b6bc" stroke-width="${i % 4 ? .6 : 1.4}"/>`; }
    for (const [n, a] of [[12, 0], [3, 90], [6, 180], [9, 270]]) svg += `<text x="${(Math.sin(a * DEG) * 36).toFixed(1)}" y="${(-Math.cos(a * DEG) * 36 + 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="#5d7080" font-family="sans-serif">${n}</text>`;
    svg += '<g id="clock-hand"><line x1="0" y1="0" x2="0" y2="-40" stroke="#c4472f" stroke-width="3" stroke-linecap="round"/><path d="M0 -50 L-6 -38 L6 -38 Z" fill="#c4472f"/></g><circle r="4" fill="#1f3140"/>';
    clock.innerHTML = svg;
  })();
  function clockFromPointer(e) {
    const rect = clock.getBoundingClientRect(), x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2;
    let a = Math.atan2(x, -y) / DEG; if (a < 0) a += 360;
    setParam('tilt', Math.round(a / 30 * 4) / 4 % 12);
  }
  let clockDrag = false;
  clock.addEventListener('pointerdown', (e) => { clockDrag = true; clock.setPointerCapture(e.pointerId); clockFromPointer(e); });
  clock.addEventListener('pointermove', (e) => { if (clockDrag) clockFromPointer(e); });
  ['pointerup', 'pointercancel'].forEach((t) => clock.addEventListener(t, () => { clockDrag = false; }));
  clock.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setParam('tilt', (state.tilt + .25) % 12);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setParam('tilt', (state.tilt + 11.75) % 12);
    else return; e.preventDefault();
  });
  document.querySelectorAll('[data-tilt]').forEach((b) => b.addEventListener('click', () => setParam('tilt', (state.tilt + 12 + Number(b.dataset.tilt)) % 12)));

  // ---------- state & UI ----------
  function buildPresets() {
    const box = $('presets'); box.textContent = '';
    for (const k of Object.keys(P.PRESETS)) {
      const p = presetFor(k, state.hand), b = document.createElement('button');
      b.type = 'button'; b.dataset.preset = k;
      b.innerHTML = `<span>${p.name}</span><small>${p.speedKmh} · ${p.rpm} · ${tiltText(p.tilt)}</small>`;
      b.addEventListener('click', () => applyPreset(k));
      box.appendChild(b);
    }
  }
  function applyPreset(k) {
    const p = presetFor(k, state.hand);
    Object.assign(state, { preset: k, speedKmh: p.speedKmh, rpm: p.rpm, tilt: p.tilt, efficiency: p.efficiency, seams: p.seams });
    update(true);
  }
  function setParam(key, value) {
    state[key] = value;
    if (key !== 'seams') state.preset = null;
    update(true);
  }
  function computePresetResults() {
    state.presetResults = {};
    for (const k of Object.keys(P.PRESETS)) state.presetResults[k] = P.simulate({ ...presetFor(k, state.hand), hand: state.hand });
  }
  function update(replay) {
    state.result = P.simulate(cfg());
    const r = state.result;
    $('speed').value = state.speedKmh; $('rpm').value = state.rpm; $('eff').value = Math.round(state.efficiency * 100); $('seams').value = state.seams;
    $('speed-out').textContent = `${state.speedKmh} km/h`;
    $('rpm-out').textContent = `${state.rpm} rpm`;
    $('eff-out').textContent = `${Math.round(state.efficiency * 100)} %`;
    $('tilt-out').textContent = tiltText(state.tilt);
    $('clock-hand').setAttribute('transform', `rotate(${state.tilt * 30})`);
    clock.setAttribute('aria-valuenow', state.tilt); clock.setAttribute('aria-valuetext', tiltText(state.tilt));
    document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === state.preset));
    $('custom-tag').textContent = state.preset ? P.PRESETS[state.preset].name : '自訂';
    const m = r.releaseMovementCm, armSign = state.hand === 'R' ? -1 : 1;
    const side = Math.abs(m.x) < .5 ? '' : (Math.sign(m.x) === armSign ? '手臂側' : '手套側');
    $('r-hb').textContent = `${Math.abs(m.x).toFixed(0)} cm ${side}`;
    $('r-ivb').textContent = `${m.z >= 0 ? '+' : '−'}${Math.abs(m.z).toFixed(0)} cm`;
    $('r-time').textContent = `${r.flightTime.toFixed(3)} s`;
    $('r-plate').textContent = `${r.plateSpeedKmh.toFixed(0)} km/h`;
    $('r-active').textContent = `${Math.round(r.activeSpinRpm)} rpm`;
    $('r-force').textContent = `${r.magnusN.toFixed(2)} N（重力的 ${Math.round(r.magnusOverWeight * 100)}%）`;
    $('r-s').textContent = `${r.spinFactor.toFixed(3)} ／ ${r.cl.toFixed(3)}`;
    updateBallPose();
    drawMovement();
    if (replay) pitchStart = performance.now();
  }

  $('speed').addEventListener('input', (e) => setParam('speedKmh', Number(e.target.value)));
  $('rpm').addEventListener('input', (e) => setParam('rpm', Number(e.target.value)));
  $('eff').addEventListener('input', (e) => setParam('efficiency', Number(e.target.value) / 100));
  $('seams').addEventListener('change', (e) => setParam('seams', e.target.value));
  $('slow').addEventListener('change', (e) => { state.slow = Number(e.target.value); updateBallPose(); });
  $('replay').addEventListener('click', () => { pitchStart = performance.now(); });
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('[data-hand]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.hand === state.hand) return;
    state.hand = b.dataset.hand; state.tilt = (12 - state.tilt) % 12;
    document.querySelectorAll('[data-hand]').forEach((x) => x.classList.toggle('active', x === b));
    buildPresets(); computePresetResults(); update(true);
  }));
  window.addEventListener('resize', () => { resize3D(); drawMovement(); });
  if (window.ResizeObserver) new ResizeObserver(() => { resize3D(); drawMovement(); }).observe($('stage'));

  buildPresets(); computePresetResults(); applyPreset('fourSeam');
  setView('catcher'); resize3D();
  requestAnimationFrame(animate);
  window.__spin = { state, P, setParam, applyPreset };
})();
