/* Batted-ball aerodynamics & MLB Statcast Barrel model (0° ~ 90° launch angle).
 * Coordinates (side / stadium plane, metres):
 *   x → horizontal distance from home plate toward center field (can be < 0 for backward pop-ups!)
 *   y → vertical height above the field (bat contact at x = 0, y = h0 = 1.0 m)
 *
 * Forces:
 *   1. Gravity:        F_g = (0, -m g)
 *   2. Quadratic Drag: F_d = -½ ρ A C_D |v_rel| v_rel
 *   3. Magnus Lift:    F_m = +½ ρ A C_L(S) |v_rel| (ω̂ × v_rel)
 *      For backspin (ω along +z in right-handed side view where x is right, y is up),
 *      ω̂ × v_rel = (-v_rel,y, +v_rel,x).
 *      Notice that when the ball rises steeply (60°~90°, v_rel,y > 0), the x-component
 *      of Magnus force is NEGATIVE (-v_rel,y), pushing high pop-ups backward toward
 *      the catcher/backstop (Alan Nathan's "Paradoxical Pop-Up" effect).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BarrelPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BALL = {
    mass: 0.145,       // kg (5.125 oz)
    radius: 0.0366,    // m  (diameter 73.2 mm)
    area: Math.PI * 0.0366 * 0.0366
  };
  const G = 9.80665;
  const DEG = Math.PI / 180;
  const KMH_PER_MPH = 1.609344;

  const DEFAULTS = {
    speedKmh: 158,       // 98 mph (IG Reel baseline)
    angleDeg: 28,        // 0° ~ 90°
    rpm: 1260,           // typical batted-ball backspin rpm for line drives / fly balls
    cd: 0.398,           // effective drag coefficient calibrated to IG Reel (10°→83m, 28°→114m, 45°→103m)
    clScale: 1.0,
    altitudeM: 0,        // sea level = 0 m, Coors Field = 1600 m
    windMs: 0,           // + = tailwind toward center field, - = headwind
    h0: 1.0,             // bat contact height (m)
    wallDistanceM: 110,  // center-field wall distance (m)
    wallHeightM: 2.5,    // outfield wall height (m)
    dragEnabled: true,
    spinEnabled: true
  };

  function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  /**
   * Standard atmosphere density ρ(h) in kg/m³ (ISA troposphere up to 5000 m).
   */
  function airDensity(altitudeM) {
    const h = clamp(altitudeM ?? 0, -200, 5000);
    return 1.225 * Math.pow(1 - 2.25577e-5 * h, 4.25588);
  }

  /**
   * Spin parameter S = (r ω) / v_rel and lift coefficient C_L(S).
   * Uses smooth rational curve matching Nathan / Sawicki-Hubbard-Stronge baseball data.
   */
  function liftCoefficient(S, clScale) {
    if (!(S > 1e-9)) return 0;
    const scale = clScale === undefined ? 1.0 : clScale;
    return scale * (S / (0.385 + 2.22 * S));
  }

  /**
   * Official MLB Statcast Barrel zone definition as a function of Exit Velocity (km/h).
   * - Minimum threshold: 98 mph (~157.7 km/h; 158 km/h = 98.18 mph → 26° ~ 30°, width 4°)
   * - 100 mph (161 km/h) → 24° ~ 33°, width 9°
   * - 116+ mph (187 km/h) → 8° ~ 50°, width 42°
   */
  function barrelZone(speedKmh) {
    const v = Number(speedKmh) || 0;
    const mph = v / KMH_PER_MPH;
    if (mph < 97.7) {
      return {
        isBarrelEligible: false,
        speedKmh: v,
        speedMph: +mph.toFixed(1),
        minDeg: null,
        maxDeg: null,
        widthDeg: 0
      };
    }
    const clampedMph = Math.min(116, Math.max(98, Math.round(mph)));
    let minDeg, maxDeg;
    if (clampedMph <= 100) {
      minDeg = Math.round(26 - (clampedMph - 98) * 1.0);
      maxDeg = Math.round(30 + (clampedMph - 98) * 1.5);
    } else {
      minDeg = Math.round(24 - (clampedMph - 100) * 1.0);
      maxDeg = Math.round(33 + ((clampedMph - 100) / 16) * 17);
    }
    minDeg = Math.max(8, minDeg);
    maxDeg = Math.min(50, maxDeg);
    return {
      isBarrelEligible: true,
      speedKmh: v,
      speedMph: +mph.toFixed(1),
      minDeg,
      maxDeg,
      widthDeg: maxDeg - minDeg
    };
  }

  function isAngleInBarrel(speedKmh, angleDeg) {
    const z = barrelZone(speedKmh);
    if (!z.isBarrelEligible) return false;
    return angleDeg >= z.minDeg && angleDeg <= z.maxDeg;
  }

  function normalizeConfig(raw) {
    raw = raw || {};
    const num = (val, lo, hi, def) => {
      const n = Number(val);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
    };
    const dragEnabled = raw.dragEnabled !== undefined ? Boolean(raw.dragEnabled) : DEFAULTS.dragEnabled;
    const spinEnabled = raw.spinEnabled !== undefined ? Boolean(raw.spinEnabled) : DEFAULTS.spinEnabled;
    return {
      speedKmh: num(raw.speedKmh, 60, 220, DEFAULTS.speedKmh),
      angleDeg: num(raw.angleDeg, -10, 90, DEFAULTS.angleDeg),
      rpm: num(raw.rpm, -4000, 4500, DEFAULTS.rpm),
      cd: num(raw.cd, 0, 1.0, DEFAULTS.cd),
      clScale: num(raw.clScale, 0, 2.5, DEFAULTS.clScale),
      altitudeM: num(raw.altitudeM, 0, 4000, DEFAULTS.altitudeM),
      windMs: num(raw.windMs, -20, 20, DEFAULTS.windMs),
      h0: num(raw.h0, 0.2, 3.0, DEFAULTS.h0),
      wallDistanceM: num(raw.wallDistanceM, 80, 140, DEFAULTS.wallDistanceM),
      wallHeightM: num(raw.wallHeightM, 1.0, 12.0, DEFAULTS.wallHeightM),
      dragEnabled,
      spinEnabled
    };
  }

  /**
   * Simulate a single batted-ball trajectory from bat contact (x = 0, y = h0) until ground impact (y = 0).
   */
  function simulateBattedBall(rawCfg) {
    const cfg = normalizeConfig(rawCfg);
    const v0 = cfg.speedKmh / 3.6;
    const th = cfg.angleDeg * DEG;
    const rho = airDensity(cfg.altitudeM);
    const k = 0.5 * rho * BALL.area / BALL.mass;
    const cdEff = cfg.dragEnabled ? cfg.cd : 0;
    const w = (cfg.dragEnabled && cfg.spinEnabled) ? (cfg.rpm * 2 * Math.PI / 60) : 0;
    const windX = cfg.dragEnabled ? cfg.windMs : 0;

    let x = 0;
    let y = cfg.h0;
    let vx = v0 * Math.cos(th);
    let vy = v0 * Math.sin(th);
    let t = 0;
    const dt = 0.002;
    const sampleEvery = 10; // store path every 0.02 s

    let apexM = y;
    let apexX = x;
    let apexTimeS = 0;
    let heightAtWall = null;

    const path = [{
      t: 0,
      x: 0,
      y: cfg.h0,
      vx,
      vy,
      speedKmh: cfg.speedKmh
    }];

    function accel(vxNow, vyNow) {
      if (!cfg.dragEnabled) return [0, -G];
      const rvx = vxNow - windX;
      const rvy = vyNow;
      const s = Math.hypot(rvx, rvy);
      if (s < 1e-8) return [0, -G];
      let cl = 0;
      if (w !== 0) {
        const S = (BALL.radius * Math.abs(w)) / s;
        cl = Math.sign(w) * liftCoefficient(S, cfg.clScale);
      }
      // Drag opposes relative velocity; backspin Magnus force is perpendicular: (-rvy, +rvx)
      const ax = -k * cdEff * s * rvx - k * cl * s * rvy;
      const ay = -G - k * cdEff * s * rvy + k * cl * s * rvx;
      return [ax, ay];
    }

    let step = 0;
    const maxSteps = 12000; // up to 24 s
    while (y > 0 && step < maxSteps) {
      const [ax1, ay1] = accel(vx, vy);
      const vx2 = vx + 0.5 * dt * ax1, vy2 = vy + 0.5 * dt * ay1;
      const [ax2, ay2] = accel(vx2, vy2);
      const vx3 = vx + 0.5 * dt * ax2, vy3 = vy + 0.5 * dt * ay2;
      const [ax3, ay3] = accel(vx3, vy3);
      const vx4 = vx + dt * ax3, vy4 = vy + dt * ay3;
      const [ax4, ay4] = accel(vx4, vy4);

      const nx = x + (dt / 6) * (vx + 2 * vx2 + 2 * vx3 + vx4);
      const ny = y + (dt / 6) * (vy + 2 * vy2 + 2 * vy3 + vy4);
      const nvx = vx + (dt / 6) * (ax1 + 2 * ax2 + 2 * ax3 + ax4);
      const nvy = vy + (dt / 6) * (ay1 + 2 * ay2 + 2 * ay3 + ay4);

      if (ny > apexM) {
        apexM = ny;
        apexX = nx;
        apexTimeS = t + dt;
      }

      // Record height when crossing the outfield fence plane x = wallDistanceM
      if (heightAtWall === null && x < cfg.wallDistanceM && nx >= cfg.wallDistanceM) {
        const fracWall = (cfg.wallDistanceM - x) / Math.max(1e-9, nx - x);
        heightAtWall = y + fracWall * (ny - y);
      }

      if (ny <= 0) {
        const frac = y / Math.max(1e-9, y - ny);
        x = x + frac * (nx - x);
        y = 0;
        vx = vx + frac * (nvx - vx);
        vy = vy + frac * (nvy - vy);
        t = t + frac * dt;
        path.push({
          t: +t.toFixed(4),
          x: +x.toFixed(3),
          y: 0,
          vx,
          vy,
          speedKmh: +(Math.hypot(vx, vy) * 3.6).toFixed(1)
        });
        break;
      }

      x = nx;
      y = ny;
      vx = nvx;
      vy = nvy;
      t += dt;
      step++;

      if (step % sampleEvery === 0) {
        path.push({
          t: +t.toFixed(4),
          x: +x.toFixed(3),
          y: +y.toFixed(3),
          vx,
          vy,
          speedKmh: +(Math.hypot(vx, vy) * 3.6).toFixed(1)
        });
      }
    }

    const carryM = +x.toFixed(2);
    const hangTimeS = +t.toFixed(2);
    const impactSpeedKmh = +(Math.hypot(vx, vy) * 3.6).toFixed(1);
    const clearsWall = carryM >= cfg.wallDistanceM && (heightAtWall === null || heightAtWall >= cfg.wallHeightM);
    const isBarrel = isAngleInBarrel(cfg.speedKmh, cfg.angleDeg);

    // Outcome classification (matching baseball physics & IG Reel tags)
    let outcome = 'OUT';
    let outcomeLabel = '外野接殺 アウト';
    if (clearsWall) {
      outcome = 'HR';
      outcomeLabel = '全壘打 ホームラン';
    } else if (carryM < 0) {
      outcome = 'POPUP_BACK';
      outcomeLabel = '本壘後方倒退飛球（後旋迴旋）';
    } else if (cfg.angleDeg >= 55 || (carryM < 52 && cfg.angleDeg >= 38)) {
      outcome = 'POPUP';
      outcomeLabel = '沖天炮高飛接殺 アウト';
    } else if (hangTimeS <= 3.35 && carryM >= 38 && cfg.angleDeg <= 21) {
      outcome = 'HIT';
      outcomeLabel = '平飛／穿越安打 ヒット';
    } else if (cfg.angleDeg < 5) {
      outcome = 'GROUNDER';
      outcomeLabel = '滾地／強襲球';
    }

    return {
      config: cfg,
      carryM,
      hangTimeS,
      apexM: +apexM.toFixed(2),
      apexX: +apexX.toFixed(2),
      apexTimeS: +apexTimeS.toFixed(2),
      impactSpeedKmh,
      heightAtWall: heightAtWall !== null ? +heightAtWall.toFixed(2) : null,
      clearsWall,
      isBarrel,
      outcome,
      outcomeLabel,
      airDensity: +rho.toFixed(4),
      path
    };
  }

  /**
   * Compare all 3 physical models at the same launch conditions:
   * - full:     Gravity + Air Drag + Backspin Magnus Lift
   * - dragOnly: Gravity + Air Drag (no spin)
   * - vacuum:   Gravity only (no air resistance, textbook parabola)
   */
  function compareModels(rawCfg) {
    const base = normalizeConfig(rawCfg);
    const full = simulateBattedBall({ ...base, dragEnabled: true, spinEnabled: true });
    const dragOnly = simulateBattedBall({ ...base, dragEnabled: true, spinEnabled: false });
    const vacuum = simulateBattedBall({ ...base, dragEnabled: false, spinEnabled: false });
    return {
      full,
      dragOnly,
      vacuum,
      dragLossM: +(vacuum.carryM - dragOnly.carryM).toFixed(1),
      spinGainM: +(full.carryM - dragOnly.carryM).toFixed(1),
      netAeroLossM: +(vacuum.carryM - full.carryM).toFixed(1)
    };
  }

  /**
   * Sweep launch angles from 0° to maxAngle (default 90°) for all 3 models.
   * Includes 60°~90° high pop-ups and backward-looping trajectories.
   */
  function sweepAngles(rawCfg, maxAngle, step) {
    const base = normalizeConfig(rawCfg);
    const hi = maxAngle !== undefined ? clamp(maxAngle, 30, 90) : 90;
    const dStep = step || 1;
    const angles = [];
    const full = [];
    const dragOnly = [];
    const vacuum = [];

    let bestFull = { angleDeg: 0, carryM: -Infinity, apexM: 0, hangTimeS: 0 };
    let bestDrag = { angleDeg: 0, carryM: -Infinity, apexM: 0, hangTimeS: 0 };
    let bestVac = { angleDeg: 0, carryM: -Infinity, apexM: 0, hangTimeS: 0 };

    for (let deg = 0; deg <= hi; deg += dStep) {
      angles.push(deg);
      const rFull = simulateBattedBall({ ...base, angleDeg: deg, dragEnabled: true, spinEnabled: true });
      const rDrag = simulateBattedBall({ ...base, angleDeg: deg, dragEnabled: true, spinEnabled: false });
      const rVac = simulateBattedBall({ ...base, angleDeg: deg, dragEnabled: false, spinEnabled: false });

      full.push(rFull);
      dragOnly.push(rDrag);
      vacuum.push(rVac);

      if (rFull.carryM > bestFull.carryM) {
        bestFull = { angleDeg: deg, carryM: rFull.carryM, apexM: rFull.apexM, hangTimeS: rFull.hangTimeS };
      }
      if (rDrag.carryM > bestDrag.carryM) {
        bestDrag = { angleDeg: deg, carryM: rDrag.carryM, apexM: rDrag.apexM, hangTimeS: rDrag.hangTimeS };
      }
      if (rVac.carryM > bestVac.carryM) {
        bestVac = { angleDeg: deg, carryM: rVac.carryM, apexM: rVac.apexM, hangTimeS: rVac.hangTimeS };
      }
    }

    return {
      angles,
      full,
      dragOnly,
      vacuum,
      barrel: barrelZone(base.speedKmh),
      optimal: {
        full: bestFull,
        dragOnly: bestDrag,
        vacuum: bestVac
      }
    };
  }

  /**
   * Storyboard chapters matching the IG Reel (@sports_kaibogaku) + 60°~90° Pop-up Physics.
   */
  const STORY_CHAPTERS = [
    {
      id: 'intro',
      badge: 'スロー ×1/8',
      title: '全壘打的甜蜜仰角，只有區區 4 度？',
      subtitle: '打球初速 158 km/h（98 mph）· MLB Statcast 數據與空氣動力模擬',
      mode: 'single',
      camera: 'batter',
      timeScale: 0.18,
      durationS: 4.5,
      config: { speedKmh: 158, angleDeg: 28, rpm: 1260, altitudeM: 0, windMs: 0 }
    },
    {
      id: 'deg10',
      badge: 'ヒット（安打）',
      title: '10 度：太低了',
      subtitle: '83 m · 滯空 2.6 秒。靠後旋馬格努斯升力雖比真空（72m）還遠，但平飛落地形成一壘安打。',
      mode: 'single',
      camera: 'stadium',
      timeScale: 1.0,
      durationS: 4.2,
      config: { speedKmh: 158, angleDeg: 10, rpm: 1260, altitudeM: 0, windMs: 0 }
    },
    {
      id: 'deg45',
      badge: 'アウト · 早送り ×1.5',
      title: '45 度：太高了？（空氣阻力吃掉 94 公尺！）',
      subtitle: '真空中 45° 可飛 197m 最遠；但真實空氣阻力讓球在最高點嚴重失速，103 m · 滯空 6.3 秒被外野手接殺！',
      mode: 'single',
      camera: 'stadium',
      timeScale: 1.5,
      durationS: 5.2,
      config: { speedKmh: 158, angleDeg: 45, rpm: 1260, altitudeM: 0, windMs: 0 }
    },
    {
      id: 'deg28',
      badge: 'ホームラン（全壘打）',
      title: '28 度：飛進 114m 外野看台！',
      subtitle: '兼顧水平穿透力與後旋升力，滯空 5.0 秒直接越過 110m 全壘打牆！',
      mode: 'single',
      camera: 'stadium',
      timeScale: 1.0,
      durationS: 5.8,
      config: { speedKmh: 158, angleDeg: 28, rpm: 1260, altitudeM: 0, windMs: 0 }
    },
    {
      id: 'popup60_90',
      badge: '60°～90° 沖天炮奇觀',
      title: '60～90 度：沖天炮為何會「往本壘後方倒退」？',
      subtitle: '仰角超過 60° 不僅嚴重失速，80°～90° 時上升段的後旋馬格努斯力（ω×v）更把球推向捕手後方（85° 落點 −7m、90° 落點 −23m）！',
      mode: 'fan',
      fanRange: [0, 90],
      highlightRange: [60, 90],
      camera: 'side',
      timeScale: 1.4,
      durationS: 6.5,
      config: { speedKmh: 158, angleDeg: 85, rpm: 1260, altitudeM: 0, windMs: 0 }
    },
    {
      id: 'fan158',
      badge: '26～30° バレル（Barrel）',
      title: '0～90 度全部打出：這 4 度就是「Barrel」',
      subtitle: '158 km/h 時，MLB 定義打擊率 .500、長打率 1.500 以上的黃金甜蜜區僅有 26°～30°（寬度 4 度）！',
      mode: 'fan',
      fanRange: [0, 90],
      camera: 'stadium',
      timeScale: 1.3,
      durationS: 6.0,
      config: { speedKmh: 158, angleDeg: 28, rpm: 1260, altitudeM: 0, windMs: 0 }
    },
    {
      id: 'speed161',
      badge: '161 km/h：24～33°',
      title: '打得更快一點？161 km/h（100 mph）',
      subtitle: '初速只加 3 km/h，克服空氣阻力的餘裕大增，Barrel 甜蜜區從 4 度擴張為 24°～33°（9 度寬）！',
      mode: 'fan',
      fanRange: [0, 90],
      camera: 'stadium',
      timeScale: 1.3,
      durationS: 5.2,
      config: { speedKmh: 161, angleDeg: 28, rpm: 1260, altitudeM: 0, windMs: 0 }
    },
    {
      id: 'speed187',
      badge: '187 km/h：8～50°（大谷翔平級）',
      title: '187 km/h（116 mph）：8～50 度全都是 Barrel！',
      subtitle: '全壘打＝初速 × 仰角。擊球初速越快，空氣阻力下允許的仰角容錯範圍就越寬廣！',
      mode: 'fan',
      fanRange: [0, 90],
      camera: 'stadium',
      timeScale: 1.3,
      durationS: 6.0,
      config: { speedKmh: 187, angleDeg: 28, rpm: 1260, altitudeM: 0, windMs: 0 }
    }
  ];

  return {
    BALL,
    G,
    DEFAULTS,
    STORY_CHAPTERS,
    airDensity,
    liftCoefficient,
    barrelZone,
    isAngleInBarrel,
    normalizeConfig,
    simulateBattedBall,
    compareModels,
    sweepAngles
  };
});
