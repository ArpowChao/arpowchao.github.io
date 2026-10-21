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
    rpm: 1260,
    cd: 0.398,
    altitudeM: 0,
    windMs: 0,
    mode: 'single',        // 'single' | 'fan'
    fanFilter: '0-90',     // '0-90' | '0-60' | '60-90'
    cameraPreset: 'stadium',
    timeScale: 1.0,
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
    deg10:  { speedKmh: 158, angleDeg: 10, rpm: 1260, cd: 0.398, altitudeM: 0, windMs: 0, mode: 'single', cam: 'stadium', scale: 1.0 },
    deg28:  { speedKmh: 158, angleDeg: 28, rpm: 1260, cd: 0.398, altitudeM: 0, windMs: 0, mode: 'single', cam: 'stadium', scale: 1.0 },
    deg45:  { speedKmh: 158, angleDeg: 45, rpm: 1260, cd: 0.398, altitudeM: 0, windMs: 0, mode: 'single', cam: 'stadium', scale: 1.5 },
    deg68:  { speedKmh: 158, angleDeg: 68, rpm: 1260, cd: 0.398, altitudeM: 0, windMs: 0, mode: 'single', cam: 'side',    scale: 1.5 },
    deg88:  { speedKmh: 158, angleDeg: 88, rpm: 1260, cd: 0.398, altitudeM: 0, windMs: 0, mode: 'single', cam: 'side',    scale: 1.5 },
    ohtani: { speedKmh: 187, angleDeg: 28, rpm: 1260, cd: 0.398, altitudeM: 0, windMs: 0, mode: 'fan',    cam: 'stadium', scale: 1.25 }
  };

  // ---------- Three.js Scene Setup ----------
  const canvas = $('stadium-canvas');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x050a12, 1);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x060c16, 0.0022);

  const camera = new T.PerspectiveCamera(40, 16 / 9, 0.5, 650);

  // Orbit camera state (spherical coordinates around target)
  const camOrbit = {
    target: new T.Vector3(52, 12, 0),
    GoalTarget: new T.Vector3(52, 12, 0),
    pos: new T.Vector3(-22, 25, 56),
    goalPos: new T.Vector3(-22, 25, 56),
    userDragging: false,
    spherical: { radius: 85, theta: -0.38, phi: 1.28 }
  };

  const CAMERA_PRESETS = {
    stadium:  { pos: new T.Vector3(-22, 24, 56),  target: new T.Vector3(52, 13, -2), fov: 40 },
    batter:   { pos: new T.Vector3(4.2, 2.0, 5.2), target: new T.Vector3(0.5, 1.45, 0), fov: 36 },
    side:     { pos: new T.Vector3(42, 24, 118),  target: new T.Vector3(42, 18, 0),  fov: 42 },
    outfield: { pos: new T.Vector3(136, 22, 34),  target: new T.Vector3(55, 12, 0),  fov: 42 }
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

  // Lighting
  scene.add(new T.HemisphereLight(0xdbeafe, 0x1a2e1a, 0.85));
  const sun = new T.DirectionalLight(0xfff8e7, 1.35);
  sun.position.set(-30, 85, 50);
  scene.add(sun);
  const fillLight = new T.DirectionalLight(0x60a5fa, 0.55);
  fillLight.position.set(90, 40, -60);
  scene.add(fillLight);

  // Glow sprite helper
  function makeGlowTexture(colorHex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.28, colorHex);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
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
      const r = 16;
      g.beginPath();
      g.roundRect(6, 12, c.width - 12, c.height - 24, r);
      g.fill();
    }
    if (opts.border) {
      g.strokeStyle = opts.border;
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(6, 12, c.width - 12, c.height - 24, 16);
      g.stroke();
    }
    g.fillStyle = opts.color || '#ffffff';
    g.font = opts.font || 'bold 40px "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2);
    const tex = new T.CanvasTexture(c);
    const mat = new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new T.Sprite(mat);
    sp.scale.set(opts.scaleX || 8, opts.scaleY || 3, 1);
    return sp;
  }

  // ---------- Build 3D Night Stadium ----------
  const batterGroup = new T.Group();
  let batterBatPivot = null;

  function buildStadium() {
    const stadium = new T.Group();

    // 1. Outfield & Infield Grass Plane with mowed stripes texture
    const grassCanvas = document.createElement('canvas');
    grassCanvas.width = grassCanvas.height = 512;
    const gg = grassCanvas.getContext('2d');
    gg.fillStyle = '#1f5427';
    gg.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 32; i++) {
      gg.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
      gg.fillRect(0, i * 16, 512, 16);
    }
    const grassTex = new T.CanvasTexture(grassCanvas);
    grassTex.wrapS = grassTex.wrapT = T.RepeatWrapping;
    grassTex.repeat.set(14, 14);

    const ground = new T.Mesh(
      new T.CircleGeometry(240, 96),
      new T.MeshStandardMaterial({ map: grassTex, roughness: 0.92, metalness: 0.02 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(45, -0.02, 0);
    stadium.add(ground);

    // 2. Infield Clay Dirt & Base Diamond (aligned so +X is center field, foul lines at ±45° in XZ)
    const dirtMat = new T.MeshStandardMaterial({ color: 0x8b6240, roughness: 0.95 });
    const homeDirt = new T.Mesh(new T.CircleGeometry(7.2, 48), dirtMat);
    homeDirt.rotation.x = -Math.PI / 2;
    homeDirt.position.set(0, 0.01, 0);
    stadium.add(homeDirt);

    // Infield dirt arc (radius ~29m around mound at x=18.44m)
    const infieldDirt = new T.Mesh(new T.CircleGeometry(28.5, 64, -Math.PI / 4, Math.PI / 2), dirtMat);
    infieldDirt.rotation.x = -Math.PI / 2;
    infieldDirt.position.set(0, 0.008, 0);
    stadium.add(infieldDirt);

    // Inner grass diamond (27.4m base paths rotated so 2B is along +X at 38.79m)
    const baseDist = 27.43;
    const diag = baseDist * Math.SQRT2; // 38.79m to 2B along +X
    const innerGrassShape = new T.Shape();
    innerGrassShape.moveTo(2.5, 0);
    innerGrassShape.lineTo(diag / 2, -diag / 2 + 2.0);
    innerGrassShape.lineTo(diag - 2.5, 0);
    innerGrassShape.lineTo(diag / 2, diag / 2 - 2.0);
    innerGrassShape.closePath();
    const innerGrass = new T.Mesh(
      new T.ShapeGeometry(innerGrassShape),
      new T.MeshStandardMaterial({ color: 0x24612d, roughness: 0.9 })
    );
    innerGrass.rotation.x = -Math.PI / 2;
    innerGrass.position.y = 0.015;
    stadium.add(innerGrass);

    // Pitcher's mound at x = 18.44m
    const mound = new T.Mesh(new T.CylinderGeometry(2.2, 2.8, 0.25, 32), dirtMat);
    mound.position.set(18.44, 0.12, 0);
    stadium.add(mound);

    // Foul lines (1B line: +X, -Z; 3B line: +X, +Z at ±45°) & Foul Poles
    const chalkMat = new T.MeshBasicMaterial({ color: 0xf1f5f9 });
    for (const sign of [-1, 1]) {
      const foulLen = 98;
      const lineGeo = new T.PlaneGeometry(foulLen, 0.22);
      const line = new T.Mesh(lineGeo, chalkMat);
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = sign * (Math.PI / 4);
      line.position.set(
        (foulLen / 2) * Math.cos(Math.PI / 4),
        0.025,
        sign * (foulLen / 2) * Math.sin(Math.PI / 4)
      );
      stadium.add(line);

      // Yellow foul pole at the end of foul line
      const pole = new T.Mesh(
        new T.CylinderGeometry(0.18, 0.18, 22, 12),
        new T.MeshBasicMaterial({ color: 0xfacc15 })
      );
      pole.position.set(
        foulLen * Math.cos(Math.PI / 4),
        11,
        sign * foulLen * Math.sin(Math.PI / 4)
      );
      stadium.add(pole);
    }

    // Batter's box & home plate chalk lines
    const plate = new T.Mesh(new T.BoxGeometry(0.43, 0.04, 0.43), chalkMat);
    plate.position.set(0, 0.025, 0);
    stadium.add(plate);

    const boxFrameGeo = new T.RingGeometry(0.9, 1.02, 4);
    for (const zOff of [-0.95, 0.95]) {
      const box = new T.Mesh(boxFrameGeo, chalkMat);
      box.rotation.x = -Math.PI / 2;
      box.rotation.z = Math.PI / 4;
      box.position.set(0, 0.026, zOff);
      stadium.add(box);
    }

    // 3. Distance Ground Arcs (-20m, 50m, 100m, 110m Outfield Wall)
    const arcMat = new T.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.35, side: T.DoubleSide });
    for (const dist of [50, 100]) {
      const ring = new T.Mesh(new T.RingGeometry(dist - 0.18, dist + 0.18, 64, 1, -Math.PI / 3.8, (2 * Math.PI) / 3.8), arcMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      stadium.add(ring);

      const lbl = makeTextSprite(`${dist}m`, {
        color: '#e2e8f0',
        bg: 'rgba(15,23,42,0.75)',
        scaleX: 7.5,
        scaleY: 2.8
      });
      lbl.position.set(dist, 1.6, 12);
      stadium.add(lbl);
    }

    // Backward pop-up zone marker (-20m behind home plate)
    const backArcMat = new T.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.4, side: T.DoubleSide });
    const backRing = new T.Mesh(new T.RingGeometry(19.8, 20.2, 48, 1, Math.PI - 0.7, 1.4), backArcMat);
    backRing.rotation.x = -Math.PI / 2;
    backRing.position.y = 0.03;
    stadium.add(backRing);
    const backLbl = makeTextSprite('−20m 本壘後方 (85°–90° 後旋倒退區)', {
      w: 520,
      h: 96,
      font: 'bold 30px "Segoe UI", sans-serif',
      color: '#ffbe76',
      bg: 'rgba(20,12,4,0.82)',
      border: '#ff9f43',
      scaleX: 13,
      scaleY: 2.4
    });
    backLbl.position.set(-20, 2.2, 0);
    stadium.add(backLbl);

    // 4. Outfield Wall at R = 110m (height = 2.5m) with yellow top rail
    const wallRadius = 110;
    const wallHeight = 2.5;
    const wallArc = Math.PI * 0.56;
    const wallGeo = new T.CylinderGeometry(wallRadius, wallRadius, wallHeight, 72, 1, true, Math.PI / 2 - wallArc / 2, wallArc);
    const wallMesh = new T.Mesh(
      wallGeo,
      new T.MeshStandardMaterial({ color: 0x0f291e, roughness: 0.7, side: T.DoubleSide })
    );
    wallMesh.position.y = wallHeight / 2;
    stadium.add(wallMesh);

    const yellowTop = new T.Mesh(
      new T.CylinderGeometry(wallRadius, wallRadius, 0.22, 72, 1, true, Math.PI / 2 - wallArc / 2, wallArc),
      new T.MeshBasicMaterial({ color: 0xfacc15, side: T.DoubleSide })
    );
    yellowTop.position.y = wallHeight + 0.1;
    stadium.add(yellowTop);

    const wall110Label = makeTextSprite('110m 全壘打牆', {
      w: 320,
      h: 88,
      font: 'bold 34px "Segoe UI", sans-serif',
      color: '#facc15',
      bg: 'rgba(10,20,15,0.88)',
      border: '#facc15',
      scaleX: 9.5,
      scaleY: 2.6
    });
    wall110Label.position.set(110, 4.2, 0);
    stadium.add(wall110Label);

    // 5. Outfield & Infield Grandstands with Colorful Instanced Crowd (matching IG Reel!)
    const standSlopes = [
      { rStart: 112, rEnd: 142, yStart: 2.8, yEnd: 17.5, thMin: -0.78, thMax: 0.78, rows: 14, cols: 88 },
      { rStart: 22,  rEnd: 46,  yStart: 2.0, yEnd: 14.0, thMin: 2.05,  thMax: 4.25, rows: 10, cols: 64 }
    ];
    const seatGeo = new T.BoxGeometry(0.95, 0.75, 0.95);
    const seatMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const palette = [
      new T.Color(0xe11d48), new T.Color(0xfacc15), new T.Color(0x38bdf8),
      new T.Color(0xf8fafc), new T.Color(0x4ade80), new T.Color(0xfb923c),
      new T.Color(0x1e293b), new T.Color(0x334155)
    ];

    standSlopes.forEach((sec) => {
      // Dark structure behind seats
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
        new T.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.9, side: T.DoubleSide })
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
          const col = palette[(r * 13 + c * 7) % palette.length];
          crowd.setColorAt(idx, col);
          idx++;
        }
      }
      crowd.instanceMatrix.needsUpdate = true;
      if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
      stadium.add(crowd);
    });

    // 6. Four Tall Stadium Floodlight Towers with Glow Halos
    const lightCoords = [
      [98, -72], [126, -34], [126, 34], [98, 72]
    ];
    const glowTex = makeGlowTexture('rgba(255,252,225,0.85)');
    const poleMat = new T.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.5 });
    const bankMat = new T.MeshBasicMaterial({ color: 0xfffef0 });

    lightCoords.forEach(([lx, lz]) => {
      const tower = new T.Mesh(new T.CylinderGeometry(0.45, 0.75, 38, 10), poleMat);
      tower.position.set(lx, 19, lz);
      stadium.add(tower);

      const bank = new T.Mesh(new T.BoxGeometry(1.2, 4.5, 8.5), bankMat);
      bank.position.set(lx, 39, lz);
      bank.lookAt(50, 0, 0);
      stadium.add(bank);

      const halo = new T.Sprite(new T.SpriteMaterial({
        map: glowTex,
        color: 0xfffbeb,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false
      }));
      halo.position.set(lx, 39, lz);
      halo.scale.set(26, 26, 1);
      stadium.add(halo);
    });

    scene.add(stadium);
  }

  // ---------- Build 3D Mannequins (Batter, Catcher, Umpire, Outfielders) ----------
  function makeLimb(r, len, mat) {
    const g = new T.Group();
    const cyl = new T.Mesh(new T.CylinderGeometry(r, r * 0.9, len, 14), mat);
    cyl.position.y = -len / 2;
    const joint = new T.Mesh(new T.SphereGeometry(r * 1.05, 14, 12), mat);
    g.add(joint, cyl);
    return g;
  }

  function buildMannequins() {
    // 1. Batter Mannequin (Right-handed batter at z = +0.85m, x = 0m)
    const batterMat = new T.MeshStandardMaterial({ color: 0x7c8b9e, roughness: 0.45, metalness: 0.25 });
    batterGroup.position.set(-0.15, 0, 0.88);

    const torso = new T.Mesh(new T.CylinderGeometry(0.19, 0.16, 0.62, 16), batterMat);
    torso.position.set(0, 1.15, 0);
    const head = new T.Mesh(new T.SphereGeometry(0.15, 18, 16), batterMat);
    head.position.set(0, 1.62, 0);
    batterGroup.add(torso, head);

    const lLeg = makeLimb(0.085, 0.82, batterMat);
    lLeg.position.set(0.12, 0.84, -0.06);
    lLeg.rotation.z = 0.12;
    const rLeg = makeLimb(0.085, 0.82, batterMat);
    rLeg.position.set(-0.12, 0.84, 0.08);
    rLeg.rotation.z = -0.15;
    batterGroup.add(lLeg, rLeg);

    // Pivot for arms + wooden bat so it swings dynamically at launch!
    batterBatPivot = new T.Group();
    batterBatPivot.position.set(0.05, 1.32, -0.15);

    const armL = makeLimb(0.065, 0.48, batterMat);
    armL.rotation.x = Math.PI / 2.4;
    armL.rotation.z = -0.35;
    batterBatPivot.add(armL);

    const batMat = new T.MeshStandardMaterial({ color: 0xb07d4f, roughness: 0.55 });
    const bat = new T.Mesh(new T.CylinderGeometry(0.036, 0.018, 0.92, 14), batMat);
    bat.position.set(0.28, 0.05, -0.38);
    bat.rotation.x = Math.PI / 2.2;
    bat.rotation.z = -0.45;
    batterBatPivot.add(bat);

    batterGroup.add(batterBatPivot);
    scene.add(batterGroup);

    // 2. Catcher & Umpire Mannequins (dark silhouettes behind home plate, matching IG Reel!)
    const darkMat = new T.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.2 });
    const catcher = new T.Group();
    catcher.position.set(-1.35, 0, 0.05);
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
    umpire.position.set(-2.25, 0, -0.12);
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

    // 3. Fielders on the field (for scale reference)
    const fielderCoords = [
      [18.4, 0], [34, -14], [34, 14], [26, -22], [26, 22],
      [78, -36], [86, 0], [78, 36]
    ];
    const fielderMat = new T.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
    fielderCoords.forEach(([fx, fz]) => {
      const f = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 1.75, 10), fielderMat);
      f.position.set(fx, 0.88, fz);
      scene.add(f);
    });
  }

  buildStadium();
  buildMannequins();

  // ---------- Dynamic 3D Trajectory Group ----------
  const trajGroup = new T.Group();
  scene.add(trajGroup);

  const ballGlowTex = makeGlowTexture('#c8ff2e');
  const activeBall = new T.Mesh(
    new T.SphereGeometry(0.55, 20, 16),
    new T.MeshBasicMaterial({ color: 0xffffff })
  );
  const activeBallHalo = new T.Sprite(
    new T.SpriteMaterial({
      map: ballGlowTex,
      color: 0xc8ff2e,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false
    })
  );
  activeBallHalo.scale.set(5.5, 5.5, 1);
  activeBall.add(activeBallHalo);
  scene.add(activeBall);

  // Vertical laser drop line from ball to ground shadow
  const dropLineGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
  const dropLine = new T.Line(
    dropLineGeo,
    new T.LineBasicMaterial({ color: 0xc8ff2e, transparent: true, opacity: 0.55 })
  );
  scene.add(dropLine);

  const groundShadow = new T.Mesh(
    new T.RingGeometry(0.2, 0.95, 24),
    new T.MeshBasicMaterial({ color: 0xc8ff2e, transparent: true, opacity: 0.65, side: T.DoubleSide })
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

  function samplePathUpToTime(path, tMax) {
    const pts = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (p.t <= tMax) {
        pts.push(new T.Vector3(p.x, p.y, 0));
      } else {
        if (i > 0) {
          const prev = path[i - 1];
          const f = clamp((tMax - prev.t) / Math.max(1e-6, p.t - prev.t), 0, 1);
          pts.push(new T.Vector3(
            prev.x + f * (p.x - prev.x),
            prev.y + f * (p.y - prev.y),
            0
          ));
        }
        break;
      }
    }
    return pts;
  }

  function buildTubeFromPoints(pts, radius, color, opacity, additive) {
    if (pts.length < 2) return null;
    const curve = new T.CatmullRomCurve3(pts);
    const segs = Math.min(140, Math.max(12, pts.length * 2));
    const geo = new T.TubeGeometry(curve, segs, radius, 8, false);
    const mat = new T.MeshBasicMaterial({
      color,
      transparent: opacity < 1 || additive,
      opacity,
      blending: additive ? T.AdditiveBlending : T.NormalBlending,
      depthWrite: !additive
    });
    return new T.Mesh(geo, mat);
  }

  function rebuild3DTrajectories() {
    clearGroup(trajGroup);

    if (state.mode === 'single') {
      const cmp = state.comparison;
      if (!cmp) return;

      // 1. Vacuum comparison trajectory (white-blue translucent arch)
      if (state.showVacuum) {
        const vacPts = samplePathUpToTime(cmp.vacuum.path, state.animTime);
        const vacLine = buildTubeFromPoints(vacPts, 0.14, 0xb8c9d9, 0.38, false);
        if (vacLine) trajGroup.add(vacLine);
      }

      // 2. Drag-only comparison trajectory (coral-orange translucent arch)
      if (state.showDragOnly) {
        const dragPts = samplePathUpToTime(cmp.dragOnly.path, state.animTime);
        const dragLine = buildTubeFromPoints(dragPts, 0.16, 0xff6b6b, 0.55, false);
        if (dragLine) trajGroup.add(dragLine);
      }

      // 3. Full Aerodynamic trajectory (glowing neon yellow-green core + additive bloom tube)
      const fullPts = samplePathUpToTime(cmp.full.path, state.animTime);
      const isPopup = state.angleDeg >= 60;
      const coreColor = isPopup ? 0xffbe76 : 0xeaff7b;
      const glowColor = isPopup ? 0xff9f43 : 0xc8ff2e;

      const coreTube = buildTubeFromPoints(fullPts, 0.34, coreColor, 0.98, false);
      const glowTube = buildTubeFromPoints(fullPts, 0.92, glowColor, 0.34, true);
      if (coreTube) trajGroup.add(coreTube);
      if (glowTube) trajGroup.add(glowTube);

      // Update active ball & ground drop line
      if (fullPts.length > 0) {
        const tip = fullPts[fullPts.length - 1];
        activeBall.visible = true;
        activeBall.position.copy(tip);
        dropLine.visible = true;
        dropLine.geometry.setFromPoints([
          tip,
          new T.Vector3(tip.x, 0.02, tip.z)
        ]);
        groundShadow.visible = true;
        groundShadow.position.set(tip.x, 0.04, tip.z);
      }
    } else {
      // FAN MODE: 0° ~ 90° simultaneous fan trajectories!
      activeBall.visible = false;
      dropLine.visible = false;
      groundShadow.visible = false;

      const bz = B.barrelZone(state.speedKmh);
      const webPoints = [];
      let barrelApexSum = new T.Vector3();
      let barrelCount = 0;

      state.fanTrajectories.forEach((sim) => {
        const deg = sim.config.angleDeg;
        if (state.fanFilter === '0-60' && deg > 60) return;
        if (state.fanFilter === '60-90' && deg < 60) return;

        const pts = samplePathUpToTime(sim.path, state.animTime);
        if (pts.length < 2) return;

        const inBarrel = bz.isBarrelEligible && deg >= bz.minDeg && deg <= bz.maxDeg;
        const isHighPopup = deg >= 60;

        if (inBarrel) {
          const core = buildTubeFromPoints(pts, 0.36, 0xf4ff9e, 0.98, false);
          const halo = buildTubeFromPoints(pts, 0.95, 0xc8ff2e, 0.38, true);
          if (core) trajGroup.add(core);
          if (halo) trajGroup.add(halo);
          barrelApexSum.add(new T.Vector3(sim.apexX, sim.apexM, 0));
          barrelCount++;
        } else if (isHighPopup) {
          // 60°~90° high pop-up & backward-looping trajectories in warm amber/coral
          const isBackward = sim.carryM < 0;
          const col = isBackward ? 0xff5e7e : 0xff9f43;
          const tube = buildTubeFromPoints(pts, 0.18, col, 0.72, false);
          if (tube) trajGroup.add(tube);
        } else {
          // 0°~58° non-barrel trajectories in crisp translucent white
          const tube = buildTubeFromPoints(pts, 0.13, 0xe2e8f0, 0.42, false);
          if (tube) trajGroup.add(tube);
        }

        webPoints.push(pts);
      });

      // Cross-rib lines connecting neighboring angles (matching the IG Reel fan web!)
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
            new T.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.28 })
          );
          trajGroup.add(ribLines);
        }
      }

      // Floating 3D Barrel callout label (just like "26~30°" / "24~33°" / "8~50°" in IG Reel!)
      if (bz.isBarrelEligible && barrelCount > 0 && state.animTime > 1.2 && state.fanFilter !== '60-90') {
        barrelApexSum.multiplyScalar(1 / barrelCount);
        const label = makeTextSprite(`${bz.minDeg}～${bz.maxDeg}°`, {
          w: 280,
          h: 96,
          font: 'bold 46px "Segoe UI", sans-serif',
          color: '#0b1400',
          bg: '#c8ff2e',
          scaleX: 11,
          scaleY: 3.8
        });
        label.position.set(barrelApexSum.x + 4, barrelApexSum.y + 4.5, 0);
        trajGroup.add(label);
      }
    }
  }

  // ---------- Recompute Physics & Update UI ----------
  function computeAll(resetAnim) {
    const cfg = {
      speedKmh: state.speedKmh,
      angleDeg: state.angleDeg,
      rpm: state.rpm,
      cd: state.cd,
      altitudeM: state.altitudeM,
      windMs: state.windMs
    };

    state.comparison = B.compareModels(cfg);
    state.sweep = B.sweepAngles(cfg, 90, 1);

    // Precompute 0°~90° fan every 2°
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

  function updateHUD() {
    const full = state.comparison ? state.comparison.full : null;
    if (!full) return;

    const bz = B.barrelZone(state.speedKmh);
    $('hud-speed').innerHTML = `${Math.round(state.speedKmh)}<small>km/h</small>`;
    $('hud-angle').innerHTML = state.mode === 'fan'
      ? (state.fanFilter === '60-90' ? `60–90<small>度</small>` : `0–90<small>度</small>`)
      : `${Math.round(state.angleDeg)}<small>度</small>`;

    // Live interpolated distance & time during flight
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

    const outcomeEl = $('hud-outcome');
    const finished = state.animTime >= full.hangTimeS - 0.05;

    if (!state.storyPlaying) {
      const windStr = state.windMs === 0 ? '無風' : (state.windMs > 0 ? `順風 +${state.windMs}m/s` : `逆風 ${state.windMs}m/s`);
      $('hud-eyebrow').textContent = `${state.speedKmh} km/h · 海拔 ${state.altitudeM}m · ${windStr}`;

      if (state.mode === 'fan') {
        $('hud-badge').textContent = bz.isBarrelEligible
          ? `MLB Barrel：${bz.minDeg}°～${bz.maxDeg}°（寬 ${bz.widthDeg}°）`
          : `初速未達 158 km/h Barrel 門檻`;
        outcomeEl.hidden = true;
        if (state.fanFilter === '60-90') {
          $('hud-title').textContent = `60°～90° 沖天炮與後旋倒退軌跡`;
          $('hud-subtitle').textContent = `超過 83° 的沖天炮因上升段馬格努斯力 (−vy) 飛往本壘板後方 (x < 0)！`;
        } else {
          $('hud-title').textContent = bz.isBarrelEligible
            ? `${state.speedKmh} km/h：黃金仰角 ${bz.minDeg}°～${bz.maxDeg}°`
            : `0°～90° 全仰角軌跡展開`;
          $('hud-subtitle').textContent = `亮綠色為 MLB Barrel 甜蜜區 · 橘粉色為 60°～90° 沖天炮與倒退球`;
        }
      } else {
        $('hud-badge').textContent = state.timeScale < 1
          ? `スロー ×${state.timeScale === 0.125 ? '1/8' : state.timeScale}`
          : (state.timeScale > 1 ? `早送り ×${state.timeScale}` : `實時模擬 ×1.0`);

        outcomeEl.hidden = !finished;
        outcomeEl.className = `hud-outcome outcome-${full.outcome}`;
        outcomeEl.textContent = full.outcome === 'HR' ? 'ホームラン 全壘打'
          : full.outcome === 'HIT' ? 'ヒット 安打'
          : full.outcome === 'POPUP_BACK' ? '本壘後方倒退飛球'
          : 'アウト 接殺';

        if (state.angleDeg >= 82 && full.carryM < 0) {
          $('hud-title').textContent = `${state.angleDeg}度：往本壘後方倒退 ${Math.abs(Math.round(full.carryM))}m！`;
          $('hud-subtitle').textContent = `上升段後旋馬格努斯力推向捕手後方 · 滯空 ${full.hangTimeS.toFixed(1)} 秒`;
        } else if (state.angleDeg >= 60) {
          $('hud-title').textContent = `${state.angleDeg}度：超高沖天炮（最高點 ${Math.round(full.apexM)}m）`;
          $('hud-subtitle').textContent = `飛距離僅 ${Math.round(full.carryM)}m · 滯空長達 ${full.hangTimeS.toFixed(1)} 秒（真空原本可飛 ${Math.round(state.comparison.vacuum.carryM)}m）`;
        } else if (full.outcome === 'HR') {
          $('hud-title').textContent = `${state.angleDeg}度：飛進看台的全壘打！`;
          $('hud-subtitle').textContent = `飛距離 ${Math.round(full.carryM)}m · 滯空 ${full.hangTimeS.toFixed(1)} 秒${full.isBarrel ? ' · 位於 MLB Barrel 甜蜜區' : ''}`;
        } else if (state.angleDeg <= 16) {
          $('hud-title').textContent = `${state.angleDeg}度：仰角太低（平飛安打）`;
          $('hud-subtitle').textContent = `${Math.round(full.carryM)}m · ${full.hangTimeS.toFixed(1)} 秒落地（靠後旋升力比真空 ${Math.round(state.comparison.vacuum.carryM)}m 還遠！）`;
        } else {
          $('hud-title').textContent = `${state.angleDeg}度：外野高飛接殺`;
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
    $('rpm-out').textContent = `${state.rpm} rpm`;
    $('cd-out').textContent = state.cd.toFixed(2);
    $('alt-out').textContent = state.altitudeM === 0 ? `0 m (海平面)` : `${state.altitudeM} m (ρ=${cmp.full.airDensity})`;
    $('wind-out').textContent = state.windMs === 0 ? `0 m/s (無風)` : `${state.windMs > 0 ? '+' : ''}${state.windMs} m/s (${state.windMs > 0 ? '順風' : '逆風'})`;

    $('r-full-dist').textContent = `${cmp.full.carryM.toFixed(1)} m (${cmp.full.outcomeLabel.split(' ')[0]})`;
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
  }

  // ---------- 2D Chart 1: 0°~90° Angle vs Carry Distance ----------
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

    // 1. Shaded 60°~90° Pop-up & Backward Loop Zone
    g.fillStyle = 'rgba(255, 159, 67, 0.08)';
    g.fillRect(xToPx(60), pad.t, xToPx(90) - xToPx(60), ph);

    // 2. Shaded MLB Barrel Zone
    if (sw.barrel.isBarrelEligible) {
      const bx1 = xToPx(sw.barrel.minDeg);
      const bx2 = xToPx(sw.barrel.maxDeg);
      g.fillStyle = 'rgba(200, 255, 46, 0.16)';
      g.fillRect(bx1, pad.t, Math.max(3, bx2 - bx1), ph);
    }

    // 3. Grid lines & Horizontal reference lines (0m home plate, 110m HR wall)
    g.font = '11px "Cascadia Code", Consolas, monospace';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const yVal of [-20, 0, 50, 100, 150, 200]) {
      if (yVal > yMax) continue;
      const py = yToPx(yVal);
      g.strokeStyle = yVal === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(148,163,184,0.12)';
      g.lineWidth = yVal === 0 ? 1.2 : 1;
      g.beginPath();
      g.moveTo(pad.l, py);
      g.lineTo(w - pad.r, py);
      g.stroke();
      g.fillStyle = '#8fa5ba';
      g.fillText(`${yVal}m`, pad.l - 6, py);
    }

    // 110m Home Run Wall dashed line
    const pyWall = yToPx(110);
    g.strokeStyle = 'rgba(250, 204, 21, 0.65)';
    g.setLineDash([5, 4]);
    g.beginPath();
    g.moveTo(pad.l, pyWall);
    g.lineTo(w - pad.r, pyWall);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#facc15';
    g.textAlign = 'left';
    g.fillText('110m 全壘打牆', pad.l + 6, pyWall - 8);

    // X-axis angle labels (0° ~ 90°)
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const deg of [0, 15, 30, 45, 60, 75, 90]) {
      const px = xToPx(deg);
      g.strokeStyle = deg === 60 ? 'rgba(255,159,67,0.35)' : 'rgba(148,163,184,0.1)';
      g.beginPath();
      g.moveTo(px, pad.t);
      g.lineTo(px, pad.t + ph);
      g.stroke();
      g.fillStyle = deg >= 60 ? '#ffbe76' : '#8fa5ba';
      g.fillText(`${deg}°`, px, pad.t + ph + 7);
    }

    // Helper to stroke curve
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

    // Plot Vacuum, Drag-Only, and Full (Drag + Backspin)
    plotCurve(sw.vacuum, 'rgba(184, 201, 217, 0.65)', 1.6, [4, 4]);
    plotCurve(sw.dragOnly, '#ff5e7e', 1.8, [2, 3]);
    plotCurve(sw.full, '#c8ff2e', 2.6, []);

    // Current selected angle vertical line & dots
    const curX = xToPx(state.angleDeg);
    g.strokeStyle = 'rgba(200, 255, 46, 0.5)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(curX, pad.t);
    g.lineTo(curX, pad.t + ph);
    g.stroke();

    if (state.comparison) {
      const pts = [
        { y: state.comparison.vacuum.carryM, c: '#b8c9d9', r: 3.5 },
        { y: state.comparison.dragOnly.carryM, c: '#ff5e7e', r: 4 },
        { y: state.comparison.full.carryM, c: '#c8ff2e', r: 5.5 }
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

  // ---------- 2D Chart 2: Speed × Angle (0°~90°) Phase Diagram ----------
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

    const vMin = 120, vMax = 195;
    const vToPx = (v) => pad.l + ((v - vMin) / (vMax - vMin)) * pw;
    const aToPx = (deg) => pad.t + (1 - deg / 90) * ph;

    // 1. 60°~90° Pop-up & Backward Loop Zone
    g.fillStyle = 'rgba(255, 159, 67, 0.1)';
    g.fillRect(pad.l, aToPx(90), pw, aToPx(60) - aToPx(90));
    g.fillStyle = '#ffbe76';
    g.font = '11px "Segoe UI", sans-serif';
    g.textAlign = 'left';
    g.fillText('60°–90° 沖天炮與後旋倒退區 (83°+ 飛向本壘後方)', pad.l + 8, aToPx(82));

    // 2. MLB Statcast Barrel Polygon (158 ~ 195 km/h)
    g.fillStyle = 'rgba(200, 255, 46, 0.25)';
    g.strokeStyle = '#c8ff2e';
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
      g.strokeStyle = deg === 60 ? 'rgba(255,159,67,0.35)' : 'rgba(148,163,184,0.12)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pad.l, py);
      g.lineTo(w - pad.r, py);
      g.stroke();
      g.fillStyle = deg >= 60 ? '#ffbe76' : '#8fa5ba';
      g.fillText(`${deg}°`, pad.l - 6, py);
    }

    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const v of [120, 140, 158, 175, 190]) {
      const px = vToPx(v);
      g.strokeStyle = v === 158 ? 'rgba(200,255,46,0.35)' : 'rgba(148,163,184,0.1)';
      g.beginPath();
      g.moveTo(px, pad.t);
      g.lineTo(px, pad.t + ph);
      g.stroke();
      g.fillStyle = v === 158 ? '#c8ff2e' : '#8fa5ba';
      g.fillText(`${v}`, px, pad.t + ph + 7);
    }

    // Label Barrel region
    g.fillStyle = '#c8ff2e';
    g.font = 'bold 11.5px "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillText('MLB BARREL 甜蜜區', vToPx(178), aToPx(29));

    // Current (speedKmh, angleDeg) crosshair
    const cx = vToPx(state.speedKmh);
    const cy = aToPx(state.angleDeg);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(cx, cy, 6, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = state.comparison && state.comparison.full.isBarrel ? '#c8ff2e' : '#38bdf8';
    g.beginPath();
    g.arc(cx, cy, 3.5, 0, Math.PI * 2);
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
    syncModeButtons();
    computeAll(true);
  });

  bindChartPointer(phaseCanvas, (e) => {
    stopStoryMode();
    const rect = phaseCanvas.getBoundingClientRect();
    const padL = 42, padR = 18, padT = 18, padB = 30;
    const ux = clamp((e.clientX - rect.left - padL) / Math.max(1, rect.width - padL - padR), 0, 1);
    const uy = clamp((e.clientY - rect.top - padT) / Math.max(1, rect.height - padT - padB), 0, 1);
    state.speedKmh = Math.round(120 + ux * (195 - 120));
    state.angleDeg = Math.round((1 - uy) * 90);
    $('speed-slider').value = state.speedKmh;
    $('angle-slider').value = state.angleDeg;
    computeAll(true);
  });

  // ---------- Story Reel Mode ----------
  function applyStoryChapter(index) {
    const ch = B.STORY_CHAPTERS[index];
    if (!ch) return;
    state.storyIndex = index;
    state.storyTimer = 0;

    state.speedKmh = ch.config.speedKmh;
    state.angleDeg = ch.config.angleDeg;
    state.rpm = ch.config.rpm;
    state.altitudeM = ch.config.altitudeM;
    state.windMs = ch.config.windMs;
    state.mode = ch.mode;
    state.timeScale = ch.timeScale;
    state.fanFilter = ch.highlightRange ? '60-90' : '0-90';

    $('speed-slider').value = state.speedKmh;
    $('angle-slider').value = state.angleDeg;
    $('rpm-slider').value = state.rpm;
    $('alt-slider').value = state.altitudeM;
    $('wind-slider').value = state.windMs;
    $('time-scale').value = String(
      [0.125, 0.5, 1, 1.5].reduce((prev, curr) =>
        Math.abs(curr - state.timeScale) < Math.abs(prev - state.timeScale) ? curr : prev
      )
    );

    setCameraPreset(ch.camera, false);
    syncModeButtons();

    document.querySelectorAll('.chapter-pill').forEach((btn, idx) => {
      btn.classList.toggle('active', idx === index);
    });

    computeAll(true);

    // Set custom HUD text from Story chapter
    $('hud-badge').textContent = ch.badge;
    $('hud-title').textContent = ch.title;
    $('hud-subtitle').textContent = ch.subtitle;
    $('hud-eyebrow').textContent = `IG Reel 故事展演 (${index + 1}/${B.STORY_CHAPTERS.length}) · 打球計算（空氣阻力・後旋）`;
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
      btn.textContent = '⏸ 暫停故事展演';
      applyStoryChapter(0);
    }
  });

  $('replay-shot').addEventListener('click', () => {
    state.animTime = 0;
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
    });
  });

  $('time-scale').addEventListener('change', (e) => {
    state.timeScale = Number(e.target.value) || 1;
  });

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopStoryMode();
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', b === btn));
      state.speedKmh = p.speedKmh;
      state.angleDeg = p.angleDeg;
      state.rpm = p.rpm;
      state.cd = p.cd;
      state.altitudeM = p.altitudeM;
      state.windMs = p.windMs;
      state.mode = p.mode;
      state.timeScale = p.scale;
      state.fanFilter = '0-90';

      $('speed-slider').value = state.speedKmh;
      $('angle-slider').value = state.angleDeg;
      $('rpm-slider').value = state.rpm;
      $('cd-slider').value = state.cd;
      $('alt-slider').value = state.altitudeM;
      $('wind-slider').value = state.windMs;
      setCameraPreset(p.cam, false);
      syncModeButtons();
      computeAll(true);
    });
  });

  function bindSlider(id, key, restartAnim) {
    $(id).addEventListener('input', (e) => {
      stopStoryMode();
      state[key] = Number(e.target.value);
      computeAll(restartAnim);
    });
  }

  bindSlider('speed-slider', 'speedKmh', true);
  bindSlider('angle-slider', 'angleDeg', true);
  bindSlider('rpm-slider', 'rpm', true);
  bindSlider('cd-slider', 'cd', true);
  bindSlider('alt-slider', 'altitudeM', true);
  bindSlider('wind-slider', 'windMs', true);

  document.querySelectorAll('[data-d-angle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopStoryMode();
      const d = Number(btn.dataset.dAngle);
      state.angleDeg = clamp(state.angleDeg + d, 0, 90);
      $('angle-slider').value = state.angleDeg;
      state.mode = 'single';
      syncModeButtons();
      computeAll(true);
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
    state.rpm = 1260;
    state.cd = 0.398;
    state.altitudeM = 0;
    state.windMs = 0;
    state.mode = 'single';
    state.fanFilter = '0-90';
    state.timeScale = 1.0;
    $('speed-slider').value = 158;
    $('angle-slider').value = 28;
    $('rpm-slider').value = 1260;
    $('cd-slider').value = 0.40;
    $('alt-slider').value = 0;
    $('wind-slider').value = 0;
    setCameraPreset('stadium', false);
    syncModeButtons();
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
    camOrbit.spherical.phi = clamp(camOrbit.spherical.phi - dy * 0.0055, 0.15, Math.PI / 2 - 0.04);
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

    // Advance trajectory flight animation
    state.animTime += dt * state.timeScale;
    if (state.animTime > state.maxAnimTime + 1.4) {
      if (!state.storyPlaying) {
        state.animTime = 0; // loop flight smoothly
      }
    }

    // Story mode auto-advance
    if (state.storyPlaying) {
      state.storyTimer += dt;
      const ch = B.STORY_CHAPTERS[state.storyIndex];
      if (ch && state.storyTimer >= ch.durationS) {
        const nextIdx = (state.storyIndex + 1) % B.STORY_CHAPTERS.length;
        applyStoryChapter(nextIdx);
      }
    }

    // Animate batter swing around t = 0
    if (batterBatPivot) {
      const swingProgress = clamp(state.animTime / 0.22, 0, 1);
      batterBatPivot.rotation.y = -0.85 + swingProgress * 1.95;
    }

    // Smooth camera interpolation
    camOrbit.pos.lerp(camOrbit.goalPos, Math.min(1, dt * 6));
    camOrbit.target.lerp(camOrbit.GoalTarget, Math.min(1, dt * 6));
    camera.position.copy(camOrbit.pos);
    camera.lookAt(camOrbit.target);

    rebuild3DTrajectories();
    updateHUD();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  // Initialize
  setCameraPreset('stadium', true);
  resizeRenderer();
  computeAll(true);
  requestAnimationFrame(tick);
})();
