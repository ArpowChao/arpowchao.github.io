/* Newton's Cannonball Physics Engine (Principia Mathematica, 1687)
 * Units: km, s, km/s, km/s², MJ/kg (km²/s²).
 * Integrators:
 *   - Velocity Verlet (symplectic, energy-conserving) for conservative inverse-square gravity
 *   - 4th-Order Runge-Kutta (RK4) when atmospheric drag is enabled
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CannonPhysics = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MU = 398600.4418;          // Earth GM (km³/s²)
  const EARTH_RADIUS = 6371.0;     // Mean Earth radius R⊕ (km)
  const G0_M_S2 = (MU / (EARTH_RADIUS * EARTH_RADIUS)) * 1000; // ~9.81998 m/s²
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const TAU = 2 * Math.PI;

  const DEFAULT_MOUNTAIN_KM = 700; // Prominent Newton's Mountain peak altitude (km)

  // The 5 iconic shots from the Newton's Cannonball Reel
  const REEL_SHOTS = [
    {
      id: 'shot1',
      index: 1,
      name: '第 1 發：低速墜地',
      shortLabel: '① 5.20 km/s 近處墜落',
      color: '#ff6b6b',
      speedKms: 5.20,
      angleDeg: 0,
      altitudeKm: DEFAULT_MOUNTAIN_KM,
      fireDelaySec: 0.0,
      badge: '次軌道拋體 (v < v_c)',
      summary: '初速 5.20 km/s，萬有引力向心拉拽遠大於離心趨勢，砲彈飛出約 3,450 km（地心角約 31°）即墜入北半球地表。'
    },
    {
      id: 'shot2',
      index: 2,
      name: '第 2 發：遠程弧線墜地',
      shortLabel: '② 7.05 km/s 跨洲墜落',
      color: '#ffd166',
      speedKms: 7.05,
      angleDeg: 0,
      altitudeKm: DEFAULT_MOUNTAIN_KM,
      fireDelaySec: 1.8,
      badge: '長程次軌道 (v < v_c)',
      summary: '初速提升至 7.05 km/s，地球表面隨砲彈前進而向下彎曲，使飛行弧長大幅延伸至約 8,300 km（地心角約 75°）才撞擊赤道附近。'
    },
    {
      id: 'shot3',
      index: 3,
      name: '第 3 發：完美圓形軌道',
      shortLabel: '③ 7.50 km/s 圓軌道 (v = v_c)',
      color: '#5eead4',
      speedKms: Math.sqrt(MU / (EARTH_RADIUS + DEFAULT_MOUNTAIN_KM)), // ~7.5042 km/s
      angleDeg: 0,
      altitudeKm: DEFAULT_MOUNTAIN_KM,
      fireDelaySec: 3.6,
      badge: '第一宇宙速度 (v = v_c)',
      summary: '初速恰為圓軌道速度 7.50 km/s！砲彈每秒下墜的距離正好等於地球表面向下彎曲的落差，「永遠在下墜，卻永遠不會落地」。'
    },
    {
      id: 'shot4',
      index: 4,
      name: '第 4 發：橢圓環繞軌道',
      shortLabel: '④ 8.18 km/s 橢圓軌道',
      color: '#c4b5fd',
      speedKms: 8.18,
      angleDeg: 0,
      altitudeKm: DEFAULT_MOUNTAIN_KM,
      fireDelaySec: 6.0,
      badge: '封閉橢圓軌道 (v_c < v < v_e)',
      summary: '初速 8.18 km/s 超過圓軌道速度（1.09 v_c）。山頂成為近地點，砲彈在南端甩出高遠的遠地點（離地 3,780 km），遵守面積速率守恆繞回山頂。'
    },
    {
      id: 'shot5',
      index: 5,
      name: '第 5 發：掙脫重力逃逸',
      shortLabel: '⑤ 10.8 km/s 重力逃逸 (v ≥ v_e)',
      color: '#f472b6',
      speedKms: 10.80,
      angleDeg: 0,
      altitudeKm: DEFAULT_MOUNTAIN_KM,
      fireDelaySec: 8.2,
      badge: '第二宇宙速度 (v ≥ v_e)',
      summary: '初速 10.80 km/s 突破逃逸速度（10.61 km/s），總力學能 E = K + U > 0，地球萬有引力再也無法將它拉回，沿雙曲線飛向無垠深空！'
    }
  ];

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function criticalSpeeds(altitudeKm = DEFAULT_MOUNTAIN_KM, mu = MU, radius = EARTH_RADIUS) {
    const r0 = radius + Math.max(0, altitudeKm);
    const vc = Math.sqrt(mu / r0);
    const ve = Math.sqrt((2 * mu) / r0);
    // Minimum horizontal speed from altitude h so that perigee at antipode (6 o'clock) just grazes r = R_earth:
    // By vis-viva & angular momentum: r_p = R_earth, r_a = r0 => a = (r0 + R_earth)/2
    // v_graze = sqrt(mu * (2/r0 - 2/(r0 + R_earth))) = vc * sqrt(2 * R_earth / (r0 + R_earth))
    const vGraze = vc * Math.sqrt((2 * radius) / (r0 + radius));
    return {
      r0,
      altitudeKm: r0 - radius,
      vc,
      ve,
      vGraze,
      surfaceVc: Math.sqrt(mu / radius),
      surfaceVe: Math.sqrt((2 * mu) / radius)
    };
  }

  /**
   * Compute full orbital elements and instant force/acceleration decomposition at state {x, y, vx, vy}
   */
  function analyzeState(state, options = {}) {
    const mu = options.mu ?? MU;
    const radius = options.radius ?? EARTH_RADIUS;
    const x = state.x;
    const y = state.y;
    const vx = state.vx;
    const vy = state.vy;

    const r = Math.hypot(x, y);
    const v = Math.hypot(vx, vy);
    const altitudeKm = r - radius;

    // Unit radial and tangential (clockwise-positive around North Pole launch) vectors
    const urx = r > 0 ? x / r : 0;
    const ury = r > 0 ? y / r : 1;
    // Clockwise tangent: at top (0, r), tangent points +x (1, 0) -> (ury, -urx)
    const utx = ury;
    const uty = -urx;

    const vr = vx * urx + vy * ury;
    const vt = vx * utx + vy * uty;

    // Specific angular momentum h_z = x * vy - y * vx (negative for clockwise motion)
    const hz = x * vy - y * vx;
    const hMag = Math.abs(hz);

    // Specific energies (km²/s² = MJ/kg)
    const kineticEnergy = 0.5 * v * v;
    const potentialEnergy = -mu / r;
    const totalEnergy = kineticEnergy + potentialEnergy;

    // Eccentricity vector e_vec = ((v² - mu/r) r_vec - (r_vec · v_vec) v_vec) / mu
    const rDotV = x * vx + y * vy;
    const ex = ((v * v - mu / r) * x - rDotV * vx) / mu;
    const ey = ((v * v - mu / r) * y - rDotV * vy) / mu;
    const e = Math.hypot(ex, ey);

    const p = (hMag * hMag) / mu;
    const alpha = (-2 * totalEnergy) / mu; // 1/a
    const a = Math.abs(alpha) < 1e-12 ? Infinity : 1 / alpha;

    const periapsis = e < 1e-9 ? r : p / (1 + e);
    const apoapsis = totalEnergy < -1e-9 ? a * (1 + e) : Infinity;
    const period = totalEnergy < -1e-9 ? TAU * Math.sqrt((a * a * a) / mu) : Infinity;

    const vcLocal = Math.sqrt(mu / r);
    const veLocal = Math.sqrt((2 * mu) / r);

    // Gravity acceleration vector a_g = -mu / r² * u_r (in km/s², multiply by 1000 for m/s²)
    const agMagKms2 = mu / (r * r);
    const ax = -agMagKms2 * urx;
    const ay = -agMagKms2 * ury;

    // Decompose acceleration along velocity tangent and normal
    let atM_s2 = 0;
    let anM_s2 = agMagKms2 * 1000;
    if (v > 1e-9) {
      const uvx = vx / v;
      const uvy = vy / v;
      atM_s2 = (ax * uvx + ay * uvy) * 1000;
      const anx = ax - (atM_s2 / 1000) * uvx;
      const any = ay - (atM_s2 / 1000) * uvy;
      anM_s2 = Math.hypot(anx, any) * 1000;
    }

    const curvatureRadiusKm = anM_s2 > 1e-9 ? (v * v) / (anM_s2 / 1000) : Infinity;

    // Classify orbit regime
    const willImpact = periapsis <= radius * (1 + 1e-6);
    let kind = 'ellipse';
    let focusRole = 'near_focus';
    if (willImpact && totalEnergy < 0) {
      kind = 'suborbital';
      focusRole = 'far_focus';
    } else if (Math.abs(e) < 0.008 && totalEnergy < 0) {
      kind = 'circle';
      focusRole = 'center';
    } else if (totalEnergy < -0.05) {
      kind = 'ellipse';
      focusRole = v < vcLocal ? 'far_focus' : 'near_focus';
    } else if (Math.abs(totalEnergy) <= 0.05) {
      kind = 'parabola';
      focusRole = 'near_focus';
    } else {
      kind = 'hyperbola';
      focusRole = 'near_focus';
    }

    return {
      r,
      altitudeKm,
      v,
      vr,
      vt,
      hMag,
      kineticEnergy,
      potentialEnergy,
      totalEnergy,
      e,
      a,
      p,
      periapsis,
      apoapsis,
      period,
      vcLocal,
      veLocal,
      agM_s2: agMagKms2 * 1000,
      atM_s2,
      anM_s2,
      ax,
      ay,
      curvatureRadiusKm,
      willImpact,
      kind,
      focusRole
    };
  }

  /**
   * Compute acceleration at state {x, y, vx, vy} with optional exponential upper-atmosphere drag
   */
  function computeAcceleration(state, opts = {}) {
    const mu = opts.mu ?? MU;
    const radius = opts.radius ?? EARTH_RADIUS;
    const dragCoeff = opts.dragCoeff ?? 0;

    const r = Math.hypot(state.x, state.y);
    const invR3 = 1 / (r * r * r);
    let ax = -mu * state.x * invR3;
    let ay = -mu * state.y * invR3;

    if (dragCoeff > 0) {
      const alt = Math.max(0, r - radius);
      // Scale height model for upper atmosphere pedagogical drag
      const scaleHeight = 180; // km
      const rhoFactor = Math.exp(-alt / scaleHeight);
      const v = Math.hypot(state.vx, state.vy);
      const dragMag = dragCoeff * 1e-4 * rhoFactor * v;
      ax -= dragMag * state.vx;
      ay -= dragMag * state.vy;
    }

    return { ax, ay };
  }

  /**
   * Single Symplectic Velocity Verlet step (used when dragCoeff === 0)
   */
  function stepVelocityVerlet(state, dt, opts = {}) {
    const a0 = computeAcceleration(state, opts);
    const halfDt2 = 0.5 * dt * dt;
    const nx = state.x + state.vx * dt + a0.ax * halfDt2;
    const ny = state.y + state.vy * dt + a0.ay * halfDt2;
    const nextPosState = { x: nx, y: ny, vx: state.vx, vy: state.vy };
    const a1 = computeAcceleration(nextPosState, opts);
    const nvx = state.vx + 0.5 * (a0.ax + a1.ax) * dt;
    const nvy = state.vy + 0.5 * (a0.ay + a1.ay) * dt;
    return { x: nx, y: ny, vx: nvx, vy: nvy };
  }

  /**
   * Single 4th-Order Runge-Kutta (RK4) step (used when dragCoeff > 0)
   */
  function stepRK4(state, dt, opts = {}) {
    function deriv(s) {
      const a = computeAcceleration(s, opts);
      return { dx: s.vx, dy: s.vy, dvx: a.ax, dvy: a.ay };
    }
    const k1 = deriv(state);
    const k2 = deriv({
      x: state.x + 0.5 * dt * k1.dx,
      y: state.y + 0.5 * dt * k1.dy,
      vx: state.vx + 0.5 * dt * k1.dvx,
      vy: state.vy + 0.5 * dt * k1.dvy
    });
    const k3 = deriv({
      x: state.x + 0.5 * dt * k2.dx,
      y: state.y + 0.5 * dt * k2.dy,
      vx: state.vx + 0.5 * dt * k2.dvx,
      vy: state.vy + 0.5 * dt * k2.dvy
    });
    const k4 = deriv({
      x: state.x + dt * k3.dx,
      y: state.y + dt * k3.dy,
      vx: state.vx + dt * k3.dvx,
      vy: state.vy + dt * k3.dvy
    });

    const sixth = dt / 6;
    return {
      x: state.x + sixth * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx),
      y: state.y + sixth * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy),
      vx: state.vx + sixth * (k1.dvx + 2 * k2.dvx + 2 * k3.dvx + k4.dvx),
      vy: state.vy + sixth * (k1.dvy + 2 * k2.dvy + 2 * k3.dvy + k4.dvy)
    };
  }

  /**
   * Simulate a complete cannonball trajectory from Newton's Mountain at the North Pole (0, R⊕ + h)
   */
  function simulateShot(params = {}) {
    const altitudeKm = clamp(Number(params.altitudeKm ?? DEFAULT_MOUNTAIN_KM), 0, 5000);
    const speedKms = clamp(Number(params.speedKms ?? 7.5042), 0.1, 16.0);
    const angleDeg = clamp(Number(params.angleDeg ?? 0), -45, 75);
    const dragCoeff = clamp(Number(params.dragCoeff ?? 0), 0, 2.0);
    const mu = params.mu ?? MU;
    const radius = params.radius ?? EARTH_RADIUS;

    const r0 = radius + altitudeKm;
    const angleRad = angleDeg * DEG;

    // Launch at top of Earth: (0, r0), pointing clockwise (+x is horizontal, +y is radially outward)
    const initial = {
      x: 0,
      y: r0,
      vx: speedKms * Math.cos(angleRad),
      vy: speedKms * Math.sin(angleRad)
    };

    const initialElements = analyzeState(initial, { mu, radius });
    const stepFn = dragCoeff > 0 ? stepRK4 : stepVelocityVerlet;

    // Determine simulation horizon
    let maxTime = 14000;
    if (initialElements.totalEnergy < 0 && Number.isFinite(initialElements.period)) {
      maxTime = Math.min(86400, initialElements.period * (dragCoeff > 0 ? 2.5 : 1.02));
    } else {
      maxTime = 9500;
    }

    const baseDt = clamp(Math.min(8, maxTime / 900), 1.5, 10);
    const points = [{ t: 0, ...initial }];

    let curr = { ...initial };
    let t = 0;
    let impacted = false;
    let escaped = false;
    let maxR = r0;
    let minR = r0;
    let apogeePoint = { t: 0, ...initial, r: r0 };
    let perigeePoint = { t: 0, ...initial, r: r0 };

    const maxSteps = 4500;
    for (let step = 0; step < maxSteps && t < maxTime; step++) {
      const rCurr = Math.hypot(curr.x, curr.y);
      // Adaptive step near planet
      const dt = Math.min(baseDt * clamp(Math.pow(rCurr / r0, 1.2), 0.4, 2.5), maxTime - t);
      if (dt <= 1e-6) break;

      const next = stepFn(curr, dt, { mu, radius, dragCoeff });
      const rNext = Math.hypot(next.x, next.y);

      // Check impact with Earth's surface (r <= radius)
      // Allow immediate impact if launched at h=0 with downward angle, or after moving past launch if h=0
      if (rNext <= radius && (step > 0 || initial.vy < 0 || altitudeKm > 0)) {
        // Refine exact surface impact using bisection
        let lo = 0;
        let hi = dt;
        let hitState = next;
        for (let iter = 0; iter < 18; iter++) {
          const mid = 0.5 * (lo + hi);
          const midState = stepFn(curr, mid, { mu, radius, dragCoeff });
          const rMid = Math.hypot(midState.x, midState.y);
          if (rMid <= radius) {
            hi = mid;
            hitState = midState;
          } else {
            lo = mid;
          }
        }
        t += hi;
        // Project strictly onto radius for clean visual rendering
        const rHit = Math.hypot(hitState.x, hitState.y) || radius;
        hitState.x = (hitState.x / rHit) * radius;
        hitState.y = (hitState.y / rHit) * radius;
        curr = hitState;
        points.push({ t, ...curr });
        minR = radius;
        impacted = true;
        break;
      }

      t += dt;
      curr = next;
      points.push({ t, ...curr });

      if (rNext > maxR) {
        maxR = rNext;
        apogeePoint = { t, ...curr, r: rNext };
      }
      if (rNext < minR) {
        minR = rNext;
        perigeePoint = { t, ...curr, r: rNext };
      }

      // Stop if escaped far into deep space
      if (rNext > radius * 6.5 && initialElements.totalEnergy >= 0) {
        escaped = true;
        break;
      }
    }

    const finalElements = analyzeState(curr, { mu, radius });

    // Compute central angle swept clockwise from North Pole (0, r0)
    // Angle theta = atan2(x, y) in [0, 2π)
    const lastPt = points[points.length - 1];
    let centralAngleRad = Math.atan2(lastPt.x, lastPt.y);
    if (centralAngleRad < 0) centralAngleRad += TAU;
    if (!impacted && initialElements.totalEnergy < 0 && dragCoeff === 0) {
      centralAngleRad = TAU;
    }
    const groundArcKm = impacted ? centralAngleRad * radius : (initialElements.totalEnergy < 0 ? TAU * radius : Infinity);

    // Energy conservation drift check (for conservative case)
    const energyDriftRatio = Math.abs(finalElements.totalEnergy - initialElements.totalEnergy) /
      Math.max(1e-9, Math.abs(initialElements.totalEnergy));

    // Also compute flat-Earth uniform gravity parabolic approximation mapped onto local tangent coords
    // x_flat = v0 cos(alpha) t, y_flat = r0 + v0 sin(alpha) t - 0.5 * g_local * t^2
    const gLocal = mu / (r0 * r0);
    const flatEarthPoints = [];
    const flatMaxT = Math.min(t, 1600);
    const flatSteps = 90;
    for (let i = 0; i <= flatSteps; i++) {
      const tf = (flatMaxT * i) / flatSteps;
      const xf = initial.vx * tf;
      const yf = r0 + initial.vy * tf - 0.5 * gLocal * tf * tf;
      flatEarthPoints.push({ x: xf, y: yf, t: tf });
      if (Math.hypot(xf, yf) <= radius * 0.98) break;
    }

    return {
      params: { altitudeKm, speedKms, angleDeg, dragCoeff },
      initial,
      initialElements,
      finalElements,
      points,
      flatEarthPoints,
      impacted,
      escaped: escaped || initialElements.totalEnergy >= 0,
      flightTimeSec: t,
      centralAngleDeg: centralAngleRad * RAD,
      groundArcKm,
      maxAltitudeKm: maxR - radius,
      minAltitudeKm: minR - radius,
      apogeePoint,
      perigeePoint,
      energyDriftRatio
    };
  }

  /**
   * Compute the "8 km horizontal = 5 m Earth drop" curvature vs free-fall comparison data
   * for any initial horizontal launch speed v0 (km/s) over initial 1..120 seconds.
   */
  function computeCurvatureDrop(speedKms = 7.91, altitudeKm = 0) {
    const r0 = EARTH_RADIUS + altitudeKm;
    const gLocalM = (MU / (r0 * r0)) * 1000; // m/s²
    const vc = Math.sqrt(MU / r0);
    // Over 1 second of horizontal flight:
    const dist1sKm = speedKms;
    // Earth surface curvature drop over distance x = speedKms: delta_h = sqrt(r0^2 + x^2) - r0 ≈ x^2 / (2 r0)
    const earthDrop1sM = (Math.sqrt(r0 * r0 + dist1sKm * dist1sKm) - r0) * 1000;
    const gravityFall1sM = 0.5 * gLocalM * 1.0 * 1.0;

    return {
      r0,
      vc,
      gLocalM,
      dist1sKm,
      earthDrop1sM,
      gravityFall1sM,
      fallToCurveRatio: gravityFall1sM / Math.max(1e-9, earthDrop1sM)
    };
  }

  return {
    MU,
    EARTH_RADIUS,
    G0_M_S2,
    DEFAULT_MOUNTAIN_KM,
    REEL_SHOTS,
    clamp,
    criticalSpeeds,
    analyzeState,
    computeAcceleration,
    stepVelocityVerlet,
    stepRK4,
    simulateShot,
    computeCurvatureDrop
  };
});
