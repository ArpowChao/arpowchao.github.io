const test = require('node:test');
const assert = require('node:assert/strict');
const physics = require('../apps/charged-spheres/physics.js');

function close(actual, expected, relative = 1e-10, absolute = 1e-24) {
  assert.ok(Math.abs(actual - expected) <= Math.max(absolute, relative * Math.abs(expected)),
    'expected ' + actual + ' to agree with ' + expected);
}

function solve(s = 2.05, q1 = 1e-9, q2 = 1e-9, radius = 0.03) {
  return physics.solve({ radius, separation: s * radius, q1, q2 });
}

test('browser global and CommonJS expose the same API', () => {
  assert.equal(globalThis.ChargedSpheresPhysics, physics);
  for (const name of ['solve', 'fieldAt', 'sampleForce', 'sliceAt', 'integrateForce', 'directSumForce', 'axisPairs']) {
    assert.equal(typeof physics[name], 'function');
  }
});

test('every nonoverlapping separation gives the exact center-distance force', () => {
  for (const s of [2.0001, 2.05, 2.5, 3, 12, 100]) {
    for (const [q1, q2] of [[1e-9, 2e-9], [1e-9, -2e-9], [0, 2e-9], [0, 0]]) {
      const result = solve(s, q1, q2);
      assert.equal(result.force, physics.K * q1 * q2 / result.separation ** 2);
      assert.equal(result.force, result.coulombForce);
      assert.equal(result.ratio, q1 * q2 === 0 ? null : 1);
      close(result.interactionEnergy, physics.K * q1 * q2 / result.separation);
      close(result.volumeDensities[0], 3 * q1 / (4 * Math.PI * result.radiusA ** 3));
    }
  }
});

test('unequal radii change density and internal field without changing external interaction force', () => {
  const result = physics.solve({ radiusA: 0.015, radiusB: 0.03, separation: 0.05, q1: 2e-9, q2: -1e-9 });
  const equal = physics.solve({ radius: 0.015, separation: 0.05, q1: 2e-9, q2: -1e-9 });
  assert.equal(result.force, equal.force);
  assert.deepEqual(result.radii, [0.015, 0.03]);
  close(result.volumeDensities[0], -16 * result.volumeDensities[1]);
  const numerical = physics.integrateForce(result, 24);
  close(numerical.force, result.force, 1e-9);
});

test('inside a uniformly charged solid sphere its own field is linear and center potential is finite', () => {
  const result = solve(3, 1e-9, 0);
  for (const [dx, y] of [[0, 0], [0.005, 0], [0, 0.01], [-0.012, 0.01]]) {
    const field = physics.fieldAt(result, result.centers[0] + dx, y);
    close(field.ex, physics.K * result.q1 * dx / result.radiusA ** 3, 1e-10, 1e-10);
    close(field.ey, physics.K * result.q1 * y / result.radiusA ** 3);
    close(field.potential, physics.K * result.q1 * (3 * result.radiusA ** 2 - dx ** 2 - y ** 2) / (2 * result.radiusA ** 3));
    assert.equal(field.inside, true);
    assert.equal(field.sphere, 0);
  }
  const center = physics.fieldAt(result, result.centers[0], 0);
  assert.equal(center.ex, 0);
  assert.equal(center.ey, 0);
  close(center.potential, 3 * physics.K * result.q1 / (2 * result.radiusA));
});

test('outside a sphere the field and potential are exactly those of its center charge', () => {
  const result = solve(4, 2e-9, 0);
  for (const [dx, y] of [[0.04, 0], [0.04, 0.04], [-0.1, 0.08]]) {
    const r = Math.hypot(dx, y);
    const field = physics.fieldAt(result, result.centers[0] + dx, y);
    close(field.ex, physics.K * result.q1 * dx / r ** 3);
    close(field.ey, physics.K * result.q1 * y / r ** 3);
    close(field.potential, physics.K * result.q1 / r);
  }
});

test('field and potential are continuous across each sphere surface', () => {
  const result = solve(2.05, 2e-9, -1e-9);
  for (let sphere = 0; sphere < 2; sphere += 1) {
    for (const theta of [0, 0.5, 1.4, Math.PI]) {
      const point = factor => physics.fieldAt(result,
        result.centers[sphere] + factor * result.radii[sphere] * Math.cos(theta),
        factor * result.radii[sphere] * Math.sin(theta));
      const inner = point(1 - 1e-8);
      const outer = point(1 + 1e-8);
      close(inner.ex, outer.ex, 2e-6, 2e-3);
      close(inner.ey, outer.ey, 2e-6, 2e-3);
      close(inner.potential, outer.potential, 2e-6, 1e-4);
    }
  }
});

test('the field gradient agrees with the potential gradient inside and outside', () => {
  const result = solve(2.05, 2e-9, -1e-9);
  const h = 1e-6;
  for (const [x, y] of [[result.centers[0] + 0.005, 0.006], [0, 0.04], [result.centers[1] - 0.004, 0.012]]) {
    const field = physics.fieldAt(result, x, y);
    const ex = -(physics.fieldAt(result, x + h, y).potential - physics.fieldAt(result, x - h, y).potential) / (2 * h);
    const ey = -(physics.fieldAt(result, x, y + h).potential - physics.fieldAt(result, x, y - h).potential) / (2 * h);
    close(field.ex, ex, 2e-8);
    close(field.ey, ey, 2e-8);
  }
});

test('Gauss-Legendre volume integration agrees with exact force at the smallest UI gap', () => {
  for (const [q1, q2] of [[1e-9, 1e-9], [1e-9, -2e-9], [10e-9, 1e-9]]) {
    const result = solve(2.05, q1, q2);
    const numerical = physics.integrateForce(result, 12);
    close(numerical.force, result.force, 3e-11);
    close(numerical.integratedCharge, q2, 1e-13);
    assert.equal(numerical.samples, 288);
    assert.equal(numerical.slices.length, 24);
    assert.ok(numerical.relativeError < 3e-11);
    close(numerical.slices.reduce((sum, slice) => sum + slice.charge, 0), q2, 1e-13);
    close(numerical.slices.reduce((sum, slice) => sum + slice.force, 0), numerical.force, 1e-13);
  }
});

test('increasing quadrature order converges and works arbitrarily close to non-contact', () => {
  const result = solve(2.0001);
  const errors = [4, 8, 12, 16].map(order => physics.integrateForce(result, order).relativeError);
  for (let i = 1; i < errors.length; i += 1) assert.ok(errors[i] < errors[i - 1]);
  assert.ok(errors[3] < 1e-13);
  for (const s of [2.05, 3, 12, 100]) {
    const numerical = physics.integrateForce(solve(s), 16);
    assert.ok(numerical.relativeError < 1e-13);
  }
});

test('near-side volume elements feel stronger force but integration gives exactly the center-charge total', () => {
  const result = solve(2.05);
  const near = physics.sampleForce(result, result.centers[1] - result.radiusB * 0.9, 0);
  const far = physics.sampleForce(result, result.centers[1] + result.radiusB * 0.9, 0);
  assert.ok(near.forceDensityX > far.forceDensityX);
  assert.equal(near.rho, far.rho);
  assert.equal(near.rho, result.volumeDensities[1]);
  const numerical = physics.integrateForce(result, 16);
  assert.ok(numerical.nearForce > numerical.farForce);
  close(numerical.nearForce + numerical.farForce, result.force, 1e-13);
  close(numerical.nearForce / result.force, 0.67009665394781, 1e-12);
  const outside = physics.sampleForce(result, result.centers[1] + 2 * result.radiusB, 0);
  assert.equal(outside.insideB, false);
  assert.equal(outside.rho, 0);
  assert.equal(outside.forceDensityX, 0);
});

test('slice charge follows circular area and local force excludes sphere B self-field', () => {
  const result = solve(2.05);
  for (const u of [-1, -0.5, 0, 0.5, 1]) {
    const slice = physics.sliceAt(result, u, 16);
    close(slice.chargePerU, 3 * result.q2 / 4 * (1 - u * u));
    close(slice.forcePerU, slice.chargePerU * slice.fieldX);
    close(slice.discRadius, result.radiusB * Math.sqrt(1 - u * u));
  }
  const x = result.centers[1] - result.radiusB * 0.5;
  const local = physics.sampleForce(result, x, 0);
  close(local.ex, physics.K * result.q1 / (x - result.centers[0]) ** 2);
  assert.notEqual(local.ex, physics.fieldAt(result, x, 0).ex);
});

test('force agrees with the fixed-charge interaction energy derivative', () => {
  const original = solve(2.05, 1e-9, -2e-9);
  const h = 1e-5;
  const energy = delta => physics.solve({
    radius: original.radius, separation: original.separation + delta,
    q1: original.q1, q2: original.q2
  }).interactionEnergy;
  const derivativeForce = -(energy(-2 * h) - 8 * energy(-h) + 8 * energy(h) - energy(2 * h)) / (12 * h);
  close(derivativeForce, original.force, 1e-10);
});

test('sign, exchange, and geometric scaling symmetries hold', () => {
  const original = solve(2.05, 2e-9, 1e-9);
  close(solve(2.05, -2e-9, -1e-9).force, original.force);
  close(solve(2.05, 1e-9, 2e-9).force, original.force);
  close(solve(2.05, 2e-9, -1e-9).force, -original.force);
  close(solve(2.05, 2e-9, 1e-9, 0.06).force, original.force / 4);
  close(solve(2.05, 2e-9, 1e-9, 0.06).interactionEnergy, original.interactionEnergy / 2);
});

test('uncharged spheres give zero interaction and finite field, with no undefined ratio', () => {
  for (const [q1, q2] of [[0, 1e-9], [-1e-9, 0], [0, 0]]) {
    const result = solve(2.05, q1, q2);
    assert.equal(result.force, 0);
    assert.equal(result.ratio, null);
    const numerical = physics.integrateForce(result);
    assert.equal(numerical.force, 0);
    assert.equal(numerical.relativeError, null);
    assert.equal(numerical.absoluteError, 0);
    for (const x of result.centers) {
      const field = physics.fieldAt(result, x, 0);
      assert.ok(Number.isFinite(field.ex));
      assert.ok(Number.isFinite(field.potential));
    }
  }
});

test('invalid geometry, inputs, slices, and quadrature orders are rejected', () => {
  assert.throws(() => physics.solve({ radius: 1, separation: 2, q1: 1, q2: 1 }), /touch or overlap/);
  assert.throws(() => physics.solve({ radiusA: 1, radiusB: 2, separation: 2.5, q1: 1, q2: 1 }), /touch or overlap/);
  assert.throws(() => physics.solve({ radius: 0, separation: 2, q1: 1, q2: 1 }), /positive/);
  assert.throws(() => physics.solve({ radius: 1, separation: 3, q1: NaN, q2: 1 }), /finite/);
  assert.throws(() => physics.solve({ radius: 1, separation: 3, q1: 1, q2: 1, model: 'unknown' }), /uniform/);
  assert.throws(() => physics.integrateForce(solve(), 1), /order/);
  assert.throws(() => physics.integrateForce(solve(), 100), /order/);
  assert.throws(() => physics.sliceAt(solve(), 1.1), /between/);
  assert.throws(() => physics.fieldAt(solve(), Infinity, 0), /finite/);
});

test('direct summation discretizes both volumes and preserves each total charge', () => {
  const result = solve(2.05, 2e-9, -1e-9);
  const direct = physics.directSumForce(result, 7);
  assert.equal(direct.pointsPerSphere, 179);
  assert.equal(direct.pointCount, 358);
  assert.equal(direct.pairs, 32041);
  assert.deepEqual(direct.pointCounts, [179, 179]);
  assert.equal(direct.slices.length, 7);
  close(direct.slices.reduce((sum, slice) => sum + slice.force, 0), direct.force, 1e-13);
  close(direct.slices.reduce((sum, slice) => sum + slice.charge, 0), result.q2, 1e-13);
  assert.equal(direct.slices.reduce((sum, slice) => sum + slice.pointCount, 0), 179);
  assert.ok(direct.slices[0].u < 0 && direct.slices.at(-1).u > 0);
  for (let sphere = 0; sphere < 2; sphere += 1) {
    const points = sphere === 0 ? direct.pointsA : direct.pointsB;
    const q = sphere === 0 ? result.q1 : result.q2;
    close(points.reduce((sum, point) => sum + point.q, 0), q, 1e-13);
    for (const point of points) {
      assert.equal(point.q, q / points.length);
      assert.ok(Math.hypot(point.x - result.centers[sphere], point.y, point.z) <= result.radii[sphere] * (1 + 1e-12));
    }
  }
});

test('direct summation matches an independent literal three-dimensional pair sum', () => {
  const direct = physics.directSumForce(solve(2.05, 2e-9, -1e-9), 3);
  let force = 0;
  let forceY = 0;
  let forceZ = 0;
  for (const a of direct.pointsA) {
    for (const b of direct.pointsB) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const distance = Math.hypot(dx, dy, dz);
      const strength = physics.K * a.q * b.q / distance ** 2;
      force += strength * dx / distance;
      forceY += strength * dy / distance;
      forceZ += strength * dz / distance;
    }
  }
  close(direct.force, force, 1e-13);
  close(direct.forceY, forceY, 0, 1e-20);
  close(direct.forceZ, forceZ, 0, 1e-20);
  assert.equal(direct.force, direct.numericalForce);
});

test('finite-grid force errors can be above or below the continuous sphere result', () => {
  const result = solve(2.05);
  const coarse = physics.directSumForce(result, 3);
  const medium = physics.directSumForce(result, 7);
  const fine = physics.directSumForce(result, 15);
  assert.ok(coarse.magnitudeRelativeError < 0);
  assert.ok(medium.magnitudeRelativeError > 0);
  assert.ok(fine.relativeError < coarse.relativeError);
  assert.ok(fine.relativeError < medium.relativeError);
  assert.ok(fine.relativeError < 0.0011);
  // Clipping a curved sphere by finite cubes changes the boundary irregularly.
  // The discretization error is not required to decrease at every odd size.
  assert.ok(physics.directSumForce(result, 5).relativeError < medium.relativeError);
  assert.ok(physics.integrateForce(result, 16).relativeError < 1e-13);
  const distant = physics.directSumForce(solve(12), 15);
  assert.ok(distant.relativeError < 1e-6);
});

test('direct force is axial and its near and far contributions sum to the same pair force', () => {
  for (const [q1, q2] of [[1e-9, 1e-9], [1e-9, -2e-9]]) {
    const direct = physics.directSumForce(solve(2.05, q1, q2), 7);
    assert.ok(Math.abs(direct.forceY) < Math.abs(direct.force) * 1e-14);
    assert.ok(Math.abs(direct.forceZ) < Math.abs(direct.force) * 1e-14);
    close(direct.nearForce + direct.farForce, direct.force, 1e-13);
    assert.ok(Math.abs(direct.nearForce) > Math.abs(direct.farForce));
    close(direct.signedRelativeError, (direct.force - direct.exactForce) / Math.abs(direct.exactForce));
    close(direct.magnitudeRelativeError, (Math.abs(direct.force) - Math.abs(direct.exactForce)) / Math.abs(direct.exactForce));
    close(direct.relativeError, Math.abs(direct.signedRelativeError));
  }
});

test('the discrete pair force agrees with its own interaction-energy gradient', () => {
  const solution = solve(2.05, 1e-9, -2e-9);
  const direct = physics.directSumForce(solution, 3);
  const h = 1e-5;
  const energy = delta => {
    let value = 0;
    for (const a of direct.pointsA) {
      for (const b of direct.pointsB) {
        value += physics.K * a.q * b.q / Math.hypot(b.x - a.x + delta, b.y - a.y, b.z - a.z);
      }
    }
    return value;
  };
  const numericalForce = -(energy(-2 * h) - 8 * energy(-h) + 8 * energy(h) - energy(2 * h)) / (12 * h);
  close(direct.force, numericalForce, 1e-9);
});

test('direct summation handles zero charges and rejects invalid voxel grids', () => {
  const direct = physics.directSumForce(solve(2.05, -1e-9, 0), 7);
  assert.equal(direct.force, 0);
  assert.equal(direct.forceY, 0);
  assert.equal(direct.forceZ, 0);
  assert.equal(direct.relativeError, null);
  assert.equal(direct.signedRelativeError, null);
  assert.equal(direct.magnitudeRelativeError, null);
  for (const gridSize of [2, 4, 17, 3.5, NaN]) {
    assert.throws(() => physics.directSumForce(solve(), gridSize), /odd integer/);
  }
});

test('horizontal pairs use real axial voxel centers and endpoint distances for unequal spheres', () => {
  const solution = physics.solve({ radiusA: 0.02, radiusB: 0.03, separation: 0.06, q1: 2e-9, q2: -3e-9 });
  for (const m of [3, 5, 7, 9, 11, 13, 15]) {
    const pairs = physics.axisPairs(solution, m);
    const endpointSum = (solution.radiusA + solution.radiusB) * (1 - 1 / m);
    close(pairs.near.distance, solution.separation - endpointSum);
    close(pairs.far.distance, solution.separation + endpointSum);
    assert.equal(pairs.comparisonAxis, 'x');
    assert.deepEqual(pairs.axisPointCounts, [m, m]);
    for (const pair of [pairs.near, pairs.far]) {
      for (let sphere = 0; sphere < 2; sphere += 1) {
        const point = pair.points[sphere];
        assert.equal(point.y, 0);
        assert.equal(point.z, 0);
        assert.equal(point.q, (sphere === 0 ? solution.q1 : solution.q2) / pairs.pointCounts[sphere]);
        assert.ok(Math.abs(point.x - solution.centers[sphere]) < solution.radii[sphere]);
      }
      const expected = physics.K * pair.points[0].q * pair.points[1].q / pair.distance ** 2;
      close(pair.signedForce, expected);
      assert.ok(pair.signedForce < 0);
      assert.equal(pair.force, -pair.signedForce);
      assert.deepEqual(pair.forceVector, { x: pair.signedForce, y: 0, z: 0 });
    }
    close(pairs.forceRatio, pairs.near.force / pairs.far.force);
  }
});

test('horizontal nearest and farthest forces approach each other at a 2000-radius gap', () => {
  const closePairs = physics.axisPairs(solve(2.05, 5e-9, 5e-9), 7);
  const farPairs = physics.axisPairs(solve(2002, 5e-9, 5e-9), 7);
  assert.equal(farPairs.pointsPerSphere, 179);
  close(farPairs.near.distance, 60.00857142857143);
  close(farPairs.far.distance, 60.11142857142857);
  close(farPairs.forceRatio, ((2002 + 12 / 7) / (2002 - 12 / 7)) ** 2);
  assert.ok(farPairs.forceRatio < 1.004);
  assert.ok(farPairs.forceRatio < closePairs.forceRatio);
  const uncharged = physics.axisPairs(solve(2002, 0, 5e-9), 7);
  assert.equal(uncharged.forceRatio, null);
  assert.equal(uncharged.near.force, 0);
  assert.equal(uncharged.far.force, 0);
  for (const gridSize of [2, 4, 17, 3.5, NaN]) {
    assert.throws(() => physics.axisPairs(solve(), gridSize), /odd integer/);
  }
});
