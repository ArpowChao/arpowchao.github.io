'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../apps/pitch-spin/pitch.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} != ${b} ±${tol}`);

test('lift coefficient follows Sawicki et al. (2003)', () => {
  assert.equal(P.liftCoefficient(0), 0);
  near(P.liftCoefficient(0.2), 1 / (2.32 + 2), 1e-12);
  assert.ok(P.liftCoefficient(0.4) > P.liftCoefficient(0.2));
});

test('a ball without spin follows the spin-free path; the aim hits the target', () => {
  const r = P.simulate({ speedKmh: 140, rpm: 0 });
  near(r.releaseMovementCm.x, 0, 1e-6); near(r.releaseMovementCm.z, 0, 1e-6);
  near(r.plate[0], 0, 1e-3); near(r.plate[2], 0.76, 1e-3);
  const r2 = P.simulate(P.PRESETS.curveball);
  near(r2.plate[0], 0, 1e-3, 'spinning pitch is aimed at the zone centre'); near(r2.plate[2], 0.76, 1e-3);
});

test('drag slows a fastball by a realistic ~8 %, flight time ~0.4 s', () => {
  const r = P.simulate({ speedKmh: 150, rpm: 0 });
  const ratio = r.plateSpeedKmh / 150;
  assert.ok(ratio > 0.88 && ratio < 0.94, `speed ratio ${ratio}`);
  assert.ok(r.flightTime > 0.38 && r.flightTime < 0.44);
});

test('clock tilt sets the Magnus direction (catcher view, x = 1B side)', () => {
  const up = P.simulate({ rpm: 2400, tilt: 12, efficiency: 1 }).releaseMovementCm;
  assert.ok(up.z > 30 && Math.abs(up.x) < 1.5, `12:00 backspin rises ${JSON.stringify(up)}`);
  const down = P.simulate({ rpm: 2400, tilt: 6, efficiency: 1 }).releaseMovementCm;
  assert.ok(down.z < -30, '6:00 topspin drops');
  const three = P.simulate({ rpm: 2400, tilt: 3, efficiency: 1 }).releaseMovementCm;
  assert.ok(three.x < -30 && Math.abs(three.z) < 3, '3:00 runs toward the pitcher\'s right = 3B side = catcher\'s left');
  const r = P.simulate({ rpm: 2400, tilt: 12, efficiency: 1 });
  const v = P.vec.unit(r.v0), w = P.vec.unit(r.omega);
  near(P.vec.dot(v, w), 0, 1e-9, 'full efficiency: spin axis ⟂ velocity');
});

test('gyro spin produces no Magnus force at release; efficiency scales the active spin', () => {
  const gyro = P.simulate({ rpm: 2500, tilt: 9, efficiency: 0 });
  near(gyro.magnusN, 0, 1e-9);
  // The axis stays fixed in space while gravity bends the path, so a little active spin appears late.
  const m = gyro.releaseMovementCm;
  assert.ok(Math.hypot(m.x, m.z) < 6, `pure gyro moves only slightly: ${JSON.stringify(m)}`);
  const full = P.simulate({ rpm: 2500, tilt: 9, efficiency: 1 }).releaseMovementCm;
  assert.ok(Math.hypot(full.x, full.z) > 8 * Math.hypot(m.x, m.z));
  const half = P.simulate({ rpm: 2500, tilt: 9, efficiency: 0.5 });
  near(half.activeSpinRpm, 1250, 1e-9);
  const v = P.vec.unit(half.v0), w = P.vec.unit(half.omega);
  near(Math.abs(P.vec.dot(v, w)), Math.sqrt(0.75), 1e-9, 'axis tilts toward the flight direction');
});

test('left-handed pitches mirror right-handed ones', () => {
  const R = P.simulate({ hand: 'R', rpm: 2300, tilt: 1, efficiency: 0.9 });
  const L = P.simulate({ hand: 'L', rpm: 2300, tilt: 11, efficiency: 0.9 });
  near(L.releaseMovementCm.x, -R.releaseMovementCm.x, 0.05);
  near(L.releaseMovementCm.z, R.releaseMovementCm.z, 0.05);
  assert.ok(R.config.release.x < 0 && L.config.release.x > 0);
});

test('presets land near approximate MLB average movement', () => {
  for (const [key, p] of Object.entries(P.PRESETS)) {
    const m = P.simulate(p).releaseMovementCm;
    const err = Math.hypot(m.x - p.observed[0], m.z - p.observed[1]);
    assert.ok(err < 10, `${key}: model (${m.x.toFixed(0)}, ${m.z.toFixed(0)}) vs (${p.observed})`);
  }
});
