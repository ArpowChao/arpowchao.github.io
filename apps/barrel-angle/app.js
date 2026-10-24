'use strict';
(() => {
  const B = window.BarrelPhysics;
  const T = window.THREE;
  if (!B || !T) return;

  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const DEG = Math.PI / 180;

  // ---------- Application State ----------
  const state = {
    speedKmh: 158,
    angleDeg: 28,
    sprayDeg: 0,
    rpm: 1260,
    cd: 0.398,
    altitudeM: 0,
    windMs: 0,
    mode: 'single',        // 'single' | 'fan'
    fanFilter: '0-90',     // '0-90' | '0-60' | '60-90'
    cameraPreset: 'stadium',
    timeScale: 1.0,
    paused: false,
    showVacuum: true,
    showDragOnly: true,
    storyPlaying: false,
    storyIndex: 0,
    storyTimer: 0,
    animTime: 0,
    maxAnimTime: 5.5,
    comparison: null,
    sweep: null,
    fanTrajectories: []
  };

  const PRESETS = {
    deg10:    { speedKmh: 158, angleDeg: 10, sprayDeg: 0,   rpm: 1260, cd: 0.398, altitudeM: 0,    windMs: 0, mode: 'single', cam: 'stadium', scale: 1.0 },
    deg28:    { speedKmh: 158, angleDeg: 28, sprayDeg: 0,   rpm: 1260, cd: 0.398, altitudeM: 0,    windMs: 0, mode: 'single', cam: 'stadium', scale: 1.0 },
    deg45:    { speedKmh: 158, angleDeg: 45, sprayDeg: 0,   rpm: 1260, cd: 0.398, altitudeM: 0,    windMs: 0, mode: 'single', cam: 'stadium', scale: 1.0 },
    deg68:    { speedKmh: 158, angleDeg: 68, sprayDeg: 0,   rpm: 1260, cd: 0.398, altitudeM: 0,    windMs: 0, mode: 'single', cam: 'side',    scale: 1.0 },
    deg88:    { speedKmh: 158, angleDeg: 88, sprayDeg: 0,   rpm: 1260, cd: 0.398, altitudeM: 0,    windMs: 0, mode: 'single', cam: 'side',    scale: 1.0 },
    foulPole: { speedKmh: 158, angleDeg: 28, sprayDeg: 48,  rpm: 1260, cd: 0.398, altitudeM: 0,    windMs: 0, mode: 'single', cam: 'catcher', scale: 1.0 },
    ohtani:   { speedKmh: 187, angleDeg: 28, sprayDeg: 0,   rpm: 1260, cd: 0.398, altitudeM: 0,    windMs: 0, mode: 'fan',    cam: 'stadium', scale: 1.0 },
    coors:    { speedKmh: 158, angleDeg: 28, sprayDeg: -15, rpm: 1260, cd: 0.398, altitudeM: 1600, windMs: 0, mode: 'single', cam: 'stadium', scale: 1.0 }
  };

  const SLIDER_META = [
    { sliderId: 'speed-slider', numId: 'speed-num', key: 'speedKmh',  min: 80,    max: 195,  step: 1,    decimals: 0, restart: true },
    { sliderId: 'angle-slider', numId: 'angle-num', key: 'angleDeg',  min: 0,     max: 90,   step: 1,    decimals: 0, restart: true },
    { sliderId: 'spray-slider', numId: 'spray-num', key: 'sprayDeg',  min: -65,   max: 65,   step: 1,    decimals: 0, restart: false },
    { sliderId: 'rpm-slider',   numId: 'rpm-num',   key: 'rpm',       min: -1500, max: 3500, step: 50,   decimals: 0, restart: true },
    { sliderId: 'cd-slider',    numId: 'cd-num',    key: 'cd',        min: 0.00,  max: 0.65, step: 0.01, decimals: 2, restart: true },
    { sliderId: 'alt-slider',   numId: 'alt-num',   key: 'altitudeM', min: 0,     max: 2400, step: 100,  decimals: 0, restart: true },
    { sliderId: 'wind-slider',  numId: 'wind-num',  key: 'windMs',    min: -12,   max: 12,   step: 1,    decimals: 0, restart: true }
  ];

  function formatControlVal(meta, val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '';
    return meta.decimals > 0 ? n.toFixed(meta.decimals) : String(Math.round(n));
  }

  function syncControlInputs() {
    SLIDER_META.forEach((meta) => {
      const sliderEl = $(meta.sliderId);
      const numEl = $(meta.numId);
      const formatted = formatControlVal(meta, state[meta.key]);
      if (sliderEl && document.activeElement !== sliderEl) {
        sliderEl.value = formatted;
      }
      if (numEl && document.activeElement !== numEl) {
        numEl.value = formatted;
      }
    });
  }

  // ---------- Three.js Scene Setup (Black Night Stadium Sky & Glowing Tracers) ----------
  const canvas = $('stadium-canvas');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x05070e, 1);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x060914, 0.0016);

  const camera = new T.PerspectiveCamera(40, 16 / 9, 0.5, 650);

  // Orbit camera state
  const camOrbit = {
    target: new T.Vector3(52, 12, 0),
    GoalTarget: new T.Vector3(52, 12, 0),
    pos: new T.Vector3(-22, 25, 56),
    goalPos: new T.Vector3(-22, 25, 56),
    userDragging: false,
    spherical: { radius: 85, theta: -0.38, phi: 1.28 }
  };

  // 7 Distinct Observation Perspectives
  const CAMERA_PRESETS = {
    stadium:  { pos: new T.Vector3(-22, 25, 56),   target: new T.Vector3(52, 12, 0),  fov: 40 },
    catcher:  { pos: new T.Vector3(-12, 5.5, 0),   target: new T.Vector3(65, 9, 0),   fov: 48 },
    batter:   { pos: new T.Vector3(4.2, 2.0, 5.2), target: new T.Vector3(0.5, 1.4, 0), fov: 36 },
    side:     { pos: new T.Vector3(42, 22, 118),   target: new T.Vector3(42, 16, 0),  fov: 40 },
    top:      { pos: new T.Vector3(46, 165, 0.5),  target: new T.Vector3(46, 0, 0),   fov: 44 },
    outfield: { pos: new T.Vector3(138, 22, 32),   target: new T.Vector3(52, 10, 0),  fov: 42 },
    follow:   { pos: new T.Vector3(-14, 10, 28),   target: new T.Vector3(20, 5, 0),   fov: 42 }
  };

  function setCameraPreset(name, instant) {
    state.cameraPreset = name;
    const p = CAMERA_PRESETS[name] || CAMERA_PRESETS.stadium;
    camOrbit.goalPos.copy(p.pos);
    camOrbit.GoalTarget.copy(p.target);
    camera.fov = p.fov;
    camera.updateProjectionMatrix();
    if (instant) {
      camOrbit.pos.copy(p.pos);
      camOrbit.target.copy(p.target);
    }
    syncSphericalFromPos();
    document.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cam === name);
    });
  }

  function syncSphericalFromPos() {
    const offset = camOrbit.goalPos.clone().sub(camOrbit.GoalTarget);
    const r = Math.max(3, offset.length());
    camOrbit.spherical.radius = r;
    camOrbit.spherical.phi = Math.acos(clamp(offset.y / r, -0.99, 0.99));
    camOrbit.spherical.theta = Math.atan2(offset.x, offset.z);
  }

  // Night Stadium Floodlight Illumination
  scene.add(new T.AmbientLight(0x273444, 0.95));
  scene.add(new T.HemisphereLight(0xdbeafe, 0x1e293b, 0.8));

  const homeFlood = new T.DirectionalLight(0xfff7ed, 1.4);
  homeFlood.position.set(-35, 95, 45);
  scene.add(homeFlood);

  const cfFlood = new T.DirectionalLight(0xdbeafe, 0.95);
  cfFlood.position.set(125, 80, -35);
  scene.add(cfFlood);

  const lfFlood = new T.DirectionalLight(0xf8fafc, 0.75);
  lfFlood.position.set(50, 75, -90);
  scene.add(lfFlood);

  const rfFlood = new T.DirectionalLight(0xf8fafc, 0.75);
  rfFlood.position.set(50, 75, 90);
  scene.add(rfFlood);

  function makeGlowTexture(colorHex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, colorHex);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }

  function makeTextSprite(text, opts) {
    opts = opts || {};
    const c = document.createElement('canvas');
    c.width = opts.w || 256;
    c.height = opts.h || 96;
    const g = c.getContext('2d');
    if (opts.bg) {
      g.fillStyle = opts.bg;
      g.beginPath();
      g.roundRect(6, 12, c.width - 12, c.height - 24, 16);
      g.fill();
    }
    if (opts.border) {
      g.strokeStyle = opts.border;
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(6, 12, c.width - 12, c.height - 24, 16);
      g.stroke();
    }
    g.fillStyle = opts.color || '#1f3140';
    g.font = opts.font || 'bold 38px "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2);
    const tex = new T.CanvasTexture(c);
    const mat = new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new T.Sprite(mat);
    sp.scale.set(opts.scaleX || 8, opts.scaleY || 3, 1);
    return sp;
  }

  // ---------- Build 3D Daylight Stadium (with Fair vs Foul Territory) ----------
  const batterGroup = new T.Group();
  let batterBatPivot = null;

  function buildStadium() {
    const stadium = new T.Group();

    const F = B.FIELD;
    const LINE = F.foulLineDeg * DEG;
    const WALL_R = F.wallDistanceM;
    const toXZ = (t, off, sign) => {
      const ux = Math.cos(LINE), uz = sign * Math.sin(LINE);
      const nx = -Math.sin(LINE), nz = sign * Math.cos(LINE);
      return [t * ux + off * nx, t * uz + off * nz];
    };

    // Authentic Major League Baseball Mowed Lawn Texture (alternating stripes)
    const makeGrassTexture = () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 512;
      const gg = cv.getContext('2d');
      gg.fillStyle = '#2f7c34';
      gg.fillRect(0, 0, 512, 512);
      gg.fillStyle = '#39943f';
      const stripeW = 32;
      for (let i = 0; i < 512; i += stripeW * 2) {
        gg.fillRect(i, 0, stripeW, 512);
      }
      const idata = gg.getImageData(0, 0, 512, 512);
      const d = idata.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 10;
        d[i] = clamp(d[i] + n, 0, 255);
        d[i + 1] = clamp(d[i + 1] + n, 0, 255);
        d[i + 2] = clamp(d[i + 2] + n, 0, 255);
      }
      gg.putImageData(idata, 0, 0);
      const tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(18, 18);
      return tex;
    };

    // Authentic MLB Red Infield Clay Texture
    const makeDirtTexture = () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const gg = cv.getContext('2d');
      gg.fillStyle = '#b8703f';
      gg.fillRect(0, 0, 256, 256);
      const idata = gg.getImageData(0, 0, 256, 256);
      const d = idata.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 14;
        d[i] = clamp(d[i] + n, 0, 255);
        d[i + 1] = clamp(d[i + 1] + n * 0.7, 0, 255);
        d[i + 2] = clamp(d[i + 2] + n * 0.4, 0, 255);
      }
      gg.putImageData(idata, 0, 0);
      const tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(10, 10);
      return tex;
    };

    const grassMat = new T.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 0.88 });
    const dirtMat = new T.MeshStandardMaterial({ map: makeDirtTexture(), roughness: 0.92 });
    const chalkMat = new T.MeshBasicMaterial({ color: 0xffffff });

    // 1. Single Seamless Master Grass Ground across entire ballpark (Fair & Foul are one uniform manicured field!)
    const masterField = new T.Mesh(new T.CircleGeometry(160, 96), grassMat);
    masterField.rotation.x = -Math.PI / 2;
    masterField.position.y = -0.01;
    stadium.add(masterField);

    // 2. MLB Regulation Infield Dirt Arc (centered at pitcher's rubber 18.44m, outer arc radius 28.96m / 95ft)
    const dirtShape = new T.Shape();
    dirtShape.moveTo(0, 0); // Home plate
    dirtShape.lineTo(27.51, -27.51); // 3B foul line intersection
    dirtShape.absarc(18.44, 0, 28.96, -1.252, 1.252, false); // Sweeping arc behind 2nd base
    dirtShape.lineTo(27.51, 27.51); // 1B foul line intersection
    dirtShape.closePath();

    const infieldDirt = new T.Mesh(new T.ShapeGeometry(dirtShape), dirtMat);
    infieldDirt.rotation.x = -Math.PI / 2;
    infieldDirt.position.y = 0.003;
    stadium.add(infieldDirt);

    // 3. Inner Grass Diamond (lush green diamond between basepaths)
    const innerGrassShape = new T.Shape();
    innerGrassShape.moveTo(4.2, 0);
    innerGrassShape.lineTo(18.0, 15.6);
    innerGrassShape.lineTo(35.0, 0);
    innerGrassShape.lineTo(18.0, -15.6);
    innerGrassShape.closePath();

    const innerGrass = new T.Mesh(new T.ShapeGeometry(innerGrassShape), grassMat);
    innerGrass.rotation.x = -Math.PI / 2;
    innerGrass.position.y = 0.008;
    stadium.add(innerGrass);

    // 4. Elevated Pitcher's Mound & Pitching Rubber (18.44m from home plate)
    const mound = new T.Mesh(new T.CylinderGeometry(2.1, 2.74, 0.25, 36), dirtMat);
    mound.position.set(18.44, 0.125, 0);
    stadium.add(mound);

    const rubber = new T.Mesh(new T.BoxGeometry(0.61, 0.05, 0.15), chalkMat);
    rubber.position.set(18.44, 0.25, 0);
    stadium.add(rubber);

    // Home plate dirt circle cutout
    const homeDirt = new T.Mesh(new T.CircleGeometry(4.0, 48), dirtMat);
    homeDirt.rotation.x = -Math.PI / 2;
    homeDirt.position.set(0, 0.006, 0);
    stadium.add(homeDirt);

    // Sliding pit dirt cutouts around 1B, 2B, 3B
    [[19.4, 19.4], [38.79, 0], [19.4, -19.4]].forEach(([bx, bz]) => {
      const pit = new T.Mesh(new T.CircleGeometry(3.5, 32), dirtMat);
      pit.rotation.x = -Math.PI / 2;
      pit.position.set(bx, 0.007, bz);
      stadium.add(pit);
    });

    // Bases (1B, 2B, 3B regulation white cushions)
    const baseGeo = new T.BoxGeometry(0.38, 0.07, 0.38);
    [[19.4, 19.4], [38.79, 0], [19.4, -19.4]].forEach(([bx, bz]) => {
      const b = new T.Mesh(baseGeo, chalkMat);
      b.position.set(bx, 0.045, bz);
      b.rotation.y = Math.PI / 4;
      stadium.add(b);
    });

    // Home plate & Batter's Boxes
    const plate = new T.Mesh(new T.BoxGeometry(0.43, 0.04, 0.43), chalkMat);
    plate.position.set(0, 0.02, 0);
    stadium.add(plate);

    for (const zOff of [-1.02, 1.02]) {
      const box = new T.Mesh(new T.BoxGeometry(1.8, 0.02, 1.15), chalkMat);
      const boxInner = new T.Mesh(new T.BoxGeometry(1.68, 0.022, 1.03), dirtMat);
      box.position.set(0.12, 0.015, zOff);
      boxInner.position.set(0.12, 0.016, zOff);
      stadium.add(box, boxInner);
    }

    // Coaches' boxes in foul territory
    for (const sign of [-1, 1]) {
      const cBox = new T.Mesh(new T.BoxGeometry(6.0, 0.02, 1.6), chalkMat);
      const cInner = new T.Mesh(new T.BoxGeometry(5.8, 0.022, 1.4), grassMat);
      cBox.position.set(22.0, 0.015, sign * 26.5);
      cBox.rotation.y = -sign * LINE;
      cInner.position.copy(cBox.position);
      cInner.rotation.copy(cBox.rotation);
      stadium.add(cBox, cInner);
    }

    // On-deck circles in foul territory
    const onDeckMat = new T.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.8 });
    const onDeckInnerMat = new T.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 });
    for (const sign of [-1, 1]) {
      const deckRing = new T.Mesh(new T.RingGeometry(0.75, 1.5, 32), onDeckMat);
      deckRing.rotation.x = -Math.PI / 2;
      deckRing.position.set(5.5, 0.012, sign * 11.5);
      const deckCore = new T.Mesh(new T.CircleGeometry(0.75, 32), onDeckInnerMat);
      deckCore.rotation.x = -Math.PI / 2;
      deckCore.position.set(5.5, 0.013, sign * 11.5);
      stadium.add(deckRing, deckCore);
    }

    // 5. Foul lines (±45°) & Foul Poles on the 110m wall
    for (const sign of [-1, 1]) {
      const line = new T.Mesh(new T.BoxGeometry(WALL_R, 0.03, 0.15), chalkMat);
      line.rotation.y = -sign * LINE;
      line.position.set((WALL_R / 2) * Math.cos(LINE), 0.018, sign * (WALL_R / 2) * Math.sin(LINE));
      stadium.add(line);

      const pole = new T.Mesh(
        new T.CylinderGeometry(0.22, 0.22, 24, 12),
        new T.MeshBasicMaterial({ color: 0xeab308 })
      );
      pole.position.set(WALL_R * Math.cos(LINE), 12, sign * WALL_R * Math.sin(LINE));
      stadium.add(pole);

      const poleLbl = makeTextSprite(sign < 0 ? '左外野標竿 (−45°)' : '右外野標竿 (+45°)', {
        w: 380, h: 86, font: 'bold 30px "Segoe UI", sans-serif',
        color: '#1f3140', bg: 'rgba(254,240,138,0.94)', border: '#ca8a04', scaleX: 10.5, scaleY: 2.3
      });
      poleLbl.position.set(WALL_R * Math.cos(LINE), 25.5, sign * WALL_R * Math.sin(LINE));
      stadium.add(poleLbl);
    }

    // 6. Outfield warning track (4.5m wide along 110m wall) + Foul perimeter tracks
    const outfieldTrack = new T.Mesh(
      new T.RingGeometry(WALL_R - 4.5, WALL_R, 96, 1, -LINE, 2 * LINE),
      dirtMat
    );
    outfieldTrack.rotation.x = -Math.PI / 2;
    outfieldTrack.position.y = 0.003;
    stadium.add(outfieldTrack);

    // 7. Foul-territory side walls + 18.3m Backstop behind home plate
    const sideOff = 16;
    const tJoin = Math.sqrt(Math.max(0, F.backstopM ** 2 - sideOff ** 2));
    const padMat = new T.MeshStandardMaterial({ color: 0x2c4c3e, roughness: 0.7 });
    for (const sign of [-1, 1]) {
      const [x1, z1] = toXZ(tJoin, sideOff, sign);
      const [x2, z2] = toXZ(WALL_R + 2, sideOff, sign);
      const len = Math.hypot(x2 - x1, z2 - z1);
      const wall = new T.Mesh(new T.BoxGeometry(len, 1.4, 0.35), padMat);
      wall.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      wall.position.set((x1 + x2) / 2, 0.7, (z1 + z2) / 2);
      stadium.add(wall);

      const [px, pz] = [WALL_R * Math.cos(LINE), sign * WALL_R * Math.sin(LINE)];
      const len2 = Math.hypot(x2 - px, z2 - pz);
      const cap = new T.Mesh(new T.BoxGeometry(len2, 2.5, 0.35), padMat);
      cap.rotation.y = -Math.atan2(z2 - pz, x2 - px);
      cap.position.set((x2 + px) / 2, 1.25, (z2 + pz) / 2);
      stadium.add(cap);
    }

    const phiJoin = LINE + Math.atan2(sideOff, tJoin);
    const thStart = Math.PI / 2 - (2 * Math.PI - phiJoin);
    const thLen = 2 * Math.PI - 2 * phiJoin;
    const backstopWall = new T.Mesh(
      new T.CylinderGeometry(F.backstopM, F.backstopM, 2.5, 48, 1, true, thStart, thLen),
      new T.MeshStandardMaterial({ color: 0x2c4c3e, roughness: 0.7, side: T.DoubleSide })
    );
    backstopWall.position.y = 1.25;
    stadium.add(backstopWall);

    const backstopNet = new T.Mesh(
      new T.CylinderGeometry(F.backstopM, F.backstopM, 8.5, 48, 6, true, thStart, thLen),
      new T.MeshBasicMaterial({ color: 0x475569, wireframe: true, transparent: true, opacity: 0.25 })
    );
    backstopNet.position.y = 6.75;
    stadium.add(backstopNet);

    const backLbl = makeTextSprite('本壘後方擋網 18.3m（界外區）', {
      w: 500, h: 90, font: 'bold 30px "Segoe UI", "Microsoft JhengHei", sans-serif',
      color: '#991b1b', bg: 'rgba(254,226,226,0.94)', border: '#dc2626', scaleX: 11.5, scaleY: 2.1
    });
    backLbl.position.set(-F.backstopM - 1, 12.2, 0);
    stadium.add(backLbl);

    // 8. Distance arcs inside fair territory (50m, 100m)
    const arcMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: T.DoubleSide });
    for (const dist of [50, 100]) {
      const ring = new T.Mesh(new T.RingGeometry(dist - 0.16, dist + 0.16, 64, 1, -LINE, 2 * LINE), arcMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.016;
      stadium.add(ring);
      const lbl = makeTextSprite(`${dist}m`, {
        color: '#1f3140', bg: 'rgba(255,255,255,0.92)', border: '#cbd5e1', scaleX: 7, scaleY: 2.5
      });
      lbl.position.set(dist, 1.5, 10);
      stadium.add(lbl);
    }

    // 6. Outfield wall (110 m) from foul pole to foul pole
    const wallHeight = F.wallHeightM;
    const wallArc = 2 * LINE;
    const wallMesh = new T.Mesh(
      new T.CylinderGeometry(WALL_R, WALL_R, wallHeight, 72, 1, true, Math.PI / 2 - wallArc / 2, wallArc),
      new T.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.7, side: T.DoubleSide })
    );
    wallMesh.position.y = wallHeight / 2;
    stadium.add(wallMesh);
    const yellowTop = new T.Mesh(
      new T.CylinderGeometry(WALL_R, WALL_R, 0.24, 72, 1, true, Math.PI / 2 - wallArc / 2, wallArc),
      new T.MeshBasicMaterial({ color: 0xfacc15, side: T.DoubleSide })
    );
    yellowTop.position.y = wallHeight + 0.12;
    stadium.add(yellowTop);

    const wall110Label = makeTextSprite('110m 全壘打牆', {
      w: 320, h: 88, font: 'bold 32px "Segoe UI", sans-serif',
      color: '#1f3140', bg: 'rgba(254,240,138,0.95)', border: '#ca8a04', scaleX: 9.2, scaleY: 2.5
    });
    wall110Label.position.set(110, 4.2, 0);
    stadium.add(wall110Label);

    // 7. Outfield & Infield Grandstands
    const standSlopes = [
      { rStart: 112, rEnd: 140, yStart: 2.8, yEnd: 16.5, thMin: -0.78, thMax: 0.78, rows: 12, cols: 80 },
      { rStart: 22,  rEnd: 42,  yStart: 2.0, yEnd: 12.0, thMin: 2.05,  thMax: 4.25, rows: 8,  cols: 54 }
    ];
    const seatGeo = new T.BoxGeometry(0.95, 0.7, 0.95);
    const seatMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const palette = [
      new T.Color(0x2563eb), new T.Color(0x3b82f6), new T.Color(0x60a5fa),
      new T.Color(0xf8fafc), new T.Color(0x16a34a), new T.Color(0xf59e0b),
      new T.Color(0xef4444), new T.Color(0x64748b)
    ];

    standSlopes.forEach((sec) => {
      const tierGeo = new T.CylinderGeometry(
        sec.rEnd,
        sec.rStart,
        sec.yEnd - sec.yStart,
        48,
        1,
        true,
        Math.PI / 2 + sec.thMin,
        sec.thMax - sec.thMin
      );
      const tier = new T.Mesh(
        tierGeo,
        new T.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85, side: T.DoubleSide })
      );
      tier.position.y = (sec.yStart + sec.yEnd) / 2;
      stadium.add(tier);

      const count = sec.rows * sec.cols;
      const crowd = new T.InstancedMesh(seatGeo, seatMat, count);
      const dummy = new T.Matrix4();
      let idx = 0;
      for (let r = 0; r < sec.rows; r++) {
        const u = r / Math.max(1, sec.rows - 1);
        const rad = sec.rStart + u * (sec.rEnd - sec.rStart);
        const y = sec.yStart + u * (sec.yEnd - sec.yStart) + 0.4;
        for (let c = 0; c < sec.cols; c++) {
          const v = (c + 0.5) / sec.cols;
          const ang = sec.thMin + v * (sec.thMax - sec.thMin);
          const px = rad * Math.cos(ang);
          const pz = rad * Math.sin(ang);
          dummy.makeRotationY(-ang);
          dummy.setPosition(px, y, pz);
          crowd.setMatrixAt(idx, dummy);
          crowd.setColorAt(idx, palette[(r * 13 + c * 7) % palette.length]);
          idx++;
        }
      }
      crowd.instanceMatrix.needsUpdate = true;
      if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
      stadium.add(crowd);
    });

    // 8. Four Stadium Floodlight Towers (authentic night-game lighting towers)
    const towerCoords = [
      [-14, -40], [-14, 40], [120, -64], [120, 64]
    ];
    const towerPillarGeo = new T.CylinderGeometry(0.45, 0.75, 42, 8);
    const towerMat = new T.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.4 });
    const bankGeo = new T.BoxGeometry(7.2, 3.4, 1.2);
    const bankHeadMat = new T.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const bankBulbGeo = new T.PlaneGeometry(6.6, 2.8);
    const bulbMat = new T.MeshBasicMaterial({ color: 0xfffbee });
    const lightGlowTex = makeGlowTexture('#ffe58f');

    towerCoords.forEach(([tx, tz]) => {
      const tower = new T.Group();
      tower.position.set(tx, 0, tz);

      const pillar = new T.Mesh(towerPillarGeo, towerMat);
      pillar.position.y = 21;
      tower.add(pillar);

      const head = new T.Mesh(bankGeo, bankHeadMat);
      head.position.y = 42.5;
      const angleToField = Math.atan2(-tz, 45 - tx);
      head.rotation.y = angleToField;

      const bulbs = new T.Mesh(bankBulbGeo, bulbMat);
      bulbs.position.set(0, 0, 0.62);
      bulbs.rotation.x = 0.22;
      head.add(bulbs);

      const glowSprite = new T.Sprite(new T.SpriteMaterial({
        map: lightGlowTex,
        color: 0xfffae0,
        transparent: true,
        opacity: 0.65,
        blending: T.AdditiveBlending,
        depthWrite: false
      }));
      glowSprite.scale.set(18, 18, 1);
      glowSprite.position.set(0, 0, 0.9);
      head.add(glowSprite);

      tower.add(head);
      stadium.add(tower);
    });

    scene.add(stadium);
  }

  // ---------- Build 3D Mannequins ----------
  function makeLimb(r, len, mat) {
    const g = new T.Group();
    const cyl = new T.Mesh(new T.CylinderGeometry(r, r * 0.9, len, 14), mat);
    cyl.position.y = -len / 2;
    const joint = new T.Mesh(new T.SphereGeometry(r * 1.05, 14, 12), mat);
    g.add(joint, cyl);
    return g;
  }

  function buildMannequins() {
    const batterMat = new T.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.15 });
    batterGroup.position.set(-0.15, 0, -0.88); // Right-handed batter stands on 3B side (−Z)

    const torso = new T.Mesh(new T.CylinderGeometry(0.19, 0.16, 0.62, 16), batterMat);
    torso.position.set(0, 1.15, 0);
    const head = new T.Mesh(new T.SphereGeometry(0.15, 18, 16), batterMat);
    head.position.set(0, 1.62, 0);
    batterGroup.add(torso, head);

    const lLeg = makeLimb(0.085, 0.82, batterMat);
    lLeg.position.set(0.12, 0.84, 0.06);
    lLeg.rotation.z = 0.12;
    const rLeg = makeLimb(0.085, 0.82, batterMat);
    rLeg.position.set(-0.12, 0.84, -0.08);
    rLeg.rotation.z = -0.15;
    batterGroup.add(lLeg, rLeg);

    batterBatPivot = new T.Group();
    batterBatPivot.position.set(0.05, 1.32, 0.15);

    const armL = makeLimb(0.065, 0.48, batterMat);
    armL.rotation.x = Math.PI / 2.4;
    armL.rotation.z = -0.35;
    batterBatPivot.add(armL);

    const batMat = new T.MeshStandardMaterial({ color: 0x9a5b25, roughness: 0.55 });
    const bat = new T.Mesh(new T.CylinderGeometry(0.036, 0.018, 0.92, 14), batMat);
    bat.position.set(0.28, 0.05, 0.38);
    bat.rotation.x = -Math.PI / 2.2;
    bat.rotation.z = -0.45;
    batterBatPivot.add(bat);

    batterGroup.add(batterBatPivot);
    scene.add(batterGroup);

    const darkMat = new T.MeshStandardMaterial({ color: 0x475569, roughness: 0.55 });
    const catcher = new T.Group();
    catcher.position.set(-1.35, 0, 0);
    const cTorso = new T.Mesh(new T.CylinderGeometry(0.2, 0.17, 0.52, 14), darkMat);
    cTorso.position.set(0, 0.78, 0);
    cTorso.rotation.z = -0.25;
    const cHead = new T.Mesh(new T.SphereGeometry(0.15, 16, 14), darkMat);
    cHead.position.set(0.06, 1.16, 0);
    const cLegL = makeLimb(0.085, 0.55, darkMat);
    cLegL.position.set(0, 0.55, -0.22);
    cLegL.rotation.x = -0.35;
    const cLegR = makeLimb(0.085, 0.55, darkMat);
    cLegR.position.set(0, 0.55, 0.22);
    cLegR.rotation.x = 0.35;
    catcher.add(cTorso, cHead, cLegL, cLegR);
    scene.add(catcher);

    const umpire = new T.Group();
    umpire.position.set(-2.25, 0, 0.12);
    const uTorso = new T.Mesh(new T.CylinderGeometry(0.21, 0.18, 0.65, 14), darkMat);
    uTorso.position.set(0, 1.15, 0);
    const uHead = new T.Mesh(new T.SphereGeometry(0.15, 16, 14), darkMat);
    uHead.position.set(0, 1.62, 0);
    const uLegL = makeLimb(0.085, 0.82, darkMat);
    uLegL.position.set(0, 0.82, -0.16);
    const uLegR = makeLimb(0.085, 0.82, darkMat);
    uLegR.position.set(0, 0.82, 0.16);
    umpire.add(uTorso, uHead, uLegL, uLegR);
    scene.add(umpire);

    const fielderCoords = [
      [18.4, 0], [34, -14], [34, 14], [26, -22], [26, 22],
      [78, -36], [86, 0], [78, 36]
    ];
    const fielderMat = new T.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    fielderCoords.forEach(([fx, fz]) => {
      const f = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 1.75, 10), fielderMat);
      f.position.set(fx, 0.88, fz);
      scene.add(f);
    });
  }

  buildStadium();
  buildMannequins();

  // ---------- Dynamic 3D Trajectory Group (Sleek Luminous Tracers) ----------
  const trajGroup = new T.Group();
  scene.add(trajGroup);

  const ballGlowTex = makeGlowTexture('#ffe600');
  const activeBall = new T.Mesh(
    new T.SphereGeometry(0.42, 20, 16),
    new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })
  );
  const activeBallHalo = new T.Sprite(
    new T.SpriteMaterial({
      map: ballGlowTex,
      color: 0xffea00,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false
    })
  );
  activeBallHalo.scale.set(3.4, 3.4, 1);
  activeBall.add(activeBallHalo);
  scene.add(activeBall);

  const dropLineGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
  const dropLine = new T.Line(
    dropLineGeo,
    new T.LineBasicMaterial({ color: 0xffea00, transparent: true, opacity: 0.7, blending: T.AdditiveBlending })
  );
  scene.add(dropLine);

  const groundShadow = new T.Mesh(
    new T.RingGeometry(0.25, 0.95, 24),
    new T.MeshBasicMaterial({ color: 0xffea00, transparent: true, opacity: 0.85, side: T.DoubleSide })
  );
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.y = 0.04;
  scene.add(groundShadow);

  function clearGroup(grp) {
    while (grp.children.length > 0) {
      const c = grp.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    }
  }

  // Convert 2D plane path (x, y) + horizontal sprayDeg into 3D coordinates (X, Y, Z)
  function samplePathUpToTime(path, tMax, sprayDeg) {
    const sRad = (Number(sprayDeg) || 0) * DEG;
    const cosS = Math.cos(sRad);
    const sinS = Math.sin(sRad);
    const pts = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (p.t <= tMax) {
        pts.push(new T.Vector3(p.x * cosS, p.y, p.x * sinS));
      } else {
        if (i > 0) {
          const prev = path[i - 1];
          const f = clamp((tMax - prev.t) / Math.max(1e-6, p.t - prev.t), 0, 1);
          const x = prev.x + f * (p.x - prev.x);
          const y = prev.y + f * (p.y - prev.y);
          pts.push(new T.Vector3(x * cosS, y, x * sinS));
        }
        break;
      }
    }
    return pts;
  }

  // High-Grade Sleek Statcast Trajectory Renderer (Multi-Layer Luminous Tracer)
  function buildTubeMesh(pts, radius, color, opacity, additive, depthWrite) {
    if (pts.length < 2) return null;
    const curve = new T.CatmullRomCurve3(pts, false, 'centripetal');
    const segs = Math.min(220, Math.max(16, pts.length * 3));
    const geo = new T.TubeGeometry(curve, segs, radius, 10, false);
    const mat = new T.MeshBasicMaterial({
      color,
      transparent: opacity < 1 || additive,
      opacity,
      blending: additive ? T.AdditiveBlending : T.NormalBlending,
      depthWrite: additive ? false : (depthWrite !== undefined ? depthWrite : true)
    });
    return new T.Mesh(geo, mat);
  }

  function addStatcastTracer(grp, pts, opts) {
    if (pts.length < 2) return;
    // 1. Sleek, thin main core tube (radius 0.08m ~ 0.105m instead of previous chunky 0.36m!)
    const core = buildTubeMesh(pts, opts.coreRadius || 0.10, opts.coreColor, opts.coreOpacity !== undefined ? opts.coreOpacity : 1.0, false, true);
    if (core) grp.add(core);

    // 2. High-intensity optic center filament (bright luminous core, radius ~0.045m)
    if (opts.filamentColor) {
      const filament = buildTubeMesh(pts, opts.filamentRadius || 0.045, opts.filamentColor, 0.95, false, true);
      if (filament) grp.add(filament);
    }

    // 3. Subtle luminous neon bloom halo (radius ~0.22m, additive blending)
    if (opts.haloColor) {
      const halo = buildTubeMesh(pts, opts.haloRadius || 0.22, opts.haloColor, opts.haloOpacity || 0.38, true, false);
      if (halo) grp.add(halo);
    }
  }

  function rebuild3DTrajectories() {
    clearGroup(trajGroup);

    if (state.mode === 'single') {
      const cmp = state.comparison;
      if (!cmp) return;

      const sRad = (Number(state.sprayDeg) || 0) * DEG;
      const cosS = Math.cos(sRad);
      const sinS = Math.sin(sRad);

      // 1. Vacuum comparison trajectory (⚪ 銀白對照線，教科書拋物線，45° 最遠)
      if (state.showVacuum && cmp.vacuum) {
        const vacPts = samplePathUpToTime(cmp.vacuum.path, state.animTime, state.sprayDeg);
        addStatcastTracer(trajGroup, vacPts, {
          coreRadius: 0.065,
          coreColor: 0xe2e8f0,
          coreOpacity: 0.85,
          filamentRadius: 0.025,
          filamentColor: 0xffffff,
          haloRadius: 0.13,
          haloColor: 0x94a3b8,
          haloOpacity: 0.30
        });

        // 3D floating badge on Vacuum trajectory
        if (state.animTime >= Math.min(0.8, cmp.vacuum.apexTimeS) && vacPts.length > 3) {
          const vx = cmp.vacuum.apexX * cosS;
          const vz = cmp.vacuum.apexX * sinS;
          const vy = cmp.vacuum.apexM;
          const vacLbl = makeTextSprite(`⚪ 真空無阻力 · 最高點 ${vy.toFixed(1)}m`, {
            w: 380, h: 76, font: 'bold 26px "Segoe UI", sans-serif',
            color: '#0f172a', bg: 'rgba(241, 245, 249, 0.94)', border: '#94a3b8',
            scaleX: 9.8, scaleY: 2.3
          });
          vacLbl.position.set(vx, vy + 2.4, vz);
          trajGroup.add(vacLbl);
        }
      }

      // 2. Drag-only comparison trajectory (🔵 皇家藍，僅空氣阻力，無後旋升力)
      if (state.showDragOnly && cmp.dragOnly) {
        const dragPts = samplePathUpToTime(cmp.dragOnly.path, state.animTime, state.sprayDeg);
        addStatcastTracer(trajGroup, dragPts, {
          coreRadius: 0.075,
          coreColor: 0x3b82f6,
          coreOpacity: 0.9,
          filamentRadius: 0.032,
          filamentColor: 0xeff6ff,
          haloRadius: 0.16,
          haloColor: 0x60a5fa,
          haloOpacity: 0.35
        });

        // 3D floating badge on Drag-only trajectory
        if (state.animTime >= Math.min(0.7, cmp.dragOnly.apexTimeS) && dragPts.length > 3) {
          const dx = cmp.dragOnly.apexX * cosS;
          const dz = cmp.dragOnly.apexX * sinS;
          const dy = cmp.dragOnly.apexM;
          const dragLbl = makeTextSprite(`🔵 僅空氣阻力 · 最高點 ${dy.toFixed(1)}m`, {
            w: 360, h: 76, font: 'bold 26px "Segoe UI", sans-serif',
            color: '#1e3a8a', bg: 'rgba(219, 234, 254, 0.94)', border: '#3b82f6',
            scaleX: 9.2, scaleY: 2.3
          });
          dragLbl.position.set(dx, dy + 2.4, dz);
          trajGroup.add(dragLbl);
        }
      }

      // 3. Full Aerodynamic trajectory (🌟 耀眼金黃 for Fair; 🔴 雷射紅 for Foul)
      const fullPts = samplePathUpToTime(cmp.full.path, state.animTime, state.sprayDeg);
      const isFoul = !cmp.full.isFair;
      const isBarrel = cmp.full.isBarrel && cmp.full.isFair;

      let tracerOpts;
      let haloColorHex;
      let apexBorderColor;
      let apexBgColor;
      let apexTextColor;
      let apexTitle;

      if (isFoul) {
        // Laser Crimson (界外球 / 60°~90° 倒退沖天炮)
        tracerOpts = {
          coreRadius: 0.105,
          coreColor: 0xff1744,
          filamentRadius: 0.045,
          filamentColor: 0xfff1f2,
          haloRadius: 0.23,
          haloColor: 0xff0033,
          haloOpacity: 0.42
        };
        haloColorHex = 0xff1744;
        apexBorderColor = '#ff1744';
        apexBgColor = 'rgba(254, 226, 226, 0.95)';
        apexTextColor = '#991b1b';
        apexTitle = '🔴 界外球';
      } else if (isBarrel) {
        // MLB Barrel 全壘打甜蜜區 — 耀眼金黃白金光束
        tracerOpts = {
          coreRadius: 0.108,
          coreColor: 0xffea00,
          filamentRadius: 0.048,
          filamentColor: 0xffffff,
          haloRadius: 0.24,
          haloColor: 0xffd600,
          haloOpacity: 0.46
        };
        haloColorHex = 0xffea00;
        apexBorderColor = '#eab308';
        apexBgColor = 'rgba(254, 240, 138, 0.95)';
        apexTextColor = '#78350f';
        apexTitle = '🌟 真實擊球 (Barrel 全壘打)';
      } else {
        // 一般界內球 — 亦為耀眼金黃白金光束，完全避免與草皮綠色混淆
        tracerOpts = {
          coreRadius: 0.102,
          coreColor: 0xffea00,
          filamentRadius: 0.045,
          filamentColor: 0xffffff,
          haloRadius: 0.22,
          haloColor: 0xffd600,
          haloOpacity: 0.42
        };
        haloColorHex = 0xffea00;
        apexBorderColor = '#eab308';
        apexBgColor = 'rgba(254, 240, 138, 0.95)';
        apexTextColor = '#78350f';
        apexTitle = '🌟 真實擊球 (阻力+升力)';
      }

      addStatcastTracer(trajGroup, fullPts, tracerOpts);

      if (fullPts.length > 0) {
        const tip = fullPts[fullPts.length - 1];
        activeBall.visible = true;
        activeBall.position.copy(tip);
        activeBallHalo.material.color.setHex(haloColorHex);

        dropLine.visible = true;
        dropLine.geometry.setFromPoints([
          tip,
          new T.Vector3(tip.x, 0.02, tip.z)
        ]);
        dropLine.material.color.setHex(haloColorHex);
        dropLine.material.opacity = 0.65;

        groundShadow.visible = true;
        groundShadow.position.set(tip.x, 0.04, tip.z);
        groundShadow.material.color.setHex(haloColorHex);
      }

      // Apex Marker & Vertical Guide (最高點標記)
      if (cmp.full.apexM > 2 && fullPts.length > 3) {
        const apexX = cmp.full.apexX * cosS;
        const apexZ = cmp.full.apexX * sinS;
        const apexY = cmp.full.apexM;
        const apexPos = new T.Vector3(apexX, apexY, apexZ);

        // 球行經或越過最高點時顯現標記
        const curMaxY = fullPts.reduce((m, p) => Math.max(m, p.y), 0);
        if (curMaxY >= apexY * 0.94 || state.animTime >= cmp.full.hangTimeS * 0.45) {
          const apexDropGeo = new T.BufferGeometry().setFromPoints([
            apexPos,
            new T.Vector3(apexX, 0.03, apexZ)
          ]);
          const apexDropLine = new T.Line(
            apexDropGeo,
            new T.LineBasicMaterial({ color: haloColorHex, transparent: true, opacity: 0.45, depthWrite: false })
          );
          trajGroup.add(apexDropLine);

          const ringGeo = new T.RingGeometry(0.32, 0.62, 24);
          const ringMesh = new T.Mesh(
            ringGeo,
            new T.MeshBasicMaterial({ color: haloColorHex, side: T.DoubleSide, transparent: true, opacity: 0.85 })
          );
          ringMesh.position.copy(apexPos);
          ringMesh.rotation.x = -Math.PI / 2;
          trajGroup.add(ringMesh);

          const apexLbl = makeTextSprite(`${apexTitle} · 最高點 ${apexY.toFixed(1)}m`, {
            w: 430, h: 80, font: 'bold 27px "Segoe UI", sans-serif',
            color: apexTextColor, bg: apexBgColor,
            border: apexBorderColor,
            scaleX: 11.2, scaleY: 2.3
          });
          apexLbl.position.set(apexX, apexY + 2.5, apexZ);
          trajGroup.add(apexLbl);
        }
      }
    } else {
      // FAN MODE: 0° ~ 90° simultaneous fan trajectories!
      activeBall.visible = false;
      dropLine.visible = false;
      groundShadow.visible = false;

      const bz = B.barrelZone(state.speedKmh);
      const webPoints = [];
      const barrelApexSum = new T.Vector3();
      let barrelCount = 0;

      state.fanTrajectories.forEach((sim) => {
        const deg = sim.config.angleDeg;
        if (state.fanFilter === '0-60' && deg > 60) return;
        if (state.fanFilter === '60-90' && deg < 60) return;

        const pts = samplePathUpToTime(sim.path, state.animTime, state.sprayDeg);
        if (pts.length < 2) return;

        const inBarrel = bz.isBarrelEligible && deg >= bz.minDeg && deg <= bz.maxDeg && sim.isFair;
        const isHighPopup = deg >= 60;

        if (inBarrel) {
          addStatcastTracer(trajGroup, pts, {
            coreRadius: 0.08,
            coreColor: 0xffea00,
            filamentRadius: 0.035,
            filamentColor: 0xffffff,
            haloRadius: 0.18,
            haloColor: 0xffd600,
            haloOpacity: 0.44
          });
          const sRad = state.sprayDeg * DEG;
          barrelApexSum.add(new T.Vector3(sim.apexX * Math.cos(sRad), sim.apexM, sim.apexX * Math.sin(sRad)));
          barrelCount++;
        } else if (isHighPopup || !sim.isFair) {
          const col = !sim.isFair ? 0xff1744 : 0xff7700;
          addStatcastTracer(trajGroup, pts, {
            coreRadius: 0.055,
            coreColor: col,
            haloRadius: 0.13,
            haloColor: col,
            haloOpacity: 0.35
          });
        } else {
          const tube = buildTubeMesh(pts, 0.045, 0x64748b, 0.45, false, true);
          if (tube) trajGroup.add(tube);
        }

        webPoints.push(pts);
      });

      if (webPoints.length > 2) {
        const ribVerts = [];
        const maxLen = Math.max(...webPoints.map((p) => p.length));
        for (let k = 4; k < maxLen; k += 6) {
          for (let j = 0; j < webPoints.length - 1; j++) {
            const pA = webPoints[j][Math.min(k, webPoints[j].length - 1)];
            const pB = webPoints[j + 1][Math.min(k, webPoints[j + 1].length - 1)];
            if (pA && pB) {
              ribVerts.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
            }
          }
        }
        if (ribVerts.length > 0) {
          const ribGeo = new T.BufferGeometry();
          ribGeo.setAttribute('position', new T.Float32BufferAttribute(ribVerts, 3));
          const ribLines = new T.LineSegments(
            ribGeo,
            new T.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.28, blending: T.AdditiveBlending })
          );
          trajGroup.add(ribLines);
        }
      }

      if (bz.isBarrelEligible && barrelCount > 0 && state.animTime > 1.2 && state.fanFilter !== '60-90') {
        barrelApexSum.multiplyScalar(1 / barrelCount);
        const label = makeTextSprite(`Barrel 全壘打區間 ${bz.minDeg}～${bz.maxDeg}°`, {
          w: 380,
          h: 92,
          font: 'bold 36px "Segoe UI", sans-serif',
          color: '#78350f',
          bg: 'rgba(254, 240, 138, 0.95)',
          border: '#eab308',
          scaleX: 11.5,
          scaleY: 3.2
        });
        label.position.set(barrelApexSum.x, barrelApexSum.y + 4.5, barrelApexSum.z);
        trajGroup.add(label);
      }
    }
  }

  // ---------- Recompute Physics & Update UI ----------
  function computeAll(resetAnim) {
    const cfg = {
      speedKmh: state.speedKmh,
      angleDeg: state.angleDeg,
      sprayDeg: state.sprayDeg,
      rpm: state.rpm,
      cd: state.cd,
      altitudeM: state.altitudeM,
      windMs: state.windMs
    };

    state.comparison = B.compareModels(cfg);
    state.sweep = B.sweepAngles(cfg, 90, 1);

    state.fanTrajectories = [];
    for (let deg = 0; deg <= 90; deg += 2) {
      state.fanTrajectories.push(B.simulateBattedBall({ ...cfg, angleDeg: deg }));
    }

    if (resetAnim) {
      state.animTime = 0;
      if (state.mode === 'single') {
        state.maxAnimTime = Math.max(
          state.comparison.full.hangTimeS,
          state.showVacuum ? Math.min(state.comparison.vacuum.hangTimeS, state.comparison.full.hangTimeS + 1.2) : 0
        );
      } else {
        state.maxAnimTime = 6.8;
      }
    }

    updateReadouts();
    drawAngleChart();
    drawPhaseChart();
  }

  function formatHangTime(sec) {
    const s = Math.max(0, sec);
    const whole = Math.floor(s);
    const cs = Math.floor((s - whole) * 100);
    return `0:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  function sprayDescription(sprayDeg) {
    const s = Math.round(sprayDeg);
    if (Math.abs(s) > 45) return `${s > 0 ? '+' : ''}${s}° (${s > 0 ? '右' : '左'}界外)`;
    if (s === 0) return `0° (中外野)`;
    if (s === -45) return `−45° (三壘邊線)`;
    if (s === 45) return `+45° (一壘邊線)`;
    return `${s > 0 ? '+' : ''}${s}° (${s > 0 ? '右' : '左'}外野)`;
  }

  function updateHUD() {
    const full = state.comparison ? state.comparison.full : null;
    if (!full) return;

    const bz = B.barrelZone(state.speedKmh);
    $('hud-speed').innerHTML = `${Math.round(state.speedKmh)}<small>km/h</small>`;
    $('hud-angle').innerHTML = state.mode === 'fan'
      ? (state.fanFilter === '60-90' ? `60–90<small>度</small>` : `0–90<small>度</small>`)
      : `${Math.round(state.angleDeg)}<small>度</small>`;

    const sDeg = Math.round(state.sprayDeg);
    const sDir = sDeg === 0 ? '中外野' : (sDeg > 0 ? '右外野' : '左外野');
    $('hud-spray').innerHTML = `${sDeg > 0 ? '+' : ''}${sDeg}°<small>${sDir}</small>`;

    const tCur = Math.min(state.animTime, full.hangTimeS);
    let curX = full.carryM;
    for (let i = 0; i < full.path.length; i++) {
      if (full.path[i].t >= tCur) {
        curX = full.path[i].x;
        break;
      }
    }
    $('hud-time').textContent = formatHangTime(tCur);
    $('hud-dist').innerHTML = `${Math.round(curX)}<small>m</small>`;

    // Fair / Foul badge
    const fairBadge = $('hud-fair-badge');
    if (full.isFair) {
      fairBadge.textContent = '界內 FAIR';
      fairBadge.className = 'hud-fair-badge fair';
    } else {
      fairBadge.textContent = full.carryM <= 0 ? '界外 FOUL (本壘後方)' : '界外 FOUL (邊線外)';
      fairBadge.className = 'hud-fair-badge foul';
    }

    const outcomeEl = $('hud-outcome');
    outcomeEl.hidden = false;
    outcomeEl.className = `hud-outcome outcome-${full.outcome}`;
    outcomeEl.textContent = full.outcomeLabel;

    if (!state.storyPlaying) {
      const windStr = state.windMs === 0 ? '無風' : (state.windMs > 0 ? `順風 +${state.windMs}m/s` : `逆風 ${state.windMs}m/s`);
      $('hud-eyebrow').textContent = `${state.speedKmh} km/h · 水平 ${sprayDescription(state.sprayDeg)} · 海拔 ${state.altitudeM}m · ${windStr}`;
      $('hud-badge').textContent = state.paused ? '已暫停' : `播放 ×${state.timeScale === 0.125 ? '1/8' : state.timeScale}`;

      if (state.mode === 'fan') {
        if (state.fanFilter === '60-90') {
          $('hud-title').textContent = `60°～90° 沖天炮與後旋倒退界外球`;
          $('hud-subtitle').textContent = `超過 83° 的沖天炮因上升段後旋馬格努斯力 (−vy) 倒退飛進本壘板後方界外區 (x < 0)！`;
        } else {
          $('hud-title').textContent = bz.isBarrelEligible
            ? `${state.speedKmh} km/h：MLB Barrel 黃金仰角 ${bz.minDeg}°～${bz.maxDeg}°（寬 ${bz.widthDeg}°）`
            : `0°～90° 全仰角軌跡展開（初速未達 158 km/h Barrel 門檻）`;
          $('hud-subtitle').textContent = `深綠色為 MLB Barrel 甜蜜區 · 紅色為 83°–90° 倒退界外球 · 橘色為 60°–82° 沖天炮`;
        }
      } else {
        if (!full.isFair && full.carryM <= 0) {
          $('hud-title').textContent = `${state.angleDeg}度：往本壘後方倒退 ${Math.abs(Math.round(full.carryM))}m（界外球）！`;
          $('hud-subtitle').textContent = `${full.outcomeLabel} · 上升段後旋馬格努斯力把球推向捕手後方 · 滯空 ${full.hangTimeS.toFixed(1)} 秒`;
        } else if (!full.isFair) {
          $('hud-title').textContent = `水平 ${sDeg > 0 ? '+' : ''}${sDeg}°：越過 ±45° 邊線形成界外球！`;
          $('hud-subtitle').textContent = `${full.outcomeLabel} · 飛行距離 ${Math.round(full.carryM)}m，但落點在界外標竿外側，不計全壘打或安打`;
        } else if (state.angleDeg >= 60) {
          $('hud-title').textContent = `${state.angleDeg}度：超高沖天炮（最高點 ${Math.round(full.apexM)}m）`;
          $('hud-subtitle').textContent = `界內飛距離僅 ${Math.round(full.carryM)}m · 滯空長達 ${full.hangTimeS.toFixed(1)} 秒（真空原本可飛 ${Math.round(state.comparison.vacuum.carryM)}m）`;
        } else if (full.outcome === 'HR') {
          $('hud-title').textContent = `${state.angleDeg}度：飛進 ${Math.round(full.carryM)}m 外野看台的全壘打！`;
          $('hud-subtitle').textContent = `界內有效全壘打 · 滯空 ${full.hangTimeS.toFixed(1)} 秒${full.isBarrel ? ' · 位於 MLB Barrel 甜蜜區' : ''}`;
        } else if (state.angleDeg <= 16) {
          $('hud-title').textContent = `${state.angleDeg}度：仰角太低（平飛安打）`;
          $('hud-subtitle').textContent = `界內 ${Math.round(full.carryM)}m · ${full.hangTimeS.toFixed(1)} 秒落地（靠後旋升力比真空 ${Math.round(state.comparison.vacuum.carryM)}m 還遠！）`;
        } else {
          $('hud-title').textContent = `${state.angleDeg}度：界內外野高飛接殺`;
          $('hud-subtitle').textContent = `真實飛距離 ${Math.round(full.carryM)}m · 滯空 ${full.hangTimeS.toFixed(1)} 秒（空氣阻力吃掉 ${Math.round(state.comparison.netAeroLossM)}m）`;
        }
      }
    }
  }

  function updateReadouts() {
    const cmp = state.comparison;
    const sw = state.sweep;
    const bz = B.barrelZone(state.speedKmh);

    const mph = (state.speedKmh / 1.609344).toFixed(1);
    $('speed-out').textContent = `${state.speedKmh} km/h (${mph} mph)`;
    $('angle-out').textContent = `${state.angleDeg}°${state.angleDeg >= 60 ? ' (沖天炮區)' : ''}`;
    $('spray-out').textContent = `${sprayDescription(state.sprayDeg)} · ${cmp.full.isFair ? '界內' : '界外'}`;
    $('rpm-out').textContent = `${state.rpm} rpm`;
    $('cd-out').textContent = state.cd.toFixed(2);
    $('alt-out').textContent = state.altitudeM === 0 ? `0 m (海平面)` : `${state.altitudeM} m (ρ=${cmp.full.airDensity})`;
    $('wind-out').textContent = state.windMs === 0 ? `0 m/s (無風)` : `${state.windMs > 0 ? '+' : ''}${state.windMs} m/s (${state.windMs > 0 ? '順風' : '逆風'})`;

    $('r-fair-status').textContent = cmp.full.isFair
      ? `界內 FAIR (${cmp.full.outcomeLabel.split(' ')[0]})`
      : `界外 FOUL (${cmp.full.carryM <= 0 ? '本壘後方' : '±45°邊線外'})`;
    $('r-full-dist').textContent = `${cmp.full.carryM.toFixed(1)} m`;
    $('r-drag-dist').textContent = `${cmp.dragOnly.carryM.toFixed(1)} m`;
    $('r-vac-dist').textContent = `${cmp.vacuum.carryM.toFixed(1)} m`;
    $('r-drag-loss').textContent = `−${cmp.dragLossM.toFixed(1)} m`;
    $('r-spin-gain').textContent = `${cmp.spinGainM >= 0 ? '+' : ''}${cmp.spinGainM.toFixed(1)} m`;
    $('r-apex-time').textContent = `${cmp.full.apexM.toFixed(1)} m ／ ${cmp.full.hangTimeS.toFixed(2)} s`;
    $('r-impact-speed').textContent = `${cmp.full.impactSpeedKmh.toFixed(1)} km/h`;
    $('r-barrel-zone').textContent = bz.isBarrelEligible
      ? `${bz.minDeg}°–${bz.maxDeg}° (寬 ${bz.widthDeg}°)`
      : `無 (< 158 km/h)`;

    $('optimal-tag').textContent = `真實最佳 ${sw.optimal.full.angleDeg}° (${Math.round(sw.optimal.full.carryM)}m) · 真空 ${sw.optimal.vacuum.angleDeg}° (${Math.round(sw.optimal.vacuum.carryM)}m)`;
    $('barrel-tag').textContent = bz.isBarrelEligible
      ? `Barrel ${bz.minDeg}°–${bz.maxDeg}° (寬 ${bz.widthDeg}°)`
      : `未達 98 mph 門檻`;

    syncControlInputs();
  }

  // ---------- 2D Chart 1: 0°~90° Angle vs Carry Distance (Light Theme) ----------
  const angleCanvas = $('angle-chart');
  const angleCtx = angleCanvas.getContext('2d');

  function drawAngleChart() {
    const sw = state.sweep;
    if (!sw) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = angleCanvas.getBoundingClientRect();
    const W = Math.max(320, Math.round(rect.width * dpr));
    const H = Math.max(180, Math.round(rect.height * dpr));
    if (angleCanvas.width !== W || angleCanvas.height !== H) {
      angleCanvas.width = W;
      angleCanvas.height = H;
    }

    const g = angleCtx;
    g.save();
    g.scale(dpr, dpr);
    const w = W / dpr, h = H / dpr;
    g.clearRect(0, 0, w, h);

    const pad = { l: 44, r: 18, t: 18, b: 30 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;

    const yMin = -35;
    const yMax = Math.max(210, Math.ceil((sw.optimal.vacuum.carryM + 15) / 20) * 20);
    const xToPx = (deg) => pad.l + (deg / 90) * pw;
    const yToPx = (dist) => pad.t + (1 - (dist - yMin) / (yMax - yMin)) * ph;

    // 1. Shaded 60°~90° Pop-up & Backward Foul Zone
    g.fillStyle = 'rgba(201, 42, 42, 0.06)';
    g.fillRect(xToPx(60), pad.t, xToPx(90) - xToPx(60), ph);

    // Shaded x < 0 (Behind home plate = Foul territory)
    const pyZero = yToPx(0);
    g.fillStyle = 'rgba(201, 42, 42, 0.09)';
    g.fillRect(pad.l, pyZero, pw, pad.t + ph - pyZero);

    // 2. Shaded MLB Barrel Zone
    if (sw.barrel.isBarrelEligible) {
      const bx1 = xToPx(sw.barrel.minDeg);
      const bx2 = xToPx(sw.barrel.maxDeg);
      g.fillStyle = 'rgba(21, 128, 61, 0.16)';
      g.fillRect(bx1, pad.t, Math.max(3, bx2 - bx1), ph);
    }

    // 3. Grid lines
    g.font = '11px "Cascadia Code", Consolas, monospace';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const yVal of [-20, 0, 50, 100, 150, 200]) {
      if (yVal > yMax) continue;
      const py = yToPx(yVal);
      g.strokeStyle = yVal === 0 ? 'rgba(31, 49, 64, 0.45)' : 'rgba(31, 49, 64, 0.1)';
      g.lineWidth = yVal === 0 ? 1.3 : 1;
      g.beginPath();
      g.moveTo(pad.l, py);
      g.lineTo(w - pad.r, py);
      g.stroke();
      g.fillStyle = '#5d7080';
      g.fillText(`${yVal}m`, pad.l - 6, py);
    }

    // 110m Home Run Wall dashed line
    const pyWall = yToPx(110);
    g.strokeStyle = '#d97706';
    g.lineWidth = 1.3;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.moveTo(pad.l, pyWall);
    g.lineTo(w - pad.r, pyWall);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#b45309';
    g.textAlign = 'left';
    g.fillText('110m 全壘打牆', pad.l + 6, pyWall - 8);

    g.fillStyle = '#c92a2a';
    g.fillText('x < 0 本壘後方界外區', pad.l + 6, pyZero + 11);

    // X-axis angle labels (0° ~ 90°)
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const deg of [0, 15, 30, 45, 60, 75, 90]) {
      const px = xToPx(deg);
      g.strokeStyle = deg === 60 ? 'rgba(201, 42, 42, 0.3)' : 'rgba(31, 49, 64, 0.08)';
      g.beginPath();
      g.moveTo(px, pad.t);
      g.lineTo(px, pad.t + ph);
      g.stroke();
      g.fillStyle = deg >= 60 ? '#c92a2a' : '#5d7080';
      g.fillText(`${deg}°`, px, pad.t + ph + 7);
    }

    function plotCurve(arr, color, width, dash) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash || []);
      g.beginPath();
      arr.forEach((pt, i) => {
        const px = xToPx(pt.config.angleDeg);
        const py = yToPx(pt.carryM);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.stroke();
      g.setLineDash([]);
    }

    plotCurve(sw.vacuum, '#64748b', 1.6, [5, 4]);
    plotCurve(sw.dragOnly, '#2563eb', 1.8, [2, 3]);
    plotCurve(sw.full, '#e8590c', 2.6, []);

    const curX = xToPx(state.angleDeg);
    g.strokeStyle = 'rgba(31, 49, 64, 0.45)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(curX, pad.t);
    g.lineTo(curX, pad.t + ph);
    g.stroke();

    if (state.comparison) {
      const pts = [
        { y: state.comparison.vacuum.carryM, c: '#64748b', r: 3.5 },
        { y: state.comparison.dragOnly.carryM, c: '#2563eb', r: 4 },
        { y: state.comparison.full.carryM, c: '#e8590c', r: 5.5 }
      ];
      pts.forEach((p) => {
        g.fillStyle = p.c;
        g.beginPath();
        g.arc(curX, yToPx(p.y), p.r, 0, Math.PI * 2);
        g.fill();
      });
    }

    g.restore();
  }

  // ---------- 2D Chart 2: Speed × Angle (0°~90°) Phase Diagram (Light Theme) ----------
  const phaseCanvas = $('phase-chart');
  const phaseCtx = phaseCanvas.getContext('2d');

  function drawPhaseChart() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = phaseCanvas.getBoundingClientRect();
    const W = Math.max(320, Math.round(rect.width * dpr));
    const H = Math.max(180, Math.round(rect.height * dpr));
    if (phaseCanvas.width !== W || phaseCanvas.height !== H) {
      phaseCanvas.width = W;
      phaseCanvas.height = H;
    }

    const g = phaseCtx;
    g.save();
    g.scale(dpr, dpr);
    const w = W / dpr, h = H / dpr;
    g.clearRect(0, 0, w, h);

    const pad = { l: 42, r: 18, t: 18, b: 30 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;

    const vMin = 80, vMax = 195;
    const vToPx = (v) => pad.l + ((v - vMin) / (vMax - vMin)) * pw;
    const aToPx = (deg) => pad.t + (1 - deg / 90) * ph;

    // 1. 60°~90° Pop-up & Backward Foul Zone
    g.fillStyle = 'rgba(201, 42, 42, 0.08)';
    g.fillRect(pad.l, aToPx(90), pw, aToPx(60) - aToPx(90));
    g.fillStyle = '#c92a2a';
    g.font = '11px "Segoe UI", sans-serif';
    g.textAlign = 'left';
    g.fillText('60°–90° 沖天炮區 (83°+ 倒退至本壘後方界外)', pad.l + 8, aToPx(82));

    // 2. MLB Statcast Barrel Polygon
    g.fillStyle = 'rgba(21, 128, 61, 0.22)';
    g.strokeStyle = '#15803d';
    g.lineWidth = 2;
    g.beginPath();
    const speeds = [];
    for (let v = 158; v <= vMax; v += 1) speeds.push(v);
    speeds.forEach((v, idx) => {
      const bz = B.barrelZone(v);
      const px = vToPx(v);
      const py = aToPx(bz.maxDeg);
      if (idx === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    for (let idx = speeds.length - 1; idx >= 0; idx--) {
      const v = speeds[idx];
      const bz = B.barrelZone(v);
      g.lineTo(vToPx(v), aToPx(bz.minDeg));
    }
    g.closePath();
    g.fill();
    g.stroke();

    // 3. Grid & Axes
    g.font = '11px "Cascadia Code", Consolas, monospace';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const deg of [0, 15, 30, 45, 60, 75, 90]) {
      const py = aToPx(deg);
      g.strokeStyle = deg === 60 ? 'rgba(201, 42, 42, 0.3)' : 'rgba(31, 49, 64, 0.1)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pad.l, py);
      g.lineTo(w - pad.r, py);
      g.stroke();
      g.fillStyle = deg >= 60 ? '#c92a2a' : '#5d7080';
      g.fillText(`${deg}°`, pad.l - 6, py);
    }

    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const v of [80, 100, 120, 140, 158, 175, 190]) {
      const px = vToPx(v);
      g.strokeStyle = v === 158 ? 'rgba(21, 128, 61, 0.4)' : 'rgba(31, 49, 64, 0.08)';
      g.beginPath();
      g.moveTo(px, pad.t);
      g.lineTo(px, pad.t + ph);
      g.stroke();
      g.fillStyle = v === 158 ? '#15803d' : '#5d7080';
      g.fillText(`${v}`, px, pad.t + ph + 7);
    }

    g.fillStyle = '#15803d';
    g.font = 'bold 11.5px "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillText('MLB BARREL 甜蜜區', vToPx(178), aToPx(29));

    const cx = vToPx(state.speedKmh);
    const cy = aToPx(state.angleDeg);
    g.strokeStyle = '#1f3140';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(cx, cy, 6.5, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = state.comparison && state.comparison.full.isBarrel ? '#15803d' : '#e8590c';
    g.beginPath();
    g.arc(cx, cy, 3.8, 0, Math.PI * 2);
    g.fill();

    g.restore();
  }

  // ---------- Interactive Chart Click / Drag ----------
  function bindChartPointer(canvasEl, handler) {
    let down = false;
    canvasEl.addEventListener('pointerdown', (e) => {
      down = true;
      canvasEl.setPointerCapture(e.pointerId);
      handler(e);
    });
    canvasEl.addEventListener('pointermove', (e) => {
      if (down) handler(e);
    });
    canvasEl.addEventListener('pointerup', () => { down = false; });
  }

  bindChartPointer(angleCanvas, (e) => {
    stopStoryMode();
    const rect = angleCanvas.getBoundingClientRect();
    const padL = 44, padR = 18;
    const u = clamp((e.clientX - rect.left - padL) / Math.max(1, rect.width - padL - padR), 0, 1);
    state.angleDeg = Math.round(u * 90);
    $('angle-slider').value = state.angleDeg;
    state.mode = 'single';
    state.paused = false;
    syncPlaybackButtons();
    syncModeButtons();
    computeAll(true);
  });

  bindChartPointer(phaseCanvas, (e) => {
    stopStoryMode();
    const rect = phaseCanvas.getBoundingClientRect();
    const padL = 42, padR = 18, padT = 18, padB = 30;
    const ux = clamp((e.clientX - rect.left - padL) / Math.max(1, rect.width - padL - padR), 0, 1);
    const uy = clamp((e.clientY - rect.top - padT) / Math.max(1, rect.height - padT - padB), 0, 1);
    state.speedKmh = Math.round(80 + ux * (195 - 80));
    state.angleDeg = Math.round((1 - uy) * 90);
    $('speed-slider').value = state.speedKmh;
    $('angle-slider').value = state.angleDeg;
    state.paused = false;
    syncPlaybackButtons();
    computeAll(true);
  });

  // ---------- Playback Controls (Pause / Play / Speed Buttons) ----------
  function syncPlaybackButtons() {
    const pauseBtn = $('play-pause-btn');
    if (pauseBtn) {
      pauseBtn.textContent = state.paused ? '▶ 繼續播放' : '⏸ 暫停';
      pauseBtn.classList.toggle('paused', state.paused);
    }
    document.querySelectorAll('[data-speed]').forEach((btn) => {
      const sp = Number(btn.dataset.speed);
      btn.classList.toggle('active', Math.abs(sp - state.timeScale) < 0.05);
    });
  }

  $('play-pause-btn').addEventListener('click', () => {
    state.paused = !state.paused;
    if (state.paused) stopStoryMode();
    syncPlaybackButtons();
    updateHUD();
  });

  document.querySelectorAll('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.timeScale = Number(btn.dataset.speed) || 1;
      state.paused = false;
      syncPlaybackButtons();
      updateHUD();
    });
  });

  // ---------- Story Reel Mode ----------
  function applyStoryChapter(index) {
    const ch = B.STORY_CHAPTERS[index];
    if (!ch) return;
    state.storyIndex = index;
    state.storyTimer = 0;
    state.paused = false;

    state.speedKmh = ch.config.speedKmh;
    state.angleDeg = ch.config.angleDeg;
    state.sprayDeg = 0;
    state.rpm = ch.config.rpm;
    state.altitudeM = ch.config.altitudeM;
    state.windMs = ch.config.windMs;
    state.mode = ch.mode;
    state.timeScale = ch.timeScale;
    state.fanFilter = ch.highlightRange ? '60-90' : '0-90';

    $('speed-slider').value = state.speedKmh;
    $('angle-slider').value = state.angleDeg;
    $('spray-slider').value = state.sprayDeg;
    $('rpm-slider').value = state.rpm;
    $('alt-slider').value = state.altitudeM;
    $('wind-slider').value = state.windMs;

    setCameraPreset(ch.camera, false);
    syncModeButtons();
    syncPlaybackButtons();

    document.querySelectorAll('.chapter-pill').forEach((btn, idx) => {
      btn.classList.toggle('active', idx === index);
    });

    computeAll(true);

    $('hud-badge').textContent = ch.badge;
    $('hud-title').textContent = ch.title;
    $('hud-subtitle').textContent = ch.subtitle;
    $('hud-eyebrow').textContent = `故事展演 (${index + 1}/${B.STORY_CHAPTERS.length}) · 打球計算（空氣阻力・後旋）`;
  }

  function stopStoryMode() {
    if (!state.storyPlaying) return;
    state.storyPlaying = false;
    const btn = $('story-play');
    btn.classList.remove('playing');
    btn.textContent = '▶ 自動展演故事 (8 幕)';
  }

  $('story-play').addEventListener('click', () => {
    if (state.storyPlaying) {
      stopStoryMode();
    } else {
      state.storyPlaying = true;
      const btn = $('story-play');
      btn.classList.add('playing');
      btn.textContent = '⏸ 停止故事連播';
      applyStoryChapter(0);
    }
  });

  $('replay-shot').addEventListener('click', () => {
    state.animTime = 0;
    state.paused = false;
    syncPlaybackButtons();
  });

  document.querySelectorAll('.chapter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.chapter);
      applyStoryChapter(idx);
    });
  });

  // ---------- Controls & Event Listeners ----------
  function syncModeButtons() {
    document.querySelectorAll('[data-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === state.mode);
    });
    $('fan-filter-bar').hidden = state.mode !== 'fan';
    document.querySelectorAll('[data-fan]').forEach((b) => {
      b.classList.toggle('active', b.dataset.fan === state.fanFilter);
    });
  }

  document.querySelectorAll('[data-cam]').forEach((btn) => {
    btn.addEventListener('click', () => setCameraPreset(btn.dataset.cam, false));
  });

  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopStoryMode();
      state.mode = btn.dataset.mode;
      state.paused = false;
      syncPlaybackButtons();
      syncModeButtons();
      computeAll(true);
    });
  });

  document.querySelectorAll('[data-fan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopStoryMode();
      state.fanFilter = btn.dataset.fan;
      syncModeButtons();
      if (state.fanFilter === '60-90') {
        setCameraPreset('side', false);
      }
      state.animTime = 0;
      state.paused = false;
      syncPlaybackButtons();
    });
  });

  $('time-scale').addEventListener('change', (e) => {
    state.timeScale = Number(e.target.value) || 1;
    syncPlaybackButtons();
  });

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopStoryMode();
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', b === btn));
      state.speedKmh = p.speedKmh;
      state.angleDeg = p.angleDeg;
      state.sprayDeg = p.sprayDeg || 0;
      state.rpm = p.rpm;
      state.cd = p.cd;
      state.altitudeM = p.altitudeM;
      state.windMs = p.windMs;
      state.mode = p.mode;
      state.timeScale = p.scale;
      state.fanFilter = '0-90';
      state.paused = false;

      $('speed-slider').value = state.speedKmh;
      $('angle-slider').value = state.angleDeg;
      $('spray-slider').value = state.sprayDeg;
      $('rpm-slider').value = state.rpm;
      $('cd-slider').value = state.cd;
      $('alt-slider').value = state.altitudeM;
      $('wind-slider').value = state.windMs;
      setCameraPreset(p.cam, false);
      syncModeButtons();
      syncPlaybackButtons();
      computeAll(true);
    });
  });

  function applyControlValue(meta, rawVal, commitInput) {
    stopStoryMode();
    const factor = Math.pow(10, meta.decimals);
    const clamped = clamp(Math.round(Number(rawVal) * factor) / factor, meta.min, meta.max);
    state[meta.key] = clamped;
    const formatted = formatControlVal(meta, clamped);
    const sliderEl = $(meta.sliderId);
    const numEl = $(meta.numId);
    if (sliderEl) sliderEl.value = formatted;
    if (numEl && commitInput) numEl.value = formatted;
    state.paused = false;
    syncPlaybackButtons();
    computeAll(meta.restart);
  }

  function stepControl(meta, dir) {
    const cur = Number(state[meta.key]) || 0;
    applyControlValue(meta, cur + dir * meta.step, true);
  }

  SLIDER_META.forEach((meta) => {
    const sliderEl = $(meta.sliderId);
    const numEl = $(meta.numId);

    if (sliderEl) {
      sliderEl.addEventListener('input', (e) => {
        applyControlValue(meta, Number(e.target.value), true);
      });
    }

    if (numEl) {
      numEl.addEventListener('focus', () => {
        numEl.select();
      });

      numEl.addEventListener('input', () => {
        const raw = numEl.value.trim();
        if (raw === '' || raw === '-' || raw === '.') return;
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= meta.min && parsed <= meta.max) {
          applyControlValue(meta, parsed, false);
        }
      });

      const commitNum = () => {
        const raw = numEl.value.trim();
        const parsed = raw === '' ? state[meta.key] : Number(raw);
        const safe = Number.isFinite(parsed) ? parsed : state[meta.key];
        applyControlValue(meta, safe, true);
      };

      numEl.addEventListener('change', commitNum);
      numEl.addEventListener('blur', commitNum);
      numEl.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          stepControl(meta, 1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          stepControl(meta, -1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          commitNum();
          numEl.blur();
        }
      });
    }
  });

  // Up/Down triangle stepper buttons (supports single click + press-and-hold auto-repeat)
  document.querySelectorAll('.tri-btn[data-step-target]').forEach((btn) => {
    const targetId = btn.dataset.stepTarget;
    const dir = Number(btn.dataset.stepDir) || 1;
    const meta = SLIDER_META.find((m) => m.sliderId === targetId);
    if (!meta) return;

    let holdTimeout = null;
    let holdInterval = null;
    let didHold = false;

    const clearHold = () => {
      if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null; }
      if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
    };

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      didHold = false;
      clearHold();
      holdTimeout = setTimeout(() => {
        didHold = true;
        stepControl(meta, dir);
        holdInterval = setInterval(() => stepControl(meta, dir), 75);
      }, 360);
    });

    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((evt) => {
      btn.addEventListener(evt, clearHold);
    });

    btn.addEventListener('click', () => {
      clearHold();
      if (didHold) {
        didHold = false;
        return;
      }
      stepControl(meta, dir);
    });
  });

  document.querySelectorAll('[data-d-angle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopStoryMode();
      const d = Number(btn.dataset.dAngle);
      state.angleDeg = clamp(state.angleDeg + d, 0, 90);
      $('angle-slider').value = state.angleDeg;
      state.mode = 'single';
      state.paused = false;
      syncPlaybackButtons();
      syncModeButtons();
      computeAll(true);
    });
  });

  document.querySelectorAll('[data-set-spray]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopStoryMode();
      state.sprayDeg = Number(btn.dataset.setSpray) || 0;
      $('spray-slider').value = state.sprayDeg;
      computeAll(false);
    });
  });

  $('show-vacuum').addEventListener('change', (e) => {
    state.showVacuum = e.target.checked;
  });
  $('show-drag-only').addEventListener('change', (e) => {
    state.showDragOnly = e.target.checked;
  });

  $('reset-btn').addEventListener('click', () => {
    stopStoryMode();
    state.speedKmh = 158;
    state.angleDeg = 28;
    state.sprayDeg = 0;
    state.rpm = 1260;
    state.cd = 0.398;
    state.altitudeM = 0;
    state.windMs = 0;
    state.mode = 'single';
    state.fanFilter = '0-90';
    state.timeScale = 1.0;
    state.paused = false;
    $('speed-slider').value = 158;
    $('angle-slider').value = 28;
    $('spray-slider').value = 0;
    $('rpm-slider').value = 1260;
    $('cd-slider').value = 0.40;
    $('alt-slider').value = 0;
    $('wind-slider').value = 0;
    setCameraPreset('stadium', false);
    syncModeButtons();
    syncPlaybackButtons();
    computeAll(true);
  });

  // ---------- 3D Canvas Pointer Orbit & Zoom ----------
  let lastPtr = { x: 0, y: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    camOrbit.userDragging = true;
    lastPtr = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!camOrbit.userDragging) return;
    const dx = e.clientX - lastPtr.x;
    const dy = e.clientY - lastPtr.y;
    lastPtr = { x: e.clientX, y: e.clientY };
    camOrbit.spherical.theta -= dx * 0.0055;
    camOrbit.spherical.phi = clamp(camOrbit.spherical.phi - dy * 0.0055, 0.12, Math.PI / 2 - 0.04);
    const r = camOrbit.spherical.radius;
    camOrbit.goalPos.set(
      camOrbit.GoalTarget.x + r * Math.sin(camOrbit.spherical.phi) * Math.sin(camOrbit.spherical.theta),
      camOrbit.GoalTarget.y + r * Math.cos(camOrbit.spherical.phi),
      camOrbit.GoalTarget.z + r * Math.sin(camOrbit.spherical.phi) * Math.cos(camOrbit.spherical.theta)
    );
  });
  canvas.addEventListener('pointerup', () => { camOrbit.userDragging = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camOrbit.spherical.radius = clamp(camOrbit.spherical.radius * (1 + e.deltaY * 0.001), 5, 220);
    const r = camOrbit.spherical.radius;
    camOrbit.goalPos.set(
      camOrbit.GoalTarget.x + r * Math.sin(camOrbit.spherical.phi) * Math.sin(camOrbit.spherical.theta),
      camOrbit.GoalTarget.y + r * Math.cos(camOrbit.spherical.phi),
      camOrbit.GoalTarget.z + r * Math.sin(camOrbit.spherical.phi) * Math.cos(camOrbit.spherical.theta)
    );
  }, { passive: false });

  function resizeRenderer() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(300, rect.width);
    const h = Math.max(250, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    drawAngleChart();
    drawPhaseChart();
  }
  window.addEventListener('resize', resizeRenderer);

  // ---------- Main Animation Loop ----------
  let prevClock = performance.now();

  function tick(now) {
    const dt = Math.min(0.05, (now - prevClock) / 1000);
    prevClock = now;

    if (!state.paused) {
      state.animTime += dt * state.timeScale;
      if (state.animTime > state.maxAnimTime + 1.4) {
        if (!state.storyPlaying) {
          state.animTime = 0;
        }
      }

      if (state.storyPlaying) {
        state.storyTimer += dt;
        const ch = B.STORY_CHAPTERS[state.storyIndex];
        if (ch && state.storyTimer >= ch.durationS) {
          const nextIdx = (state.storyIndex + 1) % B.STORY_CHAPTERS.length;
          applyStoryChapter(nextIdx);
        }
      }
    }

    if (batterBatPivot) {
      const swingProgress = clamp(state.animTime / 0.22, 0, 1);
      batterBatPivot.rotation.y = -0.85 + swingProgress * 1.95;
    }

    rebuild3DTrajectories();

    // Dynamic "follow" camera tracks the ball in flight
    if (state.cameraPreset === 'follow' && activeBall.visible && !camOrbit.userDragging) {
      const bp = activeBall.position;
      camOrbit.GoalTarget.copy(bp);
      camOrbit.goalPos.set(bp.x - 18, Math.max(3.5, bp.y + 6), bp.z + 24);
    }

    camOrbit.pos.lerp(camOrbit.goalPos, Math.min(1, dt * 6));
    camOrbit.target.lerp(camOrbit.GoalTarget, Math.min(1, dt * 6));
    camera.position.copy(camOrbit.pos);
    camera.lookAt(camOrbit.target);

    updateHUD();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  // Initialize
  setCameraPreset('stadium', true);
  syncPlaybackButtons();
  resizeRenderer();
  computeAll(true);
  requestAnimationFrame(tick);

  // KaTeX Auto-Rendering for Aerodynamic Formulas
  function renderAllMath() {
    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      } catch (e) {
        console.warn('KaTeX render warning:', e);
      }
    } else {
      setTimeout(renderAllMath, 80);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAllMath);
  } else {
    renderAllMath();
  }
})();
