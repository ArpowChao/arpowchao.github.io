'use strict';
(() => {
  const C = window.CannonPhysics;
  if (!C) return;

  const $ = (id) => document.getElementById(id);
  const clamp = C.clamp;
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const R = C.EARTH_RADIUS;

  // ---------- Application State ----------
  const state = {
    speedKms: Number(C.REEL_SHOTS[2].speedKms.toFixed(2)), // 7.50 km/s
    angleDeg: 0,
    altitudeKm: C.DEFAULT_MOUNTAIN_KM, // 700 km
    dragCoeff: 0.00,
    mode: 'sequence',        // 'sequence' | 'single' | 'salvo'
    cameraPreset: 'reel',    // 'reel' | 'mountain' | 'deep' | 'follow'
    timeScale: 1.0,
    paused: false,
    soundEnabled: true,
    showVectors: true,
    showFlatEarth: false,
    showFoci: true,
    storyPlaying: true,
    activeChapter: 0,
    simClock: 0,             // Visual animation clock (seconds of reel time)
    recoil: 0,               // Cannon barrel recoil [0..1]
    muzzleFlash: 0,          // Muzzle flash intensity [0..1]
    activeShots: [],         // Array of { id, color, label, sim, fireAt, impactPlayed, completePlayed }
    smokeParticles: [],      // Cannon muzzle smoke puffs
    impactParticles: [],     // Ground impact debris/flash particles
    cam: {
      cx: 0,                 // World km center X
      cy: -1150,             // World km center Y (shifted slightly south like the Reel!)
      zoom: 1.0,
      goalCx: 0,
      goalCy: -1150,
      goalZoom: 1.0,
      panning: false,
      aimingCannon: false,
      dragStartPx: null
    }
  };

  // Slider metadata with direct numeric inputs & triangle steppers
  const SLIDER_META = [
    { sliderId: 'speed-slider', numId: 'speed-num', key: 'speedKms',   min: 1.00, max: 13.00, step: 0.05, decimals: 2 },
    { sliderId: 'angle-slider', numId: 'angle-num', key: 'angleDeg',   min: -30,  max: 60,    step: 1,    decimals: 0 },
    { sliderId: 'alt-slider',   numId: 'alt-num',   key: 'altitudeKm', min: 0,    max: 3000,  step: 50,   decimals: 0 },
    { sliderId: 'drag-slider',  numId: 'drag-num',  key: 'dragCoeff',  min: 0.00, max: 1.50,  step: 0.05, decimals: 2 }
  ];

  // Presets
  const PRESETS = {
    shot1:   { speedKms: 5.20, angleDeg: 0,  altitudeKm: 700, dragCoeff: 0.00, color: '#ff6b6b', label: '① 5.20 km/s 近處墜落' },
    shot2:   { speedKms: 7.05, angleDeg: 0,  altitudeKm: 700, dragCoeff: 0.00, color: '#ffd166', label: '② 7.05 km/s 跨洲墜落' },
    shot3:   { speedKms: 7.50, angleDeg: 0,  altitudeKm: 700, dragCoeff: 0.00, color: '#5eead4', label: '③ 7.50 km/s 圓軌道' },
    shot4:   { speedKms: 8.18, angleDeg: 0,  altitudeKm: 700, dragCoeff: 0.00, color: '#c4b5fd', label: '④ 8.18 km/s 橢圓軌道' },
    shot5:   { speedKms: 10.80, angleDeg: 0, altitudeKm: 700, dragCoeff: 0.00, color: '#f472b6', label: '⑤ 10.80 km/s 重力逃逸' },
    graze:   { speedKms: 7.31, angleDeg: 0,  altitudeKm: 700, dragCoeff: 0.00, color: '#38bdf8', label: '🎯 7.31 km/s 南極擦地臨界' },
    tilted:  { speedKms: 7.60, angleDeg: 22, altitudeKm: 400, dragCoeff: 0.00, color: '#fb923c', label: '📐 +22° 仰射必撞地表' },
    surface: { speedKms: 7.91, angleDeg: 0,  altitudeKm: 0,   dragCoeff: 0.00, color: '#34d399', label: '🌍 地表 7.91 km/s 貼地圓軌道' }
  };

  // ---------- Web Audio API Synthesized Sound Effects ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!state.soundEnabled) return null;
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playCannonBoom() {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Low punchy sub-bass thump
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.38);
      oscGain.gain.setValueAtTime(0.32, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.connect(oscGain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.44);

      // Filtered white noise cannon blast & smoke hiss
      const bufSize = Math.floor(ctx.sampleRate * 0.55);
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.14));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(850, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 0.5);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.24, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
      noise.connect(filter).connect(nGain).connect(ctx.destination);
      noise.start(now);
    } catch (_) {}
  }

  function playImpactThud() {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(85, now);
      osc.frequency.exponentialRampToValueAtTime(22, now + 0.28);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch (_) {}
  }

  function playOrbitChime(isEscape = false) {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const freqs = isEscape ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.06);
        gain.gain.setValueAtTime(0.08, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.55);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.58);
      });
    } catch (_) {}
  }

  // ---------- Particle Emitters (Cannon Smoke & Impact Flash) ----------
  function spawnCannonSmoke(r0, angleDeg) {
    state.recoil = 1.0;
    state.muzzleFlash = 1.0;
    const rad = angleDeg * DEG;
    const barrelLenKm = 420;
    const mx = Math.cos(rad) * barrelLenKm;
    const my = r0 + Math.sin(rad) * barrelLenKm;
    for (let i = 0; i < 16; i++) {
      const spread = (Math.random() - 0.5) * 0.7;
      const spd = 120 + Math.random() * 280;
      state.smokeParticles.push({
        x: mx + (Math.random() - 0.5) * 90,
        y: my + (Math.random() - 0.5) * 90,
        vx: Math.cos(rad + spread) * spd,
        vy: Math.sin(rad + spread) * spd + 60,
        sizeKm: 90 + Math.random() * 140,
        alpha: 0.78,
        age: 0,
        maxAge: 1.4 + Math.random() * 0.9
      });
    }
    playCannonBoom();
  }

  function spawnImpactExplosion(x, y, color) {
    const norm = Math.hypot(x, y) || R;
    const nx = x / norm;
    const ny = y / norm;
    for (let i = 0; i < 18; i++) {
      const angle = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.3;
      const spd = 140 + Math.random() * 360;
      state.impactParticles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        sizeKm: 65 + Math.random() * 95,
        color: i % 3 === 0 ? '#fde047' : i % 3 === 1 ? '#fb923c' : color,
        alpha: 0.95,
        age: 0,
        maxAge: 0.9 + Math.random() * 0.6,
        isRing: i === 0
      });
    }
    playImpactThud();
  }

  // ---------- Camera Presets ----------
  function applyCameraPreset(presetName, instant = false) {
    state.cameraPreset = presetName;
    const r0 = R + state.altitudeKm;
    if (presetName === 'reel') {
      state.cam.goalCx = 0;
      state.cam.goalCy = -1150;
      state.cam.goalZoom = 1.02;
    } else if (presetName === 'mountain') {
      state.cam.goalCx = 650;
      state.cam.goalCy = r0 - 450;
      state.cam.goalZoom = 2.65;
    } else if (presetName === 'deep') {
      state.cam.goalCx = 400;
      state.cam.goalCy = -2200;
      state.cam.goalZoom = 0.56;
    } else if (presetName === 'follow') {
      state.cam.goalZoom = 1.45;
    }

    if (instant) {
      state.cam.cx = state.cam.goalCx;
      state.cam.cy = state.cam.goalCy;
      state.cam.zoom = state.cam.goalZoom;
    }

    document.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cam === presetName);
    });
  }

  // ---------- Shot Management & Reel Sequence ----------
  // Convert physical flight time (seconds) into visual animation seconds (~2.2s per orbit)
  function physTimeToVisualSec(physT, sim) {
    // Base scaling: ~1800 physical seconds per 1 visual second so a 6000s orbit takes ~3.3s
    const rate = sim.escaped ? 1400 : 1750;
    return physT / rate;
  }

  function visualSecToPhysTime(visSec, sim) {
    const rate = sim.escaped ? 1400 : 1750;
    return visSec * rate;
  }

  function getSampledPointAtVisualSec(shot, clockSec) {
    const elapsedVis = clockSec - shot.fireAt;
    if (elapsedVis < 0) return null;

    const sim = shot.sim;
    const pts = sim.points;
    if (!pts.length) return null;

    const totalPhysT = sim.flightTimeSec;
    let physT = visualSecToPhysTime(elapsedVis, sim);

    // If closed non-impacting orbit without drag, keep orbiting seamlessly!
    if (!sim.impacted && !sim.escaped && sim.params.dragCoeff === 0 && totalPhysT > 0) {
      if (physT >= totalPhysT && !shot.completePlayed) {
        shot.completePlayed = true;
        playOrbitChime(false);
      }
      const loops = Math.floor(physT / totalPhysT);
      const remT = physT - loops * totalPhysT;
      return {
        point: interpolateTrajectory(pts, remT),
        trailEndPhysT: loops >= 1 ? totalPhysT : remT,
        completedOrbit: loops >= 1,
        impactedNow: false,
        escapedNow: false
      };
    }

    if (physT >= totalPhysT) {
      physT = totalPhysT;
      if (sim.impacted && !shot.impactPlayed) {
        shot.impactPlayed = true;
        const last = pts[pts.length - 1];
        spawnImpactExplosion(last.x, last.y, shot.color);
      } else if (sim.escaped && !shot.completePlayed) {
        shot.completePlayed = true;
        playOrbitChime(true);
      }
    }

    return {
      point: interpolateTrajectory(pts, physT),
      trailEndPhysT: physT,
      completedOrbit: !sim.impacted && physT >= totalPhysT,
      impactedNow: sim.impacted && physT >= totalPhysT,
      escapedNow: sim.escaped && physT >= totalPhysT
    };
  }

  function interpolateTrajectory(pts, targetT) {
    if (targetT <= 0) return pts[0];
    const last = pts[pts.length - 1];
    if (targetT >= last.t) return last;
    let lo = 0;
    let hi = pts.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].t <= targetT) lo = mid;
      else hi = mid;
    }
    const p0 = pts[lo];
    const p1 = pts[hi];
    const span = Math.max(1e-9, p1.t - p0.t);
    const alpha = clamp((targetT - p0.t) / span, 0, 1);
    return {
      t: targetT,
      x: p0.x + (p1.x - p0.x) * alpha,
      y: p0.y + (p1.y - p0.y) * alpha,
      vx: p0.vx + (p1.vx - p0.vx) * alpha,
      vy: p0.vy + (p1.vy - p0.vy) * alpha
    };
  }

  function startReelSequence() {
    state.mode = 'sequence';
    state.storyPlaying = true;
    state.paused = false;
    state.simClock = 0;
    state.altitudeKm = C.DEFAULT_MOUNTAIN_KM;
    state.angleDeg = 0;
    state.dragCoeff = 0;
    state.activeShots = C.REEL_SHOTS.map((s) => {
      const sim = C.simulateShot({
        altitudeKm: s.altitudeKm,
        speedKms: s.speedKms,
        angleDeg: s.angleDeg,
        dragCoeff: 0
      });
      return {
        id: s.id,
        index: s.index,
        name: s.name,
        shortLabel: s.shortLabel,
        badge: s.badge,
        summary: s.summary,
        color: s.color,
        sim,
        fireAt: s.fireDelaySec,
        fired: false,
        impactPlayed: false,
        completePlayed: false
      };
    });
    const first = C.REEL_SHOTS[0];
    state.speedKms = Number(first.speedKms.toFixed(2));
    syncControlInputs();
    updateModeButtons();
    updateStoryButtons();
    updateAllReadouts();
  }

  function startSalvoMode() {
    state.mode = 'salvo';
    state.storyPlaying = false;
    state.paused = false;
    state.simClock = 0;
    state.activeShots = C.REEL_SHOTS.map((s) => {
      const sim = C.simulateShot({
        altitudeKm: state.altitudeKm,
        speedKms: s.speedKms,
        angleDeg: state.angleDeg,
        dragCoeff: state.dragCoeff
      });
      return {
        id: s.id,
        index: s.index,
        name: s.name,
        shortLabel: s.shortLabel,
        badge: s.badge,
        summary: s.summary,
        color: s.color,
        sim,
        fireAt: 0,
        fired: true,
        impactPlayed: false,
        completePlayed: false
      };
    });
    spawnCannonSmoke(R + state.altitudeKm, state.angleDeg);
    updateModeButtons();
    updateStoryButtons();
    updateAllReadouts();
  }

  function fireSingleShot(customColor, customLabel, keepExisting = false) {
    state.storyPlaying = false;
    state.paused = false;
    const sim = C.simulateShot({
      altitudeKm: state.altitudeKm,
      speedKms: state.speedKms,
      angleDeg: state.angleDeg,
      dragCoeff: state.dragCoeff
    });

    const el = sim.initialElements;
    const autoColor = customColor || (
      el.willImpact ? (state.speedKms < 6.2 ? '#ff6b6b' : '#ffd166') :
      el.kind === 'circle' ? '#5eead4' :
      el.totalEnergy < 0 ? '#c4b5fd' : '#f472b6'
    );
    const label = customLabel || `${state.speedKms.toFixed(2)} km/s (${
      el.willImpact ? '墜地' : el.kind === 'circle' ? '圓軌道' : el.totalEnergy < 0 ? '橢圓' : '逃逸'
    })`;

    if (!keepExisting || state.mode === 'single') {
      state.simClock = 0;
      state.activeShots = [];
    }

    const shotObj = {
      id: `custom-${Date.now()}`,
      name: label,
      shortLabel: label,
      color: autoColor,
      sim,
      fireAt: state.simClock,
      fired: true,
      impactPlayed: false,
      completePlayed: false
    };

    state.activeShots.push(shotObj);
    if (state.activeShots.length > 8) state.activeShots.shift();

    spawnCannonSmoke(R + state.altitudeKm, state.angleDeg);
    updateModeButtons();
    updateStoryButtons();
    updateAllReadouts();
  }

  // ---------- Synchronize Controls & Readouts ----------
  function formatVal(meta, val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '';
    return meta.decimals > 0 ? n.toFixed(meta.decimals) : String(Math.round(n));
  }

  function syncControlInputs() {
    SLIDER_META.forEach((meta) => {
      const sEl = $(meta.sliderId);
      const nEl = $(meta.numId);
      const str = formatVal(meta, state[meta.key]);
      if (sEl && document.activeElement !== sEl) sEl.value = str;
      if (nEl && document.activeElement !== nEl) nEl.value = str;
    });

    const crit = C.criticalSpeeds(state.altitudeKm);
    const ratioVc = state.speedKms / crit.vc;
    $('speed-out').textContent = `${state.speedKms.toFixed(2)} km/s (${ratioVc.toFixed(2)} v_c)`;
    $('angle-out').textContent = `${state.angleDeg > 0 ? '+' : ''}${state.angleDeg}° (${
      state.angleDeg === 0 ? '水平切線' : state.angleDeg > 0 ? '仰角發射' : '俯角發射'
    })`;
    $('alt-out').textContent = `${Math.round(state.altitudeKm)} km (r₀ = ${Math.round(crit.r0).toLocaleString()} km)`;
    $('drag-out').textContent = state.dragCoeff === 0
      ? '0.00 (無阻力理想真空)'
      : `${state.dragCoeff.toFixed(2)} (高空阻力開啟)`;

    $('mark-vc').textContent = `v_c ≈ ${crit.vc.toFixed(2)}`;
    $('mark-ve').textContent = `v_e ≈ ${crit.ve.toFixed(2)}`;
  }

  function getPrimaryShot() {
    if (!state.activeShots.length) return null;
    // In sequence mode, return the most recently fired shot
    const firedList = state.activeShots.filter((s) => state.simClock >= s.fireAt);
    return firedList.length ? firedList[firedList.length - 1] : state.activeShots[0];
  }

  function updateAllReadouts() {
    syncControlInputs();

    const primary = getPrimaryShot();
    const sim = primary ? primary.sim : C.simulateShot({
      altitudeKm: state.altitudeKm,
      speedKms: state.speedKms,
      angleDeg: state.angleDeg,
      dragCoeff: state.dragCoeff
    });

    const sampled = primary ? getSampledPointAtVisualSec(primary, state.simClock) : null;
    const currPt = sampled ? sampled.point : sim.initial;
    const instEl = C.analyzeState(currPt);
    const initEl = sim.initialElements;
    const crit = C.criticalSpeeds(sim.params.altitudeKm);

    // Top HUD cells
    $('hud-speed').innerHTML = `${sim.params.speedKms.toFixed(2)}<small>km/s</small>`;
    $('hud-inst-speed').innerHTML = `${instEl.v.toFixed(2)}<small>km/s</small>`;
    $('hud-alt').innerHTML = `${Math.max(0, Math.round(instEl.altitudeKm)).toLocaleString()}<small>km</small>`;
    $('hud-ecc').textContent = initEl.e < 99 ? initEl.e.toFixed(3) : '—';

    const tMin = Math.floor((currPt.t || 0) / 60);
    const tSec = Math.floor((currPt.t || 0) % 60);
    $('hud-time').textContent = `${String(tMin).padStart(2, '0')}:${String(tSec).padStart(2, '0')}m`;

    $('hud-eyebrow').textContent =
      `山頂高度 ${Math.round(sim.params.altitudeKm)} km · v_c = ${crit.vc.toFixed(2)} km/s · v_e = ${crit.ve.toFixed(2)} km/s`;

    // Regime badge & narrative
    const badgeEl = $('hud-regime-badge');
    const focusBadgeEl = $('hud-focus-badge');
    badgeEl.className = 'hud-fair-badge';

    if (sim.impacted) {
      badgeEl.classList.add('suborbital');
      badgeEl.textContent = sim.params.dragCoeff > 0 && !initEl.willImpact
        ? '大氣阻力軌道衰減墜地'
        : `次軌道拋體 (v₀ < v_c)`;
      focusBadgeEl.textContent = '地心 = 橢圓遠焦點 (Far Focus)';
    } else if (initEl.kind === 'circle') {
      badgeEl.classList.add('orbit');
      badgeEl.textContent = '第一宇宙速度圓軌道 (v₀ = v_c)';
      focusBadgeEl.textContent = '地心 = 圓心 (e ≈ 0)';
    } else if (initEl.totalEnergy < 0) {
      badgeEl.classList.add('ellipse');
      badgeEl.textContent = '封閉克卜勒橢圓軌道 (v_c < v₀ < v_e)';
      focusBadgeEl.textContent = initEl.focusRole === 'near_focus'
        ? '地心 = 橢圓近焦點 (Near Focus)'
        : '地心 = 橢圓遠焦點';
    } else {
      badgeEl.classList.add('escape');
      badgeEl.textContent = '第二宇宙速度逃逸 (v₀ ≥ v_e)';
      focusBadgeEl.textContent = '總力學能 ε ≥ 0 (開放軌道)';
    }

    if (primary && primary.summary) {
      $('hud-title').textContent = `${primary.name}（v₀ = ${sim.params.speedKms.toFixed(2)} km/s）`;
      $('hud-subtitle').textContent = primary.summary;
    } else if (sim.impacted) {
      $('hud-title').textContent =
        sim.params.angleDeg !== 0 && sim.params.speedKms >= crit.vc
          ? `仰角 ${sim.params.angleDeg > 0 ? '+' : ''}${sim.params.angleDeg}° 發射：橢圓近地點低於地表，返航途中撞擊地球！`
          : `初速 ${sim.params.speedKms.toFixed(2)} km/s：飛出 ${Math.round(sim.groundArcKm).toLocaleString()} km（地心角 ${sim.centralAngleDeg.toFixed(1)}°）後撞擊地表`;
      $('hud-subtitle').textContent =
        `向心重力拉拽大於切線離心效應，砲彈沿以「地心為遠焦點」的克卜勒橢圓弧墜落地表（最高高度 ${Math.round(sim.maxAltitudeKm).toLocaleString()} km）。`;
    } else if (initEl.kind === 'circle') {
      $('hud-title').textContent = `初速 ${sim.params.speedKms.toFixed(2)} km/s：下墜曲率等於地球曲率，形成完美圓形軌道！`;
      $('hud-subtitle').textContent =
        `砲彈每秒自由落體的距離剛好等於地球表面向下彎曲的落差，繞行一圈週期 ${(initEl.period / 60).toFixed(1)} 分鐘。`;
    } else if (initEl.totalEnergy < 0) {
      $('hud-title').textContent =
        `初速 ${sim.params.speedKms.toFixed(2)} km/s：山頂為近地點，南端甩出 ${Math.round(sim.maxAltitudeKm).toLocaleString()} km 遠地點！`;
      $('hud-subtitle').textContent =
        `遵守克卜勒第二定律（面積速率守恆）：在山頂近地點最快（${sim.params.speedKms.toFixed(2)} km/s），在南端遠地點最慢，週期 ${(initEl.period / 60).toFixed(1)} 分鐘。`;
    } else {
      $('hud-title').textContent =
        `初速 ${sim.params.speedKms.toFixed(2)} km/s：突破第二宇宙速度 (${crit.ve.toFixed(2)} km/s)，徹底掙脫地球重力！`;
      $('hud-subtitle').textContent =
        `總比機械能 ε = +${initEl.totalEnergy.toFixed(2)} MJ/kg > 0，砲彈沿雙曲線軌道飛向星際深空，永不返回。`;
    }

    // Right-hand Kepler Readouts
    $('integrator-tag').textContent = sim.params.dragCoeff > 0 ? '四階龍格-庫塔 (RK4)' : '保辛 Velocity Verlet';

    const kindMap = {
      suborbital: '次軌道橢圓弧 (撞擊地表)',
      circle: '正圓形軌道 (Circle, e ≈ 0)',
      ellipse: '封閉橢圓軌道 (Ellipse, 0 < e < 1)',
      parabola: '臨界拋物線逃逸 (Parabola, e = 1)',
      hyperbola: '雙曲線星際逃逸 (Hyperbola, e > 1)'
    };
    $('r-orbit-kind').textContent = kindMap[initEl.kind] || initEl.kind;
    $('r-focus-role').textContent =
      initEl.kind === 'circle' ? '圓心 (兩焦點重合)' :
      initEl.focusRole === 'far_focus' ? '遠焦點 Far Focus (起點為遠點)' : '近焦點 Near Focus (起點為近點)';

    $('r-critical-speeds').textContent = `${crit.vc.toFixed(2)} km/s ／ ${crit.ve.toFixed(2)} km/s`;

    const hp = Math.round(initEl.periapsis - R);
    const ha = Number.isFinite(initEl.apoapsis) ? `${Math.round(initEl.apoapsis - R).toLocaleString()} km` : '∞ (無遠點)';
    $('r-apsides').textContent = `${hp.toLocaleString()} km${hp < 0 ? ' (球內)' : ''} ／ ${ha}`;

    const aStr = Number.isFinite(initEl.a) ? `${Math.round(Math.abs(initEl.a)).toLocaleString()} km` : '∞';
    const pStr = sim.impacted
      ? `飛行 ${(sim.flightTimeSec / 60).toFixed(1)} min 撞擊`
      : Number.isFinite(initEl.period) ? `${(initEl.period / 60).toFixed(1)} min` : '無限 (不返航)';
    $('r-semi-period').textContent = `${aStr} ／ ${pStr}`;

    $('r-ground-range').textContent = sim.impacted
      ? `${Math.round(sim.groundArcKm).toLocaleString()} km (地心角 ${sim.centralAngleDeg.toFixed(1)}°)`
      : initEl.totalEnergy < 0 ? '環繞全球 40,030 km (360°)' : '飛向無窮遠深空 (∞)';

    $('r-accel-decomp').textContent =
      `${instEl.atM_s2 >= 0 ? '+' : ''}${instEl.atM_s2.toFixed(2)} m/s² ／ ${instEl.anM_s2.toFixed(2)} m/s²`;
    $('r-ang-mom').textContent = `${Math.round(instEl.hMag).toLocaleString()} km²/s`;
    $('r-energy-drift').textContent = sim.params.dragCoeff > 0
      ? `阻力耗散 Δε = ${(sim.finalElements.totalEnergy - initEl.totalEnergy).toFixed(2)} MJ/kg`
      : `${(sim.energyDriftRatio * 100).toExponential(2)}% (嚴格守恆)`;

    drawCurvatureChart(sim);
    drawEnergyChart(sim, instEl);
  }

  // ---------- High-DPI Offscreen Procedural Earth Globe ----------
  const stars = Array.from({ length: 160 }, (_, i) => ({
    x: ((i * 79.19 + 13.37) % 100) / 100,
    y: ((i * i * 31.71 + 29.11) % 100) / 100,
    r: i % 11 === 0 ? 1.5 : i % 4 === 0 ? 1.0 : 0.65,
    baseAlpha: 0.22 + (i % 5) * 0.14,
    phase: i * 0.9
  }));

  // Continent polygons in normalized unit-sphere coordinates (x, y in [-1, 1], matching Euro-African view of the Reel!)
  const CONTINENT_POLYS = [
    // Africa
    {
      color: '#3f7a4d',
      desertColor: '#9c834f',
      pts: [
        [-0.36, 0.22], [-0.18, 0.28], [0.05, 0.24], [0.22, 0.22], [0.34, 0.08],
        [0.48, 0.02], [0.38, -0.18], [0.28, -0.44], [0.16, -0.72], [0.02, -0.78],
        [-0.08, -0.58], [-0.14, -0.32], [-0.12, -0.08], [-0.28, -0.02], [-0.40, 0.08]
      ]
    },
    // Sahara / North African Golden Ochre belt
    {
      color: '#a38952',
      pts: [
        [-0.34, 0.20], [-0.16, 0.26], [0.06, 0.22], [0.24, 0.19], [0.30, 0.06],
        [0.12, 0.02], [-0.18, 0.03], [-0.36, 0.09]
      ]
    },
    // Arabian Peninsula & Middle East
    {
      color: '#8f7847',
      pts: [
        [0.26, 0.24], [0.42, 0.32], [0.58, 0.24], [0.56, 0.06], [0.40, 0.02], [0.28, 0.14]
      ]
    },
    // Europe (Iberia, France, Central Europe, Italy, Balkans, Eastern Europe)
    {
      color: '#468352',
      pts: [
        [-0.32, 0.34], [-0.35, 0.44], [-0.22, 0.48], [-0.16, 0.58], [0.02, 0.64],
        [0.24, 0.68], [0.48, 0.62], [0.45, 0.42], [0.26, 0.36], [0.14, 0.34],
        [0.08, 0.42], [0.02, 0.34], [-0.06, 0.44], [-0.18, 0.36]
      ]
    },
    // Scandinavia
    {
      color: '#4d8a59',
      pts: [
        [-0.08, 0.68], [-0.02, 0.82], [0.14, 0.85], [0.20, 0.74], [0.06, 0.67]
      ]
    },
    // British Isles
    {
      color: '#4e8f5b',
      pts: [
        [-0.28, 0.56], [-0.24, 0.66], [-0.17, 0.62], [-0.21, 0.54]
      ]
    },
    // Madagascar
    {
      color: '#468352',
      pts: [
        [0.36, -0.46], [0.42, -0.42], [0.40, -0.60], [0.34, -0.58]
      ]
    },
    // South America eastern tip (Brazil) on far left limb
    {
      color: '#3b7548',
      pts: [
        [-0.95, -0.18], [-0.76, -0.26], [-0.82, -0.54], [-0.96, -0.45]
      ]
    }
  ];

  // Night-side city light clusters (normalized globe coordinates on eastern twilight/night side)
  const CITY_LIGHTS = [
    { x: 0.21, y: 0.20, r: 2.2 }, // Cairo & Nile Delta
    { x: 0.22, y: 0.16, r: 1.5 },
    { x: 0.26, y: 0.27, r: 1.8 }, // Tel Aviv / Beirut
    { x: 0.22, y: 0.40, r: 2.1 }, // Istanbul
    { x: 0.36, y: 0.58, r: 2.2 }, // Moscow
    { x: 0.44, y: 0.18, r: 1.9 }, // Riyadh / Persian Gulf
    { x: 0.51, y: 0.16, r: 2.1 }, // Dubai
    { x: 0.30, y: -0.05, r: 1.4 }, // Nairobi
    { x: 0.16, y: -0.64, r: 1.8 }  // Johannesburg
  ];

  // Cloud wisps (normalized coords)
  const CLOUD_WISPS = [
    { x: -0.42, y: 0.42, rx: 0.28, ry: 0.08, rot: -0.3 },
    { x: -0.52, y: -0.05, rx: 0.32, ry: 0.09, rot: 0.2 },
    { x: -0.15, y: -0.22, rx: 0.24, ry: 0.07, rot: -0.15 },
    { x: 0.08, y: 0.52, rx: 0.26, ry: 0.07, rot: 0.25 },
    { x: -0.25, y: -0.62, rx: 0.34, ry: 0.08, rot: 0.35 }
  ];

  // ---------- Main Space Canvas Rendering ----------
  const canvas = $('cannon-canvas');
  const ctx = canvas.getContext('2d');
  let cw = 800;
  let ch = 580;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    cw = Math.max(300, rect.width);
    ch = Math.max(300, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getScale() {
    // Base scale fits ~3.3 Earth radii vertically so the globe + mountain + orbits match the Reel framing
    return (Math.min(cw, ch) / (R * 3.35)) * state.cam.zoom;
  }

  function worldToScreen(wx, wy) {
    const s = getScale();
    return {
      x: cw * 0.5 + (wx - state.cam.cx) * s,
      y: ch * 0.5 - (wy - state.cam.cy) * s
    };
  }

  function screenToWorld(px, py) {
    const s = getScale();
    return {
      x: state.cam.cx + (px - cw * 0.5) / s,
      y: state.cam.cy - (py - ch * 0.5) / s
    };
  }

  function drawEarthAndMountain(nowMs) {
    const center = worldToScreen(0, 0);
    const scale = getScale();
    const rPx = R * scale;

    // 1. Outer atmospheric Rayleigh glow
    const atmoGrad = ctx.createRadialGradient(center.x, center.y, rPx * 0.92, center.x, center.y, rPx * 1.24);
    atmoGrad.addColorStop(0, 'rgba(56, 189, 248, 0.38)');
    atmoGrad.addColorStop(0.45, 'rgba(37, 99, 235, 0.14)');
    atmoGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(center.x, center.y, rPx * 1.24, 0, Math.PI * 2);
    ctx.fill();

    // 2. Clipped Earth Sphere
    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, rPx, 0, Math.PI * 2);
    ctx.clip();

    // Ocean gradient with sunlit specular highlight on upper-left (-0.35, -0.32)
    const oceanGrad = ctx.createRadialGradient(
      center.x - rPx * 0.36,
      center.y - rPx * 0.32,
      rPx * 0.08,
      center.x + rPx * 0.15,
      center.y + rPx * 0.15,
      rPx * 1.25
    );
    oceanGrad.addColorStop(0, '#4fc3f7');
    oceanGrad.addColorStop(0.28, '#1e68b8');
    oceanGrad.addColorStop(0.68, '#0d3b78');
    oceanGrad.addColorStop(1, '#051530');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(center.x - rPx, center.y - rPx, rPx * 2, rPx * 2);

    // Subtle latitude/longitude graticule
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.08)';
    ctx.lineWidth = 0.8;
    for (const lat of [-0.6, -0.3, 0, 0.3, 0.6]) {
      ctx.beginPath();
      ctx.ellipse(center.x, center.y - lat * rPx, rPx * Math.sqrt(1 - lat * lat), rPx * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Continents (drawn with smooth midpoint quadratic curves for organic coastlines)
    for (const cont of CONTINENT_POLYS) {
      ctx.fillStyle = cont.color;
      const pts = cont.pts.map(([nx, ny]) => ({
        x: center.x + nx * rPx,
        y: center.y - ny * rPx
      }));
      if (pts.length > 2) {
        ctx.beginPath();
        const mid0 = { x: (pts[pts.length - 1].x + pts[0].x) * 0.5, y: (pts[pts.length - 1].y + pts[0].y) * 0.5 };
        ctx.moveTo(mid0.x, mid0.y);
        for (let i = 0; i < pts.length; i++) {
          const next = pts[(i + 1) % pts.length];
          const mid = { x: (pts[i].x + next.x) * 0.5, y: (pts[i].y + next.y) * 0.5 };
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // Soft feathered atmospheric clouds
    for (const cl of CLOUD_WISPS) {
      ctx.save();
      ctx.translate(center.x + cl.x * rPx, center.y - cl.y * rPx);
      ctx.rotate(cl.rot);
      ctx.scale(1, cl.ry / cl.rx);
      const cr = cl.rx * rPx;
      const cGrad = ctx.createRadialGradient(0, 0, cr * 0.1, 0, 0, cr);
      cGrad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
      cGrad.addColorStop(0.6, 'rgba(241, 245, 249, 0.22)');
      cGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.arc(0, 0, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Day / Night Terminator Shadow on the Eastern (Right) Hemisphere (matching Reel!)
    const termGrad = ctx.createLinearGradient(
      center.x - rPx * 0.15,
      center.y - rPx * 0.25,
      center.x + rPx * 0.78,
      center.y + rPx * 0.38
    );
    termGrad.addColorStop(0, 'rgba(2, 6, 23, 0)');
    termGrad.addColorStop(0.45, 'rgba(2, 6, 23, 0.42)');
    termGrad.addColorStop(0.75, 'rgba(2, 6, 23, 0.84)');
    termGrad.addColorStop(1, 'rgba(2, 6, 23, 0.94)');
    ctx.fillStyle = termGrad;
    ctx.fillRect(center.x - rPx, center.y - rPx, rPx * 2, rPx * 2);

    // Warm golden city lights on the night side
    for (const light of CITY_LIGHTS) {
      const lx = center.x + light.x * rPx;
      const ly = center.y - light.y * rPx;
      const twinkle = 0.65 + 0.35 * Math.sin(nowMs * 0.004 + light.x * 19);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.75 * twinkle})`;
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(1.2, light.r * (rPx / 150)), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Crisp atmospheric limb ring
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(center.x, center.y, rPx, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Newton's Mountain at the North Pole (0, R -> R + h)
    const r0 = R + state.altitudeKm;
    const visualMountainKm = Math.max(360, state.altitudeKm); // Ensure visible mountain even when h=0
    const peakPt = worldToScreen(0, R + visualMountainKm);
    const launchPt = worldToScreen(0, r0);
    const baseHalfAngle = 0.16; // ~9 degrees on each side of North Pole
    const baseLeft = worldToScreen(-R * Math.sin(baseHalfAngle), R * Math.cos(baseHalfAngle));
    const baseRight = worldToScreen(R * Math.sin(baseHalfAngle), R * Math.cos(baseHalfAngle));

    // Mountain rocky body
    const mtnGrad = ctx.createLinearGradient(baseLeft.x, peakPt.y, baseRight.x, baseRight.y);
    mtnGrad.addColorStop(0, '#94a3b8');
    mtnGrad.addColorStop(0.5, '#64748b');
    mtnGrad.addColorStop(1, '#334155');
    ctx.fillStyle = mtnGrad;
    ctx.beginPath();
    ctx.moveTo(baseLeft.x, baseLeft.y + 3);
    ctx.quadraticCurveTo(
      (baseLeft.x + peakPt.x) * 0.52,
      (baseLeft.y + peakPt.y) * 0.52,
      peakPt.x - 6,
      peakPt.y
    );
    ctx.lineTo(peakPt.x + 6, peakPt.y);
    ctx.quadraticCurveTo(
      (baseRight.x + peakPt.x) * 0.48,
      (baseRight.y + peakPt.y) * 0.52,
      baseRight.x,
      baseRight.y + 3
    );
    ctx.closePath();
    ctx.fill();

    // Snow cap on top half of Newton's Mountain
    const snowLeftX = peakPt.x + (baseLeft.x - peakPt.x) * 0.45;
    const snowLeftY = peakPt.y + (baseLeft.y - peakPt.y) * 0.45;
    const snowRightX = peakPt.x + (baseRight.x - peakPt.x) * 0.45;
    const snowRightY = peakPt.y + (baseRight.y - peakPt.y) * 0.45;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(peakPt.x - 5, peakPt.y);
    ctx.lineTo(peakPt.x + 5, peakPt.y);
    ctx.lineTo(snowRightX, snowRightY);
    ctx.lineTo(peakPt.x + 4, snowRightY - 4);
    ctx.lineTo(peakPt.x - 2, snowLeftY + 2);
    ctx.lineTo(snowLeftX, snowLeftY);
    ctx.closePath();
    ctx.fill();

    // 4. Cannon on the Summit (at launchPt)
    ctx.save();
    ctx.translate(launchPt.x, launchPt.y);

    // Wooden/iron carriage base
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-9, -2, 16, 6);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(-4, 4, 3.2, 0, Math.PI * 2);
    ctx.arc(4, 4, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Cannon barrel rotated by state.angleDeg (screen Y is inverted so -angleDeg)
    ctx.rotate(-state.angleDeg * DEG);
    const recoilPx = state.recoil * 5;
    const barrelGrad = ctx.createLinearGradient(-6 - recoilPx, -5, 18 - recoilPx, 5);
    barrelGrad.addColorStop(0, '#475569');
    barrelGrad.addColorStop(0.5, '#cbd5e1');
    barrelGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = barrelGrad;
    ctx.beginPath();
    ctx.roundRect(-7 - recoilPx, -4.2, 23, 8.4, 3);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Muzzle rim
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(14 - recoilPx, -5, 3, 10);

    // Muzzle flash if firing
    if (state.muzzleFlash > 0.02) {
      const flashR = 12 + state.muzzleFlash * 16;
      const fGrad = ctx.createRadialGradient(20, 0, 1, 20, 0, flashR);
      fGrad.addColorStop(0, `rgba(255, 255, 255, ${state.muzzleFlash})`);
      fGrad.addColorStop(0.4, `rgba(253, 224, 71, ${state.muzzleFlash * 0.9})`);
      fGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.arc(20, 0, flashR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawArrow(p1, p2, color, lineWidth = 2, dashed = false, label = '') {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 3) return;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    if (dashed) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const head = Math.min(9, len * 0.35);
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - head * Math.cos(ang - 0.42), p2.y - head * Math.sin(ang - 0.42));
    ctx.lineTo(p2.x - head * Math.cos(ang + 0.42), p2.y - head * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
    if (label) {
      ctx.font = '600 11px "Cascadia Code", Consolas, monospace';
      ctx.fillText(label, p2.x + 6 * Math.cos(ang), p2.y + 6 * Math.sin(ang) - 4);
    }
    ctx.restore();
  }

  function drawScene(nowMs) {
    ctx.clearRect(0, 0, cw, ch);

    // Deep space background stars
    for (const s of stars) {
      const tw = s.baseAlpha * (0.7 + 0.3 * Math.sin(nowMs * 0.002 + s.phase));
      ctx.fillStyle = `rgba(226, 232, 240, ${tw})`;
      ctx.beginPath();
      ctx.arc(s.x * cw, s.y * ch, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Optional Kepler Foci & Apsides for primary bound orbit
    const primary = getPrimaryShot();
    if (state.showFoci && primary && primary.sim.initialElements.totalEnergy < 0) {
      const sim = primary.sim;
      const el = sim.initialElements;
      const center = worldToScreen(0, 0);
      // Draw F1 (Earth center) and F2 (Empty focus: -2 * a * e_vec)
      const rDotV = sim.initial.x * sim.initial.vx + sim.initial.y * sim.initial.vy;
      const v2 = sim.initial.vx * sim.initial.vx + sim.initial.vy * sim.initial.vy;
      const r0 = Math.hypot(sim.initial.x, sim.initial.y);
      const ex = ((v2 - C.MU / r0) * sim.initial.x - rDotV * sim.initial.vx) / C.MU;
      const ey = ((v2 - C.MU / r0) * sim.initial.y - rDotV * sim.initial.vy) / C.MU;
      const f2World = { x: -2 * el.a * ex, y: -2 * el.a * ey };
      const f2Screen = worldToScreen(f2World.x, f2World.y);

      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(f2Screen.x, f2Screen.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // F2 marker
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(f2Screen.x, f2Screen.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px "Cascadia Code", Consolas, monospace';
      ctx.fillText('F₂ 空焦點', f2Screen.x + 7, f2Screen.y + 4);
      ctx.restore();
    }

    // Draw Earth & Newton's Mountain
    drawEarthAndMountain(nowMs);

    // Draw F1 (Earth center) marker on top of globe if showFoci
    if (state.showFoci) {
      const cPt = worldToScreen(0, 0);
      ctx.save();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(cPt.x, cPt.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '600 11px "Cascadia Code", Consolas, monospace';
      ctx.fillStyle = 'rgba(253, 224, 71, 0.9)';
      ctx.fillText('F₁ 地心', cPt.x + 7, cPt.y + 4);
      ctx.restore();
    }

    // Optional Flat-Earth Uniform Gravity Parabola comparison
    if (state.showFlatEarth && primary) {
      const fPts = primary.sim.flatEarthPoints;
      if (fPts && fPts.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        fPts.forEach((pt, idx) => {
          const sp = worldToScreen(pt.x, pt.y);
          if (idx === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        });
        ctx.stroke();
        const lastFp = worldToScreen(fPts[fPts.length - 1].x, fPts[fPts.length - 1].y);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '11px "Segoe UI", sans-serif';
        ctx.fillText('平拋拋物線近似 (g 恆定)', lastFp.x + 6, lastFp.y);
        ctx.restore();
      }
    }

    // Draw all active shots and their glowing trails
    state.activeShots.forEach((shot) => {
      if (state.simClock < shot.fireAt) return;
      if (!shot.fired) {
        shot.fired = true;
        spawnCannonSmoke(R + shot.sim.params.altitudeKm, shot.sim.params.angleDeg);
      }

      const sampled = getSampledPointAtVisualSec(shot, state.simClock);
      if (!sampled) return;

      const pts = shot.sim.points;
      const maxT = sampled.trailEndPhysT;

      // 1. Outer neon glow + crisp core trajectory line
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Build path up to maxT
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].t > maxT) break;
        const sp = worldToScreen(pts[i].x, pts[i].y);
        if (!started) {
          ctx.moveTo(sp.x, sp.y);
          started = true;
        } else {
          ctx.lineTo(sp.x, sp.y);
        }
      }
      const headScreen = worldToScreen(sampled.point.x, sampled.point.y);
      if (started && !sampled.completedOrbit) {
        ctx.lineTo(headScreen.x, headScreen.y);
      }

      // Outer glow
      ctx.strokeStyle = shot.color;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 6.5;
      ctx.stroke();

      // Core line
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();

      // 2. Impact crater marker or moving cannonball
      if (sampled.impactedNow) {
        const hitPt = worldToScreen(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.save();
        ctx.fillStyle = shot.color;
        ctx.beginPath();
        ctx.arc(hitPt.x, hitPt.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      } else {
        // Glowing cannonball head
        ctx.save();
        const ballGlow = ctx.createRadialGradient(
          headScreen.x, headScreen.y, 1,
          headScreen.x, headScreen.y, 13
        );
        ballGlow.addColorStop(0, '#ffffff');
        ballGlow.addColorStop(0.35, shot.color);
        ballGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ballGlow;
        ctx.beginPath();
        ctx.arc(headScreen.x, headScreen.y, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(headScreen.x, headScreen.y, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Velocity & Gravity acceleration vectors on the active shot
        if (state.showVectors && shot === primary) {
          const vScale = 6.5;
          drawArrow(
            headScreen,
            { x: headScreen.x + sampled.point.vx * vScale, y: headScreen.y - sampled.point.vy * vScale },
            '#34d399',
            2.0,
            false,
            `v = ${Math.hypot(sampled.point.vx, sampled.point.vy).toFixed(2)} km/s`
          );
          const rCurr = Math.hypot(sampled.point.x, sampled.point.y);
          const ag = (C.MU / (rCurr * rCurr)) * 1000; // m/s²
          const gScale = 4.8;
          drawArrow(
            headScreen,
            {
              x: headScreen.x - (sampled.point.x / rCurr) * ag * gScale,
              y: headScreen.y + (sampled.point.y / rCurr) * ag * gScale
            },
            '#fb7185',
            1.8,
            true,
            `a_g = ${ag.toFixed(1)} m/s²`
          );
        }
      }

      // 3. Direct trajectory label with pill background positioned cleanly outside the path
      let labelAnchor = null;
      if (shot.sim.impacted) {
        // Place label at ~65% along the suborbital arc so it sits cleanly outside the trajectory
        labelAnchor = pts[Math.floor(pts.length * 0.65)];
      } else if (shot.sim.escaped) {
        labelAnchor = pts[Math.min(pts.length - 1, Math.floor(pts.length * 0.38))];
      } else if (shot.sim.initialElements.kind === 'circle') {
        // Place circular orbit label on the left (9 o'clock) outer side
        labelAnchor = pts[Math.floor(pts.length * 0.72)];
      } else {
        // Place elliptical orbit label at apogee (6 o'clock bottom)
        labelAnchor = shot.sim.apogeePoint;
      }

      if (labelAnchor && maxT >= labelAnchor.t * 0.55) {
        const lp = worldToScreen(labelAnchor.x, labelAnchor.y);
        const norm = Math.hypot(labelAnchor.x, labelAnchor.y) || 1;
        const dirX = labelAnchor.x / norm;
        const dirY = -labelAnchor.y / norm;
        const offsetDist = shot.sim.impacted ? 24 : 20;
        const tx = lp.x + dirX * offsetDist;
        const ty = lp.y + dirY * offsetDist;
        const text = shot.shortLabel || shot.name;

        ctx.save();
        ctx.font = '600 11.5px "Segoe UI", "Noto Sans TC", sans-serif';
        const tw = ctx.measureText(text).width;
        const alignLeft = dirX >= 0.15;
        const alignRight = dirX <= -0.15;
        const rawBoxX = alignLeft ? tx : alignRight ? tx - tw - 12 : tx - (tw + 12) * 0.5;
        const boxX = clamp(rawBoxX, 8, cw - tw - 20);
        const boxY = clamp(ty - 11, 8, ch - 28);

        ctx.fillStyle = 'rgba(7, 13, 25, 0.82)';
        ctx.strokeStyle = shot.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, tw + 12, 20, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = shot.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, boxX + 6, boxY + 10.5);
        ctx.restore();
      }
    });

    // Draw Cannon Muzzle Smoke Particles
    state.smokeParticles.forEach((p) => {
      const sp = worldToScreen(p.x, p.y);
      const rPx = Math.max(2, p.sizeKm * getScale());
      ctx.save();
      ctx.fillStyle = `rgba(226, 232, 240, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, rPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw Surface Impact Explosion Particles
    state.impactParticles.forEach((p) => {
      const sp = worldToScreen(p.x, p.y);
      ctx.save();
      if (p.isRing) {
        const ringR = Math.max(4, (p.age / p.maxAge) * 28);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, ringR, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const rPx = Math.max(2, p.sizeKm * getScale());
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rPx, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // Interactive drag-to-aim preview arrow at cannon
    if (state.cam.aimingCannon) {
      const r0 = R + state.altitudeKm;
      const launchScreen = worldToScreen(0, r0);
      const rad = state.angleDeg * DEG;
      const lenPx = state.speedKms * 12;
      const tip = {
        x: launchScreen.x + Math.cos(rad) * lenPx,
        y: launchScreen.y - Math.sin(rad) * lenPx
      };
      drawArrow(
        launchScreen,
        tip,
        '#fde047',
        2.6,
        false,
        `發射 v₀ = ${state.speedKms.toFixed(2)} km/s (${state.angleDeg}°)`
      );
    }
  }

  // ---------- 2D Panel 1: Earth Curvature (8 km -> 5 m drop) Chart ----------
  function drawCurvatureChart(sim) {
    const cCanvas = $('curvature-chart');
    if (!cCanvas) return;
    const cctx = cCanvas.getContext('2d');
    const w = cCanvas.width;
    const h = cCanvas.height;
    cctx.clearRect(0, 0, w, h);

    const curv = C.computeCurvatureDrop(sim.params.speedKms, sim.params.altitudeKm);
    $('curvature-tag').textContent =
      `1秒前進 ${curv.dist1sKm.toFixed(2)} km · 下墜 ${curv.gravityFall1sM.toFixed(2)} m vs 地表下彎 ${curv.earthDrop1sM.toFixed(2)} m`;

    const padL = 54;
    const padR = 24;
    const padT = 28;
    const padB = 34;
    const pw = w - padL - padR;
    const ph = h - padT - padB;

    // Plot horizontal x in [0, 2200] km, vertical y relative to r0 in [-380, +120] km
    const xMax = 2200;
    const yMin = -380;
    const yMax = 120;
    const r0 = R + sim.params.altitudeKm;

    const toX = (xKm) => padL + (xKm / xMax) * pw;
    const toY = (dyKm) => padT + ((yMax - dyKm) / (yMax - yMin)) * ph;

    // Grid
    cctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    cctx.lineWidth = 1;
    for (const gx of [0, 500, 1000, 1500, 2000]) {
      const px = toX(gx);
      cctx.beginPath();
      cctx.moveTo(px, padT);
      cctx.lineTo(px, padT + ph);
      cctx.stroke();
      cctx.fillStyle = '#94a3b8';
      cctx.font = '10.5px "Cascadia Code", Consolas, monospace';
      cctx.textAlign = 'center';
      cctx.fillText(`${gx} km`, px, h - 10);
    }

    // 1. Horizontal tangent line (dy = 0)
    cctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    cctx.setLineDash([4, 4]);
    cctx.beginPath();
    cctx.moveTo(toX(0), toY(0));
    cctx.lineTo(toX(xMax), toY(0));
    cctx.stroke();
    cctx.setLineDash([]);
    cctx.fillStyle = '#cbd5e1';
    cctx.textAlign = 'right';
    cctx.fillText('水平切線基準 (y = r₀)', toX(xMax) - 6, toY(0) - 6);

    // 2. Constant-altitude concentric arc (y = sqrt(r0^2 - x^2) - r0)
    cctx.strokeStyle = '#38bdf8';
    cctx.lineWidth = 2;
    cctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const x = (xMax * i) / 80;
      const dy = Math.sqrt(Math.max(0, r0 * r0 - x * x)) - r0;
      const px = toX(x);
      const py = toY(dy);
      if (i === 0) cctx.moveTo(px, py);
      else cctx.lineTo(px, py);
    }
    cctx.stroke();

    // 3. Flat-Earth uniform gravity parabola
    const gLocal = C.MU / (r0 * r0);
    const vx0 = Math.max(0.5, sim.initial.vx);
    const vy0 = sim.initial.vy;
    cctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
    cctx.setLineDash([3, 4]);
    cctx.lineWidth = 1.6;
    cctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const x = (xMax * i) / 80;
      const t = x / vx0;
      const dy = vy0 * t - 0.5 * gLocal * t * t;
      const px = toX(x);
      const py = toY(clamp(dy, yMin - 20, yMax + 20));
      if (i === 0) cctx.moveTo(px, py);
      else cctx.lineTo(px, py);
    }
    cctx.stroke();
    cctx.setLineDash([]);

    // 4. Actual cannonball trajectory in initial quadrant
    cctx.strokeStyle = '#5eead4';
    cctx.lineWidth = 2.6;
    cctx.beginPath();
    let drew = false;
    for (const pt of sim.points) {
      if (pt.x < 0 || pt.x > xMax || pt.y < 0) break;
      const dy = pt.y - r0;
      const px = toX(pt.x);
      const py = toY(clamp(dy, yMin - 15, yMax + 15));
      if (!drew) {
        cctx.moveTo(px, py);
        drew = true;
      } else {
        cctx.lineTo(px, py);
      }
    }
    cctx.stroke();

    // Callout box on bottom-left explaining the 1-second drop ratio
    cctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    cctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    cctx.lineWidth = 1;
    cctx.beginPath();
    cctx.roundRect(padL + 10, padT + ph - 62, 305, 54, 8);
    cctx.fill();
    cctx.stroke();

    cctx.fillStyle = '#f8fafc';
    cctx.textAlign = 'left';
    cctx.font = '600 11.5px "Segoe UI", "Noto Sans TC", sans-serif';
    const ratioStr = curv.fallToCurveRatio.toFixed(2);
    cctx.fillText(
      `下墜 ÷ 地表彎曲比 = ${ratioStr} ${
        Math.abs(curv.fallToCurveRatio - 1) < 0.03 ? '（完美平衡 = 圓軌道！）' :
        curv.fallToCurveRatio > 1 ? '（下墜較快 → 高度遞減）' : '（下墜較慢 → 爬升至遠地點）'
      }`,
      padL + 20,
      padT + ph - 40
    );
    cctx.fillStyle = '#94a3b8';
    cctx.font = '11px "Cascadia Code", Consolas, monospace';
    cctx.fillText(
      `地表(h=0)標準：前進 7.91 km ⇔ 地表下彎 4.91 m`,
      padL + 20,
      padT + ph - 20
    );
  }

  // ---------- 2D Panel 2: Speed vs Specific Energy & Regime Phase Chart ----------
  function drawEnergyChart(sim, instEl) {
    const eCanvas = $('energy-chart');
    if (!eCanvas) return;
    const ectx = eCanvas.getContext('2d');
    const w = eCanvas.width;
    const h = eCanvas.height;
    ectx.clearRect(0, 0, w, h);

    const crit = C.criticalSpeeds(sim.params.altitudeKm);
    const eps = sim.initialElements.totalEnergy;
    $('energy-tag').textContent = `總比能 ε = ${eps >= 0 ? '+' : ''}${eps.toFixed(2)} MJ/kg (${
      eps < 0 ? '重力束縛態' : '非束縛逃逸態'
    })`;

    const padL = 48;
    const padR = 128; // Reserve right side for live K, U, E energy bars
    const padT = 24;
    const padB = 34;
    const pw = w - padL - padR;
    const ph = h - padT - padB;

    const vMin = 1.0;
    const vMax = 13.0;
    const eMin = -65;
    const eMax = 35;

    const toX = (v) => padL + ((v - vMin) / (vMax - vMin)) * pw;
    const toY = (eVal) => padT + ((eMax - eVal) / (eMax - eMin)) * ph;

    // Regime background bands
    const xVc = toX(crit.vc);
    const xVe = toX(crit.ve);
    ectx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    ectx.fillRect(padL, padT, Math.max(0, xVc - padL), ph);
    ectx.fillStyle = 'rgba(139, 92, 246, 0.09)';
    ectx.fillRect(xVc, padT, Math.max(0, xVe - xVc), ph);
    ectx.fillStyle = 'rgba(236, 72, 153, 0.08)';
    ectx.fillRect(xVe, padT, Math.max(0, padL + pw - xVe), ph);

    // Zero-energy line (escape threshold E = 0)
    const yZero = toY(0);
    ectx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ectx.setLineDash([4, 4]);
    ectx.beginPath();
    ectx.moveTo(padL, yZero);
    ectx.lineTo(padL + pw, yZero);
    ectx.stroke();

    // Vertical lines for vc and ve
    ectx.strokeStyle = 'rgba(94, 234, 212, 0.5)';
    ectx.beginPath();
    ectx.moveTo(xVc, padT);
    ectx.lineTo(xVc, padT + ph);
    ectx.stroke();

    ectx.strokeStyle = 'rgba(244, 114, 182, 0.5)';
    ectx.beginPath();
    ectx.moveTo(xVe, padT);
    ectx.lineTo(xVe, padT + ph);
    ectx.stroke();
    ectx.setLineDash([]);

    ectx.font = '10.5px "Cascadia Code", Consolas, monospace';
    ectx.fillStyle = '#5eead4';
    ectx.textAlign = 'center';
    ectx.fillText(`v_c=${crit.vc.toFixed(1)}`, xVc, padT + 12);
    ectx.fillStyle = '#f472b6';
    ectx.fillText(`v_e=${crit.ve.toFixed(1)}`, xVe, padT + 12);

    // X-axis speed ticks
    ectx.fillStyle = '#94a3b8';
    for (const vTick of [2, 4, 6, 8, 10, 12]) {
      ectx.fillText(`${vTick}`, toX(vTick), h - 10);
    }

    // Plot curves: K(v) = 0.5 v^2, U0 = -MU/r0, E(v) = 0.5 v^2 - MU/r0
    const u0 = -C.MU / crit.r0;
    const curves = [
      { color: '#fbbf24', fn: (v) => 0.5 * v * v },
      { color: '#60a5fa', fn: () => u0 },
      { color: '#34d399', fn: (v) => 0.5 * v * v + u0 }
    ];

    curves.forEach((c) => {
      ectx.strokeStyle = c.color;
      ectx.lineWidth = 2.0;
      ectx.beginPath();
      for (let i = 0; i <= 70; i++) {
        const v = vMin + ((vMax - vMin) * i) / 70;
        const val = clamp(c.fn(v), eMin, eMax);
        const px = toX(v);
        const py = toY(val);
        if (i === 0) ectx.moveTo(px, py);
        else ectx.lineTo(px, py);
      }
      ectx.stroke();
    });

    // Current speed marker
    const curX = toX(clamp(sim.params.speedKms, vMin, vMax));
    const curY = toY(clamp(eps, eMin, eMax));
    ectx.strokeStyle = '#ffffff';
    ectx.lineWidth = 1.4;
    ectx.beginPath();
    ectx.moveTo(curX, padT);
    ectx.lineTo(curX, padT + ph);
    ectx.stroke();

    ectx.fillStyle = '#34d399';
    ectx.beginPath();
    ectx.arc(curX, curY, 5, 0, Math.PI * 2);
    ectx.fill();
    ectx.stroke();

    // Right-hand Live Energy Bars (K/m, U/m, E/m)
    const barBaseX = padL + pw + 18;
    const barW = 24;
    const bars = [
      { label: '動能 K', val: instEl.kineticEnergy, color: '#fbbf24' },
      { label: '位能 U', val: instEl.potentialEnergy, color: '#60a5fa' },
      { label: '總能 ε', val: instEl.totalEnergy, color: '#34d399' }
    ];
    bars.forEach((b, idx) => {
      const bx = barBaseX + idx * 34;
      const by0 = toY(0);
      const byVal = toY(clamp(b.val, eMin, eMax));
      ectx.fillStyle = b.color;
      ectx.globalAlpha = 0.85;
      ectx.fillRect(bx, Math.min(by0, byVal), barW, Math.max(2, Math.abs(byVal - by0)));
      ectx.globalAlpha = 1;
      ectx.fillStyle = '#cbd5e1';
      ectx.font = '10px "Segoe UI", sans-serif';
      ectx.textAlign = 'center';
      ectx.fillText(b.label, bx + barW / 2, h - 10);
    });
  }

  // ---------- UI Event Bindings ----------
  function updateModeButtons() {
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
    });
  }

  function updateStoryButtons() {
    const playBtn = $('story-play');
    if (playBtn) {
      playBtn.classList.toggle('playing', state.storyPlaying);
      playBtn.textContent = state.storyPlaying ? '⏸ 連射展演中 (5 發)' : '▶ 自動展演 Reel 5 發連射';
    }
    const pauseBtn = $('play-pause-btn');
    if (pauseBtn) {
      pauseBtn.textContent = state.paused ? '▶ 繼續' : '⏸ 暫停';
    }
  }

  // Bind Sliders, Direct Numeric Inputs & Triangle Steppers
  SLIDER_META.forEach((meta) => {
    const sEl = $(meta.sliderId);
    const nEl = $(meta.numId);

    const applyValue = (rawVal, fireImmediate = true) => {
      const v = clamp(Number(rawVal), meta.min, meta.max);
      if (!Number.isFinite(v)) return;
      state[meta.key] = Number(v.toFixed(meta.decimals));
      state.mode = 'single';
      if (fireImmediate) fireSingleShot();
      else updateAllReadouts();
    };

    if (sEl) {
      sEl.addEventListener('input', () => applyValue(sEl.value, true));
    }
    if (nEl) {
      nEl.addEventListener('change', () => applyValue(nEl.value, true));
      nEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyValue(nEl.value, true);
        }
      });
    }
  });

  document.querySelectorAll('.tri-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.stepTarget;
      const dir = Number(btn.dataset.stepDir || 1);
      const meta = SLIDER_META.find((m) => m.sliderId === targetId);
      if (!meta) return;
      const next = clamp(state[meta.key] + dir * meta.step, meta.min, meta.max);
      state[meta.key] = Number(next.toFixed(meta.decimals));
      state.mode = 'single';
      fireSingleShot();
    });
  });

  // Quick cosmic velocity buttons
  document.querySelectorAll('[data-set-v]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const crit = C.criticalSpeeds(state.altitudeKm);
      const kind = btn.dataset.setV;
      if (kind === 'vc') state.speedKms = Number(crit.vc.toFixed(2));
      else if (kind === 'graze') state.speedKms = Number(crit.vGraze.toFixed(2));
      else if (kind === 've') state.speedKms = Number((crit.ve + 0.05).toFixed(2));
      state.angleDeg = 0;
      state.mode = 'single';
      fireSingleShot();
    });
  });

  // Preset buttons
  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      const p = PRESETS[key];
      if (!p) return;
      document.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.speedKms = p.speedKms;
      state.angleDeg = p.angleDeg;
      state.altitudeKm = p.altitudeKm;
      state.dragCoeff = p.dragCoeff;
      state.mode = 'single';
      fireSingleShot(p.color, p.label);
    });
  });

  // Story chapter pills
  document.querySelectorAll('[data-chapter]').forEach((pill) => {
    pill.addEventListener('click', () => {
      const chIdx = Number(pill.dataset.chapter);
      document.querySelectorAll('[data-chapter]').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.activeChapter = chIdx;

      if (chIdx === 0) {
        applyCameraPreset('reel');
        startReelSequence();
      } else if (chIdx >= 1 && chIdx <= 5) {
        const s = C.REEL_SHOTS[chIdx - 1];
        state.speedKms = Number(s.speedKms.toFixed(2));
        state.angleDeg = s.angleDeg;
        state.altitudeKm = s.altitudeKm;
        state.dragCoeff = 0;
        state.mode = 'single';
        applyCameraPreset(chIdx === 5 ? 'deep' : 'reel');
        fireSingleShot(s.color, s.shortLabel);
      } else if (chIdx === 6) {
        const p = PRESETS.tilted;
        state.speedKms = p.speedKms;
        state.angleDeg = p.angleDeg;
        state.altitudeKm = p.altitudeKm;
        state.dragCoeff = 0;
        state.mode = 'single';
        applyCameraPreset('reel');
        fireSingleShot(p.color, p.label);
      } else if (chIdx === 7) {
        state.speedKms = 7.68;
        state.angleDeg = 0;
        state.altitudeKm = 350;
        state.dragCoeff = 0.65;
        state.mode = 'single';
        applyCameraPreset('reel');
        fireSingleShot('#f97316', '⑦ 低軌大氣阻力螺旋衰減');
      }
    });
  });

  $('story-play').addEventListener('click', () => {
    if (state.storyPlaying) {
      state.storyPlaying = false;
      state.paused = true;
      updateStoryButtons();
    } else {
      document.querySelectorAll('[data-chapter]').forEach((p, idx) => p.classList.toggle('active', idx === 0));
      startReelSequence();
    }
  });

  $('sound-toggle').addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    const btn = $('sound-toggle');
    btn.setAttribute('aria-pressed', String(state.soundEnabled));
    btn.textContent = state.soundEnabled ? '🔊 音效開啟' : '🔇 音效靜音';
    if (state.soundEnabled) ensureAudio();
  });

  $('fire-btn').addEventListener('click', () => {
    ensureAudio();
    if (state.mode === 'salvo') startSalvoMode();
    else fireSingleShot(null, null, state.mode === 'sequence');
  });

  $('play-pause-btn').addEventListener('click', () => {
    state.paused = !state.paused;
    if (state.paused) state.storyPlaying = false;
    updateStoryButtons();
  });

  $('clear-shots-btn').addEventListener('click', () => {
    state.activeShots = [];
    state.storyPlaying = false;
    state.simClock = 0;
    updateStoryButtons();
    updateAllReadouts();
  });

  $('reset-btn').addEventListener('click', () => {
    applyCameraPreset('reel');
    startReelSequence();
  });

  // View preset buttons
  document.querySelectorAll('[data-cam]').forEach((btn) => {
    btn.addEventListener('click', () => applyCameraPreset(btn.dataset.cam));
  });

  // Speed buttons
  document.querySelectorAll('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.timeScale = Number(btn.dataset.speed || 1);
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // Mode buttons
  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      if (m === 'sequence') startReelSequence();
      else if (m === 'salvo') startSalvoMode();
      else {
        state.mode = 'single';
        fireSingleShot();
      }
    });
  });

  // Vector & overlay checkboxes
  $('show-vectors').addEventListener('change', (e) => { state.showVectors = e.target.checked; });
  $('show-flat-earth').addEventListener('change', (e) => { state.showFlatEarth = e.target.checked; });
  $('show-foci').addEventListener('change', (e) => { state.showFoci = e.target.checked; });

  // Interactive Energy Chart click/drag to set speedKms
  const eCanvas = $('energy-chart');
  let draggingEnergyChart = false;
  function pickSpeedFromEnergyChart(ev) {
    const rect = eCanvas.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * eCanvas.width;
    const padL = 48;
    const pw = eCanvas.width - padL - 128;
    const ratio = clamp((px - padL) / pw, 0, 1);
    const v = 1.0 + ratio * 12.0;
    state.speedKms = Number((Math.round(v * 20) / 20).toFixed(2));
    state.mode = 'single';
    fireSingleShot();
  }
  eCanvas.addEventListener('pointerdown', (e) => {
    draggingEnergyChart = true;
    eCanvas.setPointerCapture(e.pointerId);
    pickSpeedFromEnergyChart(e);
  });
  eCanvas.addEventListener('pointermove', (e) => {
    if (draggingEnergyChart) pickSpeedFromEnergyChart(e);
  });
  eCanvas.addEventListener('pointerup', () => { draggingEnergyChart = false; });

  // Interactive Main Canvas Aiming & Camera Pan/Zoom
  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const launchScreen = worldToScreen(0, R + state.altitudeKm);

    if (Math.hypot(px - launchScreen.x, py - launchScreen.y) < 42) {
      state.cam.aimingCannon = true;
      canvas.setPointerCapture(e.pointerId);
    } else {
      state.cam.panning = true;
      state.cam.dragStartPx = { x: px, y: py, cx: state.cam.goalCx, cy: state.cam.goalCy };
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (state.cam.aimingCannon) {
      const launchScreen = worldToScreen(0, R + state.altitudeKm);
      const dx = px - launchScreen.x;
      const dy = launchScreen.y - py;
      const dist = Math.hypot(dx, dy);
      state.speedKms = Number(clamp(dist / 12, 1.5, 13.0).toFixed(2));
      state.angleDeg = Math.round(clamp(Math.atan2(dy, Math.max(8, dx)) * RAD, -30, 60));
      syncControlInputs();
    } else if (state.cam.panning && state.cam.dragStartPx) {
      const s = getScale();
      state.cam.goalCx = state.cam.dragStartPx.cx - (px - state.cam.dragStartPx.x) / s;
      state.cam.goalCy = state.cam.dragStartPx.cy + (py - state.cam.dragStartPx.y) / s;
    }
  });

  canvas.addEventListener('pointerup', () => {
    if (state.cam.aimingCannon) {
      state.cam.aimingCannon = false;
      state.mode = 'single';
      fireSingleShot();
    }
    state.cam.panning = false;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    state.cam.goalZoom = clamp(state.cam.goalZoom * factor, 0.35, 4.5);
  }, { passive: false });

  // ---------- Main Animation Loop ----------
  let lastFrameMs = null;
  function animate(nowMs) {
    if (lastFrameMs === null) lastFrameMs = nowMs;
    const dtReal = Math.min(0.05, (nowMs - lastFrameMs) / 1000);
    lastFrameMs = nowMs;

    if (!state.paused) {
      state.simClock += dtReal * state.timeScale;

      // Loop the 5-shot Reel sequence smoothly after ~13.5 seconds
      if (state.storyPlaying && state.mode === 'sequence' && state.simClock > 13.8) {
        startReelSequence();
      }
    }

    // Decay cannon recoil & muzzle flash
    state.recoil = Math.max(0, state.recoil - dtReal * 4.5);
    state.muzzleFlash = Math.max(0, state.muzzleFlash - dtReal * 8.0);

    // Update smoke & impact particles
    for (let i = state.smokeParticles.length - 1; i >= 0; i--) {
      const p = state.smokeParticles[i];
      p.age += dtReal;
      if (p.age >= p.maxAge) {
        state.smokeParticles.splice(i, 1);
      } else {
        p.x += p.vx * dtReal;
        p.y += p.vy * dtReal;
        p.sizeKm += 110 * dtReal;
        p.alpha = 0.75 * (1 - p.age / p.maxAge);
      }
    }

    for (let i = state.impactParticles.length - 1; i >= 0; i--) {
      const p = state.impactParticles[i];
      p.age += dtReal;
      if (p.age >= p.maxAge) {
        state.impactParticles.splice(i, 1);
      } else {
        p.x += p.vx * dtReal;
        p.y += p.vy * dtReal;
        p.alpha = 0.95 * (1 - p.age / p.maxAge);
      }
    }

    // Follow camera tracking if active
    const primary = getPrimaryShot();
    if (state.cameraPreset === 'follow' && primary) {
      const sampled = getSampledPointAtVisualSec(primary, state.simClock);
      if (sampled) {
        state.cam.goalCx = sampled.point.x * 0.65;
        state.cam.goalCy = sampled.point.y * 0.65;
      }
    }

    // Smooth camera interpolation
    const lerp = Math.min(1, dtReal * 7.5);
    state.cam.cx += (state.cam.goalCx - state.cam.cx) * lerp;
    state.cam.cy += (state.cam.goalCy - state.cam.cy) * lerp;
    state.cam.zoom += (state.cam.goalZoom - state.cam.zoom) * lerp;

    drawScene(nowMs);

    // Periodically refresh live HUD numbers during flight
    if (!state.paused) {
      updateAllReadouts();
    }

    requestAnimationFrame(animate);
  }

  // Initialize KaTeX math rendering when loaded
  window.addEventListener('load', () => {
    if (window.renderMathInElement) {
      window.renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    }
  });

  new ResizeObserver(resizeCanvas).observe(canvas);
  resizeCanvas();
  applyCameraPreset('reel', true);
  startReelSequence();
  requestAnimationFrame(animate);
})();
