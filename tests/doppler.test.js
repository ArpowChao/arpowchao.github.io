'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../apps/doppler/physics.js');
const basic = { c: 1, f: 1, mach: 0 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
test('five seconds contains five expanded rings plus a newly emitted point', () => {
  const w = P.waves(basic, 5);
  assert.deepEqual(w.map(a => a.radius), [5, 4, 3, 2, 1, 0]);
  assert.deepEqual(w.map(a => a.emitted), [0, 1, 2, 3, 4, 5]);
  assert.ok(w.every(a => a.x === 0 && a.y === 0));
  assert.equal(P.waves(basic, 4.999).length, 5);
});
test('emission centres stay fixed while source and radii move', () => {
  for (const mach of [.25, .5, .75, -.5]) {
    const p = { ...basic, mach };
    const a = P.wave(p, 2, 5), b = P.wave(p, 2, 9);
    near(a.x, 2 * mach); near(a.x, b.x); near(b.radius - a.radius, 4);
    near(P.source(p, 5).x, 5 * mach);
    const w = P.waves(p, 5);
    for (let i = 1; i < w.length; i++) {
      near(w[i - 1].x + w[i - 1].radius - w[i].x - w[i].radius, 1 - mach);
      near(w[i].x - w[i].radius - w[i - 1].x + w[i - 1].radius, 1 + mach);
    }
  }
});
test('arrival counts include exact endpoints but respect propagation delay', () => {
  const o = { x: 5, y: 0 };
  assert.equal(P.received(basic, o, 4.999).count, 0);
  assert.equal(P.received(basic, o, 5).count, 1);
  assert.equal(P.received(basic, o, 10).count, 6);
  near(P.received(basic, o, 10).interval, 1);
});
test('longitudinal arrival intervals independently match classical Doppler ratios', () => {
  for (const mach of [.25, .5, .75, -.5]) {
    const p = { c: 2, f: 2, mach }, right = { x: 100, y: 0 }, left = { x: -100, y: 0 };
    near(P.arrival(p, 1, right) - P.arrival(p, 0, right), (1 - mach) / 2);
    near(P.arrival(p, 1, left) - P.arrival(p, 0, left), (1 + mach) / 2);
  }
});
test('off-axis and passed observers use actual distance, not a front/back shortcut', () => {
  const p = { ...basic, mach: .5 }, o = { x: 1, y: 3 };
  near(P.arrival(p, 2, o), 5);
  near(P.arrival(p, 4, o), 4 + Math.sqrt(10));
  const onAxis = { x: 1, y: 0 };
  near(P.arrival(p, 3, onAxis), 3.5);
  near(P.arrival(p, 4, onAxis) - P.arrival(p, 3, onAxis), 1.5);
});
test('frequency changes emission schedule and spatial scale consistently', () => {
  const p = { c: 1.5, f: 2, mach: .5 };
  assert.equal(P.waves(p, 5).length, 11);
  near(P.wave(p, 3, 5).emitted, 1.5); near(P.wave(p, 3, 5).radius, 5.25);
  assert.deepEqual(P.spacing(p), { still: .75, right: .375, left: 1.125 });
  near(P.distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.throws(() => P.waves({ ...basic, mach: 1 }, 5), RangeError);
  assert.throws(() => P.waves(basic, -1), RangeError);
});
test('student snapshot playback uses arranged centres and actual front/back hit intervals', () => {
  const pieces = Array.from({ length: 5 }, (_, n) => ({ n, x: n * .5, y: 0, radius: 5 - n, placed: true }));
  const original = JSON.stringify(pieces), a = { x: 5, y: 0 }, b = { x: -5, y: 0 };
  assert.deepEqual(P.snapshotArrivals(1, pieces, a).map(e => e.time), [0, .5, 1, 1.5, 2]);
  assert.deepEqual(P.snapshotArrivals(1, pieces, b).map(e => e.time), [0, 1.5, 3, 4.5, 6]);
  assert.equal(P.snapshotReceived(1, pieces, a, .499).count, 1);
  assert.equal(P.snapshotReceived(1, pieces, a, .5).count, 2);
  near(P.snapshotReceived(1, pieces, a, 2).interval, .5);
  near(P.snapshotReceived(1, pieces, b, 6).interval, 1.5);
  assert.equal(P.snapshotReceived(1, pieces, b, 6).count, 5);
  const evolved = P.snapshotWaves(2, pieces, .75);
  for (let i = 0; i < pieces.length; i++) { near(evolved[i].x, pieces[i].x); near(evolved[i].y, pieces[i].y); near(evolved[i].radius, pieces[i].radius + 1.5); }
  assert.equal(JSON.stringify(pieces), original);
});
test('snapshot hits skip passed waves, tray pieces and the source marker; arbitrary circles are sorted by contact time', () => {
  const pieces = [
    { n: 0, x: 0, y: 0, radius: 5, placed: true },
    { n: 1, x: 0, y: 0, radius: 3, placed: true },
    { n: 2, x: 3, y: 0, radius: 2, placed: true },
    { n: 3, x: 0, y: 0, radius: 4, placed: false },
    { n: 4, x: 0, y: 4, radius: 0, placed: true, marker: true }
  ];
  const o = { x: 0, y: 4 };
  assert.deepEqual(P.snapshotArrivals(1, pieces, o), [{ n: 1, time: 1 }, { n: 2, time: 3 }]);
  assert.equal(P.snapshotWaves(1, pieces, 2).length, 3);
  assert.equal(P.snapshotReceived(1, pieces, o, 20).count, 2);
  const simultaneous = [{ n: 5, x: 0, y: 0, radius: 4 }, { n: 1, x: 0, y: 0, radius: 4 }];
  assert.equal(P.snapshotReceived(1, simultaneous, o, 0).count, 2);
  assert.equal(P.snapshotReceived(1, simultaneous, o, 0).interval, 0);
  assert.throws(() => P.snapshotArrivals(0, pieces, o), RangeError);
  assert.throws(() => P.snapshotWaves(1, pieces, -1), RangeError);
});
