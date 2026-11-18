'use strict';
(() => {
  const P = window.PitchPhysics, T = window.THREE;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DEG = Math.PI / 180;

  const PL = window.PitchLab;
  const state = { elev: 0, azim: 0, relH: 1.78, relS: 0.55, ext: 1.74, aimMode: 'nospin', hand: 'R', preset: 'fourSeam', video: null, speedKmh: 152, rpm: 2300, tilt: 1, gyro: 36.9, seams: 'four', view: 'catcher', slow: 40, result: null, presetResults: {} };

  // ---------- helpers ----------
  const tiltText = (h) => { let H = Math.floor(h + 1e-9), M = Math.round((h - H) * 60); if (M === 60) { H += 1; M = 0; } H = H % 12 || 12; return `${H}:${String(M).padStart(2, '0')}`; };
  const presetFor = (key, hand) => {
    const p = P.PRESETS[key];
    return hand === 'L' ? { ...p, tilt: (12 - p.tilt) % 12, observed: [-p.observed[0], p.observed[1]] } : p;
  };
  const cfg = () => ({ elevationDeg: state.elev, azimuthDeg: state.azim, release: PL.releaseOf(state.hand, state.relH, state.relS, state.ext), aimMode: state.aimMode, hand: state.hand, speedKmh: state.speedKmh, rpm: state.rpm, tilt: state.tilt, efficiency: PL.effFromGyro(state.gyro) });
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

  // ---------- airflow (ball frame, ball radius = 1) ----------
  // Schematic field: potential flow past a sphere + swirl dragged by the spinning surface
  // (strength = surface speed / air speed) + a wake pushed opposite to the Magnus force.
  const flow = { a: new T.Vector3(0, 0, -1), F: new T.Vector3(0, 1, 0), side: new T.Vector3(1, 0, 0), W: new T.Vector3(), defl: 0, lines: [] };
  const _x = new T.Vector3(), _p = new T.Vector3(), _t = new T.Vector3();
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  function flowAt(x, out) {
    const { a, W, F } = flow, r2 = x.lengthSq(), r = Math.sqrt(r2), r3 = r2 * r, ax = a.dot(x);
    out.copy(a).multiplyScalar(1 + .5 / r3).addScaledVector(x, -1.5 * ax / (r3 * r2)); // potential flow
    out.add(_t.crossVectors(W, x).multiplyScalar(1 / r3)); // rotating surface drags the air
    if (ax > 0) { // wake: slower air behind the ball, pushed toward −F (Newton's third law)
      const g = smooth(0, 1.6, ax);
      _p.copy(x).addScaledVector(a, -ax);
      const rho2 = _p.lengthSq();
      out.addScaledVector(F, -flow.defl * g * Math.exp(-rho2 / 5));
      out.addScaledVector(a, -.42 * g * Math.exp(-rho2 / 1.1) * Math.exp(-ax / 7));
    }
    return out;
  }
  const flowMat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const flowGeo = new T.BufferGeometry();
  const flowLines = new T.LineSegments(flowGeo, flowMat);
  // tracer particles riding the streamlines (like smoke puffs)
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new T.CanvasTexture(c); })();
  const dotGeo = new T.BufferGeometry();
  const dots = new T.Points(dotGeo, new T.PointsMaterial({ size: .1, map: dotTex, vertexColors: true, transparent: true, depthWrite: false }));
  flowLines.add(dots);
  scene.add(flowLines);
  const speedColor = (s) => { // slow = blue … fast = red (relative to the free stream)
    const stops = [[.5, [.25, .42, 1]], [.95, [.3, .8, 1]], [1.2, [.45, .95, .5]], [1.4, [1, .86, .25]], [1.62, [1, .32, .22]]];
    if (s <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (s <= stops[i][0]) { const [s0, c0] = stops[i - 1], [s1, c1] = stops[i], u = (s - s0) / (s1 - s0); return c0.map((c, k) => c + (c1[k] - c) * u); }
    return stops[stops.length - 1][1];
  };
  function traceLine(seed, weight) {
    const pts = [], u = new T.Vector3(), k = new T.Vector3(), mid = new T.Vector3();
    const x = seed.clone(); let t = 0;
    for (let n = 0; n < 700; n++) {
      flowAt(x, u); const sp = u.length();
      pts.push({ x: x.clone(), t, sp });
      if (flow.a.dot(x) > 5.6 || x.length() > 9) break;
      const ds = .035;
      mid.copy(x).addScaledVector(u, ds / sp / 2); flowAt(mid, k); // midpoint (RK2) in arc length
      const ks = k.length(); x.addScaledVector(k, ds / ks); t += ds / ks;
      const r = x.length(); if (r < 1.015) x.multiplyScalar(1.015 / r);
    }
    return { pts, weight };
  }
  function buildFlow() {
    const r = state.result, a = vHat.clone().negate();
    let F = r.magnusN > .01 ? toThree(r.magnusDirection) : new T.Vector3(0, 1, 0);
    F.addScaledVector(a, -F.dot(a)); if (F.lengthSq() < 1e-6) F.set(1, 0, 0).addScaledVector(a, -a.x); F.normalize();
    flow.a.copy(a); flow.F.copy(F); flow.side.crossVectors(a, F).normalize();
    // swirl strength: surface speed / air speed, using the full spin vector (gyro spin swirls too)
    flow.W.copy(toThree(r.omega)).multiplyScalar(P.BALL.radius / Math.hypot(...r.v0));
    flow.defl = 1.8 * r.cl * (r.magnusN > .01 ? 1 : 0); // wake deflection, exaggerated for visibility
    const seeds = [];
    for (const o of [.12, .35, .6, .88, 1.2, 1.58, 2.02, 2.55]) for (const sg of [1, -1]) seeds.push([F.clone().multiplyScalar(o * sg), 1]);
    for (const o of [.45, 1.0, 1.7]) for (const sg of [1, -1]) seeds.push([flow.side.clone().multiplyScalar(o * sg), .45]);
    flow.lines = seeds.map(([off, w]) => traceLine(off.addScaledVector(a, -4.6), w));
    const nSeg = flow.lines.reduce((s, l) => s + l.pts.length - 1, 0);
    const pos = new Float32Array(nSeg * 6), col = new Float32Array(nSeg * 8);
    let j = 0;
    for (const l of flow.lines) for (let i = 1; i < l.pts.length; i++) {
      const A = l.pts[i - 1], B = l.pts[i];
      pos.set([A.x.x, A.x.y, A.x.z, B.x.x, B.x.y, B.x.z], j * 6);
      const cA = speedColor(A.sp), cB = speedColor(B.sp);
      col.set([...cA, 0, ...cB, 0], j * 8); j++;
    }
    flowGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    flowGeo.setAttribute('color', new T.BufferAttribute(col, 4));
    flowGeo.computeBoundingSphere();
    for (const l of flow.lines) l.tEnd = l.pts[l.pts.length - 1].t;
    const nDot = flow.lines.reduce((s, l) => s + Math.ceil(l.tEnd / DOT_GAP) + 1, 0);
    dotGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(nDot * 3), 3));
    dotGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(nDot * 4), 4));
    dotGeo.setDrawRange(0, 0);
  }
  const DOT_GAP = .32;
  function placeDots() {
    const pos = dotGeo.attributes.position.array, col = dotGeo.attributes.color.array; let n = 0;
    for (const l of flow.lines) {
      const pts = l.pts, off = ((flowPhase * .55) % DOT_GAP + DOT_GAP) % DOT_GAP;
      let i = 1;
      for (let t = off; t < l.tEnd; t += DOT_GAP) {
        while (i < pts.length - 1 && pts[i].t < t) i++;
        const A = pts[i - 1], B = pts[i], u = clamp((t - A.t) / ((B.t - A.t) || 1), 0, 1);
        const x = A.x.x + (B.x.x - A.x.x) * u, y = A.x.y + (B.x.y - A.x.y) * u, z = A.x.z + (B.x.z - A.x.z) * u;
        const c = speedColor(A.sp + (B.sp - A.sp) * u);
        const cx = x - camera.position.x, cy = y - camera.position.y, cz = z - camera.position.z;
        const fade = smooth(0, .5, t) * smooth(5.6, 4.4, x * flow.a.x + y * flow.a.y + z * flow.a.z) * smooth(1.5, 3.5, Math.sqrt(cx * cx + cy * cy + cz * cz));
        pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;
        col.set([c[0], c[1], c[2], fade * Math.min(1, l.weight * 1.6)], n * 4); n++;
      }
    }
    dotGeo.setDrawRange(0, n);
    dotGeo.attributes.position.needsUpdate = true; dotGeo.attributes.color.needsUpdate = true;
  }
  let flowPhase = 0;
  function animateFlow(dt) {
    if (!flow.lines.length) return;
    if (state.slow) flowPhase += dt * 40 / state.slow;
    const col = flowGeo.attributes.color.array, L = .55; // pulse spacing in "time" units
    let j = 0;
    const cam = camera.position;
    const alpha = (p, w) => { const f = ((p.t - flowPhase * .55) / L % 1 + 1) % 1, fade = smooth(0, .5, p.t) * smooth(5.6, 4.4, flow.a.dot(p.x)) * smooth(1.5, 3.5, p.x.distanceTo(cam)); return w * fade * (.45 + .5 * Math.pow(1 - f, 3)); };
    for (const l of flow.lines) for (let i = 1; i < l.pts.length; i++) {
      col[j * 8 + 3] = alpha(l.pts[i - 1], l.weight); col[j * 8 + 7] = alpha(l.pts[i], l.weight); j++;
    }
    flowGeo.attributes.color.needsUpdate = true;
    placeDots();
  }

  // orbit camera (custom = a fixed direction + up vector, used by the "flow" view)
  const orbit = { az: 0, el: 6 * DEG, r: 6.2, custom: null };
  // [azimuth°, elevation°, distance]: az 0 = from the catcher, 180 = from behind the pitcher, −90 = from the 3B side;
  // batter = a right-handed hitter standing on the 3B side of the plate, looking out at the incoming ball
  const VIEWS = { catcher: [0, 6, 6.2], pitcher: [180, 6, 6.2], side: [-90, 4, 6.2], batter: [-34, 9, 6.2] };
  const VIEW_NOTE = { flow: '看氣流：轉動的表面帶著空氣，尾流被甩向推力的反方向', pitcher: '投手視角：從投手背後看，和 PitchLab「轉軸幾點鐘」同一個方向；橘箭頭指的就是幾點鐘', batter: '打擊者視角：右打者站在三壘側，看著球迎面飛來', catcher: '捕手視角：從本壘後方迎著球看，左右和投手視角相反', side: '側面：從三壘側看，前進方向朝右，看得出後旋／前旋與陀螺角' };
  // "flow" view: face the plane that holds the flight direction and the Magnus force,
  // with the flight running left → right and the force pointing up the screen (or down, if it points down)
  function flowView() {
    const up = flow.F.y < -.05 ? flow.F.clone().negate() : flow.F.clone();
    const n = flow.side.clone(), right = new T.Vector3().crossVectors(n.clone().negate(), up);
    if (right.dot(vHat) < 0) n.negate();
    return { dir: n.addScaledVector(up, .14).normalize(), up };
  }
  function placeCamera() {
    const { az, el, r, custom } = orbit;
    if (custom) { camera.up.copy(custom.up); camera.position.copy(custom.dir).multiplyScalar(r); }
    else { camera.up.set(0, 1, 0); camera.position.set(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az)); }
    camera.lookAt(0, 0, 0);
  }
  function stageNote() {
    const rps = (state.rpm / 60).toFixed(0), n = VIEW_NOTE[state.view];
    $('stage-note').textContent = (n ? n + '　·　' : '') + (state.slow ? `實際每秒 ${rps} 圈，放慢 ${state.slow} 倍` : `已暫停（實際每秒 ${rps} 圈）`) + '　·　拖曳可轉動視角';
  }
  function setView(v) {
    state.view = v;
    if (v === 'flow') { orbit.custom = flowView(); orbit.r = 8.6; }
    else { const [az, el, r] = VIEWS[v]; orbit.custom = null; orbit.az = az * DEG; orbit.el = el * DEG; orbit.r = r; }
    placeCamera();
    document.querySelectorAll('#stage [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    stageNote();
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (orbit.custom) { const n = orbit.custom.dir; orbit.az = Math.atan2(n.x, n.z); orbit.el = clamp(Math.asin(clamp(n.y, -1, 1)), -1.2, 1.2); orbit.custom = null; }
    drag = { x: e.clientX, y: e.clientY, az: orbit.az, el: orbit.el }; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit.az = drag.az - (e.clientX - drag.x) * .008;
    orbit.el = clamp(drag.el + (e.clientY - drag.y) * .008, -1.2, 1.2);
    placeCamera(); state.view = null;
    document.querySelectorAll('#stage [data-view]').forEach((b) => b.classList.remove('active'));
  });
  ['pointerup', 'pointercancel'].forEach((t) => canvas.addEventListener(t, () => { drag = null; }));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); orbit.r = clamp(orbit.r * (1 + Math.sign(e.deltaY) * .08), 3.6, 13); placeCamera(); }, { passive: false });

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
    buildFlow();
    if (state.view === 'flow') setView('flow');
    const rps = state.rpm / 60;
    stageNote();
  }

  let lastT = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    if (state.slow) spinAngle += omegaRate * dt / state.slow;
    const qs = new T.Quaternion().setFromAxisAngle(omegaHat, spinAngle);
    ball.quaternion.copy(qs.multiply(q0));
    animateFlow(dt);
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
    const tc = proj([0, P.PLATE_Y, .76]); // strike-zone centre (the aim point)
    ctx.strokeStyle = '#1f3140aa'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tc.x - 6, tc.y); ctx.lineTo(tc.x + 6, tc.y); ctx.moveTo(tc.x, tc.y - 6); ctx.lineTo(tc.x, tc.y + 6); ctx.stroke();
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
      ctx.fillStyle = '#1f3140'; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'left';
      const call = P.zoneCall(r);
      if (r.ground) ctx.fillText(`球在離本壘 ${r.ground.toPlate.toFixed(1)} m 處落地`, 10, h - 12);
      else {
        if (!r.ghostGround) {
          const qg = proj(r.ghostPlate), qr = proj(r.plate);
          ctx.strokeStyle = '#c4472f'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(qg.x, qg.y); ctx.lineTo(qr.x, qr.y); ctx.stroke(); ctx.setLineDash([]);
        }
        const d = Math.hypot(r.releaseMovementCm.x, r.releaseMovementCm.z);
        ctx.fillText(`旋轉讓球偏了 ${d.toFixed(0)} 公分　·　${call === 'strike' ? '好球' : '壞球'}`, 10, h - 12);
      }
    }
    if (tNow > T1 + 1.6) pitchStart = now; // loop
    ctx.fillStyle = '#5d7080'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`${state.hand === 'R' ? '右投' : '左投'} · 出手高 ${state.relH.toFixed(2)} m · ${state.hand === 'R' ? '三壘' : '一壘'}側 ${state.relS.toFixed(2)} m`, w - 10, 16);
  }

  // ---------- movement chart (seen from behind the pitcher, like PitchLab: + = 3B side) ----------
  const hView = (xCatcher) => -xCatcher;
  function drawMovement() {
    const r = state.result; if (!r) return;
    const { ctx, w, h } = setupCanvas($('move-canvas'));
    if (!w || !h) return;
    const R = 70, cx = w / 2, cy = h / 2, s = Math.min(w, h) / 2 / (R + 8) * .95;
    const X = (v) => cx + v * s, Y = (v) => cy - v * s;
    ctx.fillStyle = '#f7f9f9'; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1; ctx.font = '10px sans-serif'; ctx.fillStyle = '#8796a0'; ctx.textAlign = 'center';
    for (let v = -60; v <= 60; v += 20) {
      ctx.strokeStyle = v === 0 ? '#b8c4ca' : '#e6ecee';
      ctx.beginPath(); ctx.moveTo(X(v), Y(-R)); ctx.lineTo(X(v), Y(R)); ctx.moveTo(X(-R), Y(v)); ctx.lineTo(X(R), Y(v)); ctx.stroke();
      if (v) { ctx.fillText(String(v), X(v), cy + 12); ctx.textAlign = 'right'; ctx.fillText(String(v), cx - 4, Y(v) + 3); ctx.textAlign = 'center'; }
    }
    ctx.fillStyle = '#5d7080'; ctx.font = '10.5px sans-serif';
    const R_hand = state.hand === 'R';
    ctx.textAlign = 'left'; ctx.fillText(`← 一壘側${R_hand ? '（手套側）' : '（手臂側）'}`, 4, h - 6);
    ctx.textAlign = 'right'; ctx.fillText(`三壘側${R_hand ? '（手臂側）' : '（手套側）'} →`, w - 4, h - 6);
    ctx.textAlign = 'left'; ctx.fillText('↑ 掉得少', cx + 4, 12);
    for (const [k, res] of Object.entries(state.presetResults)) {
      const m = res.releaseMovementCm, isSel = k === state.preset;
      ctx.fillStyle = isSel ? '#9aa9b1' : '#c3ced3';
      ctx.beginPath(); ctx.arc(X(hView(m.x)), Y(m.z), 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7d8d96'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(P.PRESETS[k].name.replace(/（.*）/, ''), X(hView(m.x)) + 6, Y(m.z) + 3);
    }
    const obs = observed();
    if (obs) { ctx.strokeStyle = '#c4472f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(clamp(obs.h, -R, R)), Y(clamp(obs.v, -R, R)), 6, 0, Math.PI * 2); ctx.stroke(); }
    const m = r.releaseMovementCm, hx = hView(m.x);
    ctx.strokeStyle = '#ef7a2c88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(X(hx), Y(m.z)); ctx.stroke();
    ctx.fillStyle = '#ef7a2c'; ctx.beginPath(); ctx.arc(X(clamp(hx, -R, R)), Y(clamp(m.z, -R, R)), 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // measured movement for the selected preset (pitcher's view, cm): PitchLab video or MLB average
  function observed() {
    if (state.video != null) { const v = PL.VIDEO[state.video]; return { v: v.v, h: state.hand === 'R' ? v.h : -v.h, src: 'PitchLab 實測' }; }
    if (state.preset) { const o = presetFor(state.preset, state.hand).observed; return { v: o[1], h: hView(o[0]), src: '大聯盟約略平均' }; }
    return null;
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
  document.querySelectorAll('.term-wrap[data-k]').forEach((el) => { el.innerHTML = PL.term(el.dataset.k); });
  $('r-vec-term').innerHTML = PL.term('vec');
  $('r-angle-term').innerHTML = `${PL.term('elev', '出手仰角')} ／ ${PL.term('azim', '偏角')}`;
  function buildPresets() {
    const box = $('presets'); box.textContent = '';
    for (const k of Object.keys(P.PRESETS)) {
      const p = presetFor(k, state.hand), b = document.createElement('button');
      b.type = 'button'; b.dataset.preset = k;
      b.innerHTML = `<span>${p.name}</span><small>${p.speedKmh} · ${p.rpm} · ${tiltText(p.tilt)} · ${PL.gyroFromEff(p.efficiency).toFixed(0)}°</small>`;
      b.addEventListener('click', () => applyPreset(k));
      box.appendChild(b);
    }
  }
  const vsel = $('video-preset');
  vsel.innerHTML = '<option value="">PitchLab 影片範例（右投實測）…</option>' + PL.VIDEO.map((v, i) => `<option value="${i}">${v.label}</option>`).join('');
  vsel.addEventListener('change', () => { if (vsel.value !== '') applyVideo(Number(vsel.value)); });
  function applyPreset(k) {
    const p = presetFor(k, state.hand);
    Object.assign(state, { preset: k, video: null, speedKmh: p.speedKmh, rpm: p.rpm, tilt: p.tilt, gyro: +PL.gyroFromEff(p.efficiency).toFixed(1), seams: p.seams });
    update(true);
  }
  function applyVideo(i) {
    const v = PL.VIDEO[i], t = PL.parseClock(v.clock);
    Object.assign(state, { preset: null, video: i, speedKmh: v.kph, rpm: v.rpm, tilt: state.hand === 'R' ? t : (12 - t) % 12, gyro: v.gyro, seams: /伸卡|變速/.test(v.type) ? 'two' : 'four' });
    update(true);
  }
  const RELEASE_KEYS = ['relH', 'relS', 'ext'];
  function setParam(key, value) {
    state[key] = value;
    if (RELEASE_KEYS.includes(key)) computePresetResults();
    else if (key !== 'seams') { state.preset = null; state.video = null; }
    update(true);
  }
  function computePresetResults() {
    state.presetResults = {};
    for (const k of Object.keys(P.PRESETS)) state.presetResults[k] = P.simulate({ ...presetFor(k, state.hand), hand: state.hand, aimMode: state.aimMode, elevationDeg: state.elev, azimuthDeg: state.azim, release: PL.releaseOf(state.hand, state.relH, state.relS, state.ext) });
  }
  const sideWord = (hcm) => (Math.abs(hcm) < 0.5 ? '' : hcm > 0 ? '三壘側' : '一壘側');
  function update(replay) {
    state.result = P.simulate(cfg());
    const r = state.result, eff = PL.effFromGyro(state.gyro), active = state.rpm * eff;
    const setIf = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; el.classList.remove('bad'); };
    $('speed').value = state.speedKmh; $('rpm').value = state.rpm; $('gyro').value = state.gyro; $('seams').value = state.seams;
    setIf('speed-num', state.speedKmh); setIf('rpm-num', state.rpm); setIf('gyro-num', state.gyro); setIf('tilt-num', tiltText(state.tilt));
    for (const k of RELEASE_KEYS) { $(k).value = state[k]; setIf(k + '-num', (+state[k]).toFixed(2)); }
    document.querySelectorAll('#slot-chips button').forEach((b) => { const s = PL.SLOTS.find((x) => x.key === b.dataset.slot); b.classList.toggle('active', Math.abs(s.h - state.relH) < .005 && Math.abs(s.s - state.relS) < .005 && Math.abs(s.e - state.ext) < .005); });
    $('release-hint').textContent = `出手點：離地 ${state.relH.toFixed(2)} m、往${state.hand === 'R' ? '三壘' : '一壘'}側 ${state.relS.toFixed(2)} m、離本壘 ${(18.44 - state.ext).toFixed(2)} m。延伸越長，飛行時間越短，旋轉推球的時間也越短。`;
    $('eff-out').textContent = `${Math.round(eff * 100)} %`;
    $('active-out').textContent = `${Math.round(active)} rpm`;
    $('clock-hand').setAttribute('transform', `rotate(${state.tilt * 30})`);
    clock.setAttribute('aria-valuenow', state.tilt); clock.setAttribute('aria-valuetext', tiltText(state.tilt));
    document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === state.preset));
    vsel.value = state.video == null ? '' : String(state.video);
    const name = state.preset ? P.PRESETS[state.preset].name : state.video != null ? PL.VIDEO[state.video].short : '自訂';
    $('custom-tag').textContent = name;
    // PitchLab-style card
    const m = r.releaseMovementCm, hb = hView(m.x);
    $('pl-type').textContent = name;
    const cell = (k, label, val, unit, kind) => `<div class="pl-cell ${kind}">${PL.term(k, label)}<b>${val}<small>${unit}</small></b></div>`;
    $('pl-grid').innerHTML =
      cell('kph', '球速', state.speedKmh.toFixed(1), 'kph', 'in') + cell('vb', '垂直', m.z.toFixed(1), 'cm', 'out') + cell('hb', '水平', hb.toFixed(1), 'cm', 'out') + cell('clock', '轉軸', tiltText(state.tilt), '', 'in') +
      cell('rpm', '轉速', Math.round(state.rpm), 'rpm', 'in') + cell('active', '啟用中', Math.round(active), 'rpm', 'auto') + cell('eff', '效率', Math.round(eff * 100), '%', 'auto') + cell('gyro', '陀螺', (+state.gyro).toFixed(1), '°', 'in');
    const obs = observed(), act = $('pl-actual');
    act.hidden = !obs;
    if (obs) act.innerHTML = `${obs.src}：垂直 <b>${obs.v.toFixed(1)}</b> cm、水平 <b>${obs.h.toFixed(1)}</b> cm${state.video != null && state.hand === 'L' ? '（左投為鏡像推算）' : ''}`;
    $('data-tag').textContent = `水平 ${Math.abs(hb).toFixed(0)} cm ${sideWord(hb)}`;
    $('r-time').textContent = `${r.flightTime.toFixed(3)} s`;
    $('r-plate').textContent = `${r.plateSpeedKmh.toFixed(0)} km/h`;
    $('r-force').textContent = `${r.magnusN.toFixed(2)} N（重力的 ${Math.round(r.magnusOverWeight * 100)}%）`;
    $('r-s').textContent = `${r.spinFactor.toFixed(3)} ／ ${r.cl.toFixed(3)}`;
    const ang = r.angles, sgn = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
    $('r-angle').textContent = `${sgn(ang.elevation)}° ／ ${sgn(ang.azimuth)}°${state.aimMode === 'manual' ? '（手動）' : '（自動）'}`;
    const call = P.zoneCall(r);
    $('r-call').textContent = call === 'ground' ? `落地（離本壘 ${r.ground.toPlate.toFixed(1)} m）` : `${call === 'strike' ? '好球' : '壞球'}（進壘高 ${r.plate[2].toFixed(2)} m）`;
    $('r-call').className = 'call-' + call;
    if (state.aimMode === 'manual') { $('elev').value = state.elev; $('azim').value = state.azim; setIf('elev-num', (+state.elev).toFixed(2)); setIf('azim-num', (+state.azim).toFixed(2)); }
    const wv = r.spinRate > 0 ? r.omega.map((x) => x / r.spinRate) : [0, 0, 0];
    $('r-vec').textContent = `(${(-wv[1]).toFixed(2)}, ${wv[2].toFixed(2)}, ${(-wv[0]).toFixed(2)})`;
    updateBallPose();
    drawMovement();
    if (replay) pitchStart = performance.now();
  }

  const num = (id, key, lo, hi) => $(id).addEventListener('input', (e) => {
    const v = Number(e.target.value), ok = e.target.value !== '' && v >= lo && v <= hi;
    e.target.classList.toggle('bad', !ok);
    if (ok) setParam(key, v);
  });
  num('relH-num', 'relH', 0.5, 2.3); num('relS-num', 'relS', 0, 1.3); num('ext-num', 'ext', 0.8, 2.4);
  RELEASE_KEYS.forEach((k) => { $(k).addEventListener('input', (e) => setParam(k, Number(e.target.value))); $(k + '-num').addEventListener('blur', () => update(false)); });
  $('slot-chips').innerHTML = PL.SLOTS.map((s) => `<button type="button" data-slot="${s.key}">${s.name}<small>${s.h.toFixed(2)} m</small></button>`).join('');
  $('slot-chips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const s = PL.SLOTS.find((x) => x.key === b.dataset.slot); Object.assign(state, { relH: s.h, relS: s.s, ext: s.e }); computePresetResults(); update(true); });
  num('speed-num', 'speedKmh', 60, 165); num('rpm-num', 'rpm', 0, 3200); num('gyro-num', 'gyro', 0, 90);
  ['speed-num', 'rpm-num', 'gyro-num', 'tilt-num'].forEach((id) => $(id).addEventListener('blur', () => update(false)));
  $('tilt-num').addEventListener('input', (e) => { const t = PL.parseClock(e.target.value); e.target.classList.toggle('bad', t === null); if (t !== null) setParam('tilt', t); });
  $('speed').addEventListener('input', (e) => setParam('speedKmh', Number(e.target.value)));
  $('rpm').addEventListener('input', (e) => setParam('rpm', Number(e.target.value)));
  $('gyro').addEventListener('input', (e) => setParam('gyro', Number(e.target.value)));
  $('seams').addEventListener('change', (e) => setParam('seams', e.target.value));
  $('slow').addEventListener('change', (e) => { state.slow = Number(e.target.value); updateBallPose(); });
  $('show-flow').addEventListener('change', (e) => { flowLines.visible = e.target.checked; });
  $('replay').addEventListener('click', () => { pitchStart = performance.now(); });
  function autoAngles() { const a = P.simulate({ ...cfg(), aimMode: 'nospin' }).angles; state.elev = +a.elevation.toFixed(2); state.azim = +a.azimuth.toFixed(2); }
  $('aim-mode').addEventListener('change', (e) => {
    if (e.target.value === 'manual' && state.result) { state.elev = +state.result.angles.elevation.toFixed(2); state.azim = +state.result.angles.azimuth.toFixed(2); }
    state.aimMode = e.target.value; $('manual-aim').hidden = state.aimMode !== 'manual';
    computePresetResults(); update(true);
  });
  for (const [k, lo, hi] of [['elev', -10, 15], ['azim', -8, 8]]) {
    $(k).addEventListener('input', (e) => { state[k] = Number(e.target.value); computePresetResults(); update(true); });
    $(k + '-num').addEventListener('input', (e) => { const v = Number(e.target.value), ok = e.target.value !== '' && v >= lo && v <= hi; e.target.classList.toggle('bad', !ok); if (ok) { state[k] = v; computePresetResults(); update(true); } });
    $(k + '-num').addEventListener('blur', () => update(false));
  }
  $('aim-auto').addEventListener('click', () => { autoAngles(); computePresetResults(); update(true); });
  document.querySelectorAll('[data-view]').forEach((b) => { if (b.closest('#stage')) b.addEventListener('click', () => setView(b.dataset.view)); });
  document.querySelectorAll('[data-hand]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.hand === state.hand) return;
    state.hand = b.dataset.hand; state.tilt = (12 - state.tilt) % 12;
    document.querySelectorAll('[data-hand]').forEach((x) => x.classList.toggle('active', x === b));
    buildPresets(); computePresetResults(); update(true);
  }));
  // send the current pitch to the 3-ball field below
  document.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', () => {
    const pitch = { kph: state.speedKmh, rpm: state.rpm, tilt: state.tilt, gyro: state.gyro, video: state.video, name: $('custom-tag').textContent, relH: state.relH, relS: state.relS, ext: state.ext };
    (window.__fieldQueue = window.__fieldQueue || []).push([b.dataset.send, pitch]);
    window.dispatchEvent(new CustomEvent('field-send'));
    if (!document.body.classList.contains('fs-on')) document.getElementById('field').scrollIntoView({ behavior: 'smooth' });
    b.textContent = '✓ 已放入'; setTimeout(() => { b.textContent = `球 ${b.dataset.send}`; }, 1400);
  }));
  // let the explainer drive the 3D ball
  window.addEventListener('spin-apply', (e) => { const d = e.detail; state.tilt = d.tilt; state.gyro = d.gyro; if (d.rpm) state.rpm = d.rpm; state.preset = null; state.video = null; update(true); });

  // full screen with small windows
  const fs = PL.fullscreenLab($('lab'), [
    { el: $('win-params'), title: '參數', icon: '⚙', place: { left: 12, top: 60, width: 340 }, open: true },
    { el: $('win-data'), title: '數據', icon: '📊', place: { right: 12, top: 60, width: 320 }, open: true },
    { el: $('win-path'), title: '球路與位移', icon: '⚾', place: { right: 12, bottom: 12, width: 380 }, open: false }
  ], { title: 'SPIN 投球旋轉實驗室' });
  $('fs-lab').addEventListener('click', () => fs.toggle(true));

  window.addEventListener('resize', () => { resize3D(); drawMovement(); });
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { resize3D(); drawMovement(); }); ro.observe($('stage')); ro.observe($('move-canvas')); }

  buildPresets(); computePresetResults(); applyPreset('fourSeam');
  setView('flow'); resize3D();
  requestAnimationFrame(animate);
  window.__spin = { state, P, setParam, applyPreset, applyVideo, flow, flowAt, setView, fs };
})();
