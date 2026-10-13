/* Pitch spin & flight model (shared by the 3D page, tests and the notebook description).
 * Coordinates (catcher's view, metres): x → catcher's right (1B side), y → from home plate toward the mound, z ↑.
 * Forces: gravity, quadratic drag (C_D), Magnus lift from the spin component perpendicular to the velocity:
 *   C_L = 1 / (2.32 + 0.4 / S),  S = r·|ω⊥| / v    (Sawicki, Hubbard & Stronge, Am. J. Phys. 71, 1152, 2003)
 * The spin vector is fixed in space during the ~0.4 s flight (spin decay and seam-shifted wake are not modelled).
 * Spin direction uses the Statcast/Savant "tilt": the clock-face direction of spin-induced movement seen from
 * behind the pitcher (12:00 = straight up / pure backspin, 3:00 = toward the pitcher's right = 3B side).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PitchPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BALL = { mass: 0.145, radius: 0.0366 };
  const AREA = Math.PI * BALL.radius ** 2;
  const G = 9.80665;
  const FT = 0.3048;
  const PLATE_Y = 17 / 12 * FT;   // front of home plate, where Statcast measures the crossing (0.43 m)
  const STATCAST_Y = 40 * FT;     // break is measured from 40 ft in front of the plate (12.19 m)
  const DEG = Math.PI / 180;

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const n = norm(a); return n > 0 ? mul(a, 1 / n) : [0, 0, 0]; };

  function liftCoefficient(S) { return S > 1e-9 ? 1 / (2.32 + 0.4 / S) : 0; }

  // Typical right-handed MLB pitches. `observed` = approximate league-average induced movement in cm
  // (catcher's view: +x = catcher's right, +z = up). The active-spin fractions are set a little low because
  // this lift model tends to over-predict the break of slower, high-spin pitches; seam-shifted wakes and other
  // effects not modelled here also make real pitches differ from the spin-based prediction.
  const PRESETS = {
    fourSeam: { name: '四縫線速球', speedKmh: 152, rpm: 2300, tilt: 1.0, efficiency: 0.8, seams: 'four', observed: [-20, 41] },
    sinker: { name: '伸卡球（二縫線）', speedKmh: 150, rpm: 2150, tilt: 2.0, efficiency: 0.7, seams: 'two', observed: [-38, 20] },
    cutter: { name: '卡特球', speedKmh: 143, rpm: 2400, tilt: 11.75, efficiency: 0.25, seams: 'four', observed: [6, 20] },
    slider: { name: '滑球', speedKmh: 138, rpm: 2450, tilt: 9.5, efficiency: 0.15, seams: 'two', observed: [13, 3] },
    sweeper: { name: '橫掃球', speedKmh: 132, rpm: 2600, tilt: 9.0, efficiency: 0.4, seams: 'two', observed: [38, 3] },
    curveball: { name: '曲球', speedKmh: 128, rpm: 2550, tilt: 7.25, efficiency: 0.36, seams: 'four', observed: [23, -25] },
    changeup: { name: '變速球', speedKmh: 138, rpm: 1750, tilt: 2.25, efficiency: 0.68, seams: 'two', observed: [-36, 15] },
    splitter: { name: '指叉球', speedKmh: 139, rpm: 1350, tilt: 2.5, efficiency: 0.52, seams: 'two', observed: [-25, 8] }
  };

  function normalize(raw) {
    raw = raw || {};
    const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const hand = raw.hand === 'L' ? 'L' : 'R';
    return {
      hand,
      speedKmh: num(raw.speedKmh, 60, 170, 150),
      rpm: num(raw.rpm, 0, 3500, 2300),
      tilt: ((num(raw.tilt, -1e6, 1e6, 1) % 12) + 12) % 12, // clock hours, pitcher's view
      efficiency: num(raw.efficiency, 0, 1, 0.92),
      // Angular velocity is a pseudovector: the mirror image of a right-hander's gyro spin turns the other way.
      gyroSign: raw.gyroSign === -1 || raw.gyroSign === 1 ? raw.gyroSign : (hand === 'L' ? -1 : 1),
      rho: num(raw.rho, 0.9, 1.3, 1.2),
      cd: num(raw.cd, 0.2, 0.5, 0.33),
      release: raw.release || { x: (hand === 'R' ? -1 : 1) * 0.55, y: 16.7, z: 1.78 },
      target: raw.target || { x: 0, z: 0.76 }
    };
  }

  // Unit direction of spin-induced movement for a clock tilt, in catcher's coordinates.
  function movementDirection(tilt) {
    const th = tilt * 30 * DEG;
    return [-Math.sin(th), 0, Math.cos(th)]; // pitcher's right (3B side) is −x
  }

  // Spin vector (rad/s). Transverse part makes the tilt-direction Magnus force; the rest is gyro (bullet) spin.
  function spinVector(cfg, vhat) {
    const w = cfg.rpm * 2 * Math.PI / 60;
    let m = movementDirection(cfg.tilt);
    m = unit(sub(m, mul(vhat, dot(m, vhat))));
    const axisT = unit(cross(vhat, m)); // ω̂ × v̂ ∥ m  ⇔  ω̂ = v̂ × m̂
    const e = cfg.efficiency;
    return {
      omega: add(mul(axisT, w * e), mul(vhat, w * Math.sqrt(Math.max(0, 1 - e * e)) * cfg.gyroSign)),
      transverseAxis: axisT,
      rate: w
    };
  }

  function accel(v, omega, cfg, magnus) {
    const s = norm(v), k = 0.5 * cfg.rho * AREA / BALL.mass;
    let a = add([0, 0, -G], mul(v, -k * cfg.cd * s));
    if (magnus && s > 0) {
      const vh = mul(v, 1 / s);
      const wp = sub(omega, mul(vh, dot(omega, vh)));
      const wpn = norm(wp);
      if (wpn > 0) {
        const S = BALL.radius * wpn / s;
        const dir = unit(cross(wp, v));
        a = add(a, mul(dir, k * liftCoefficient(S) * s * s));
      }
    }
    return a;
  }

  // RK4 integration from a state until the ball reaches y = yStop.
  function fly(p0, v0, omega, cfg, magnus, yStop, dt) {
    dt = dt || 0.0005;
    let p = p0.slice(), v = v0.slice(), t = 0;
    const path = [{ t: 0, p: p.slice() }];
    for (let i = 0; i < 20000; i++) {
      const k1v = accel(v, omega, cfg, magnus), k1p = v;
      const v2 = add(v, mul(k1v, dt / 2)), k2v = accel(v2, omega, cfg, magnus), k2p = v2;
      const v3 = add(v, mul(k2v, dt / 2)), k3v = accel(v3, omega, cfg, magnus), k3p = v3;
      const v4 = add(v, mul(k3v, dt)), k4v = accel(v4, omega, cfg, magnus), k4p = v4;
      const pn = add(p, mul(add(add(k1p, mul(k2p, 2)), add(mul(k3p, 2), k4p)), dt / 6));
      const vn = add(v, mul(add(add(k1v, mul(k2v, 2)), add(mul(k3v, 2), k4v)), dt / 6));
      if (pn[1] <= yStop) {
        const f = (p[1] - yStop) / (p[1] - pn[1]); // linear interpolation to the plane
        const pe = add(p, mul(sub(pn, p), f)), ve = add(v, mul(sub(vn, v), f));
        t += dt * f;
        path.push({ t, p: pe });
        return { p: pe, v: ve, t, path };
      }
      p = pn; v = vn; t += dt;
      if (i % 4 === 3) path.push({ t, p: p.slice() });
    }
    throw new Error('ball never reached the plate');
  }

  // Release velocity aimed so the spinning ball crosses the plate at the target (the pitcher "hits his spot").
  // The spin axis is tied to the release direction, so it is recomputed on every iteration.
  function aim(cfg, withSpin) {
    const r = [cfg.release.x, cfg.release.y, cfg.release.z], speed = cfg.speedKmh / 3.6;
    let yaw = Math.atan2(cfg.target.x - r[0], r[1] - PLATE_Y), pitch = Math.atan2(cfg.target.z - r[2], r[1] - PLATE_Y);
    const vel = (yw, pt) => [speed * Math.cos(pt) * Math.sin(yw), -speed * Math.cos(pt) * Math.cos(yw), speed * Math.sin(pt)];
    for (let it = 0; it < 40; it++) {
      const v = vel(yaw, pitch), omega = withSpin === false ? [0, 0, 0] : spinVector(cfg, unit(v)).omega;
      const end = fly(r, v, omega, cfg, withSpin !== false, PLATE_Y, 0.001).p;
      const ex = cfg.target.x - end[0], ez = cfg.target.z - end[2];
      if (Math.abs(ex) < 1e-5 && Math.abs(ez) < 1e-5) break;
      const D = r[1] - PLATE_Y;
      yaw += ex / D; pitch += ez / D;
    }
    return vel(yaw, pitch);
  }

  function simulate(raw) {
    const cfg = normalize(raw);
    const r = [cfg.release.x, cfg.release.y, cfg.release.z];
    const v0 = aim(cfg), vhat = unit(v0);
    const spin = spinVector(cfg, vhat);
    const real = fly(r, v0, spin.omega, cfg, true, PLATE_Y);
    const ghost = fly(r, v0, spin.omega, cfg, false, PLATE_Y);
    // Statcast-style break: from the real state at 40 ft, compare with/without Magnus to the plate.
    const at40 = fly(r, v0, spin.omega, cfg, true, STATCAST_Y);
    const withSpin = fly(at40.p, at40.v, spin.omega, cfg, true, PLATE_Y);
    const noSpin = fly(at40.p, at40.v, spin.omega, cfg, false, PLATE_Y);
    const brk = sub(withSpin.p, noSpin.p);
    const s0 = norm(v0), wp = norm(sub(spin.omega, mul(vhat, dot(spin.omega, vhat))));
    const S = BALL.radius * wp / s0, CL = liftCoefficient(S);
    const magnusN = 0.5 * cfg.rho * AREA * CL * s0 * s0;
    // Total vertical drop measured the same way (gravity included), as "vertical approach".
    return {
      config: cfg,
      v0, omega: spin.omega, transverseAxis: spin.transverseAxis, spinRate: spin.rate,
      activeSpinRpm: cfg.rpm * cfg.efficiency,
      spinFactor: S, cl: CL, magnusN, magnusOverWeight: magnusN / (BALL.mass * G),
      flightTime: real.t,
      plate: real.p, ghostPlate: ghost.p,
      path: real.path, ghostPath: ghost.path,
      breakCm: { x: brk[0] * 100, z: brk[2] * 100 },
      releaseMovementCm: { x: (real.p[0] - ghost.p[0]) * 100, z: (real.p[2] - ghost.p[2]) * 100 },
      plateSpeedKmh: norm(real.v) * 3.6,
      dropFrom40Cm: (withSpin.p[2] - at40.p[2]) * 100,
      magnusDirection: unit(cross(sub(spin.omega, mul(vhat, dot(spin.omega, vhat))), v0))
    };
  }

  return {
    BALL, AREA, G, PLATE_Y, STATCAST_Y, PRESETS,
    liftCoefficient, normalize, movementDirection, spinVector, accel, fly, aim, simulate,
    vec: { add, sub, mul, dot, cross, norm, unit }
  };
});
