'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../apps/newton-cannon/cannon-physics.js');

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${a} ≈ ${b} (±${tol})`);

test('Critical speeds at surface (h = 0) and default mountain (h = 700 km)', () => {
  const s0 = C.criticalSpeeds(0);
  near(s0.vc, 7.909, 0.01, 'Surface circular speed ~7.91 km/s');
  near(s0.ve, 11.185, 0.01, 'Surface escape speed ~11.19 km/s');
  near(s0.ve / s0.vc, Math.SQRT2, 1e-9, 've = sqrt(2) * vc');

  const s700 = C.criticalSpeeds(700);
  near(s700.vc, 7.504, 0.01, '700 km circular speed ~7.50 km/s');
  near(s700.ve, 10.613, 0.01, '700 km escape speed ~10.61 km/s');
  assert.ok(s700.vGraze < s700.vc, 'Antipodal grazing speed is slightly below circular speed');
});

test('The 5 Facebook Reel shots match physical regimes and expected outcomes', () => {
  assert.equal(C.REEL_SHOTS.length, 5);

  // Shot 1: 4.5 km/s -> Short suborbital impact
  const r1 = C.simulateShot(C.REEL_SHOTS[0]);
  assert.equal(r1.initialElements.kind, 'suborbital');
  assert.equal(r1.initialElements.focusRole, 'far_focus');
  assert.equal(r1.impacted, true);
  assert.ok(r1.centralAngleDeg > 15 && r1.centralAngleDeg < 45, `Shot 1 central angle: ${r1.centralAngleDeg}°`);

  // Shot 2: 6.4 km/s -> Long suborbital impact
  const r2 = C.simulateShot(C.REEL_SHOTS[1]);
  assert.equal(r2.initialElements.kind, 'suborbital');
  assert.equal(r2.impacted, true);
  assert.ok(r2.centralAngleDeg > r1.centralAngleDeg + 30, `Shot 2 travels much further than Shot 1: ${r2.centralAngleDeg}°`);

  // Shot 3: v = vc (~7.504 km/s) -> Circular orbit, never impacts
  const r3 = C.simulateShot(C.REEL_SHOTS[2]);
  assert.equal(r3.initialElements.kind, 'circle');
  assert.equal(r3.impacted, false);
  assert.equal(r3.escaped, false);
  near(r3.initialElements.e, 0, 1e-4, 'Circular orbit eccentricity ≈ 0');
  near(r3.maxAltitudeKm, 700, 2.0, 'Circular altitude stays at ~700 km');
  near(r3.minAltitudeKm, 700, 2.0, 'Circular altitude stays at ~700 km');

  // Shot 4: 8.18 km/s -> Bound elliptical orbit (vc < v < ve), apogee at 6 o'clock
  const r4 = C.simulateShot(C.REEL_SHOTS[3]);
  assert.equal(r4.initialElements.kind, 'ellipse');
  assert.equal(r4.initialElements.focusRole, 'near_focus');
  assert.equal(r4.impacted, false);
  assert.equal(r4.escaped, false);
  assert.ok(r4.maxAltitudeKm > 3200 && r4.maxAltitudeKm < 5000, `Elliptical apogee altitude: ${r4.maxAltitudeKm} km`);

  // Shot 5: 10.8 km/s -> Escape trajectory (v >= ve)
  const r5 = C.simulateShot(C.REEL_SHOTS[4]);
  assert.equal(r5.initialElements.kind, 'hyperbola');
  assert.equal(r5.impacted, false);
  assert.equal(r5.escaped, true);
  assert.ok(r5.initialElements.totalEnergy > 0, 'Escape total specific energy > 0');
});

test('Symplectic Velocity Verlet conserves mechanical energy and angular momentum', () => {
  const sim = C.simulateShot({ altitudeKm: 700, speedKms: 8.8, angleDeg: 0, dragCoeff: 0 });
  assert.ok(sim.energyDriftRatio < 1e-5, `Symplectic energy drift ratio ${sim.energyDriftRatio} < 1e-5`);
  const h0 = sim.initialElements.hMag;
  const h1 = sim.finalElements.hMag;
  near(h0, h1, 1e-6, 'Angular momentum strictly conserved in central force field');
});

test('Newton curvature rule: ~7.91 km/s horizontal speed drops ~4.91 m in 1s matching Earth curvature', () => {
  const c = C.computeCurvatureDrop(7.909, 0);
  near(c.earthDrop1sM, 4.91, 0.05, 'Earth drops ~4.91 m over 7.91 km');
  near(c.gravityFall1sM, 4.91, 0.05, 'Gravity falls ~4.91 m in 1 second');
  near(c.fallToCurveRatio, 1.0, 0.01, 'At v = vc, gravity drop matches Earth curvature drop 1:1');
});

test('Atmospheric drag causes orbital decay and energy loss', () => {
  const noDrag = C.simulateShot({ altitudeKm: 350, speedKms: 7.70, angleDeg: 0, dragCoeff: 0 });
  const withDrag = C.simulateShot({ altitudeKm: 350, speedKms: 7.70, angleDeg: 0, dragCoeff: 0.8 });
  assert.equal(noDrag.impacted, false);
  assert.ok(withDrag.finalElements.totalEnergy < noDrag.finalElements.totalEnergy, 'Drag dissipates mechanical energy');
});
