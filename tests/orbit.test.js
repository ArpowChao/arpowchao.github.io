'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../apps/orbit/physics.js');
const r = P.RADIUS * 3.4, vc = Math.sqrt(P.MU / r);
const initial = factor => ({ x: r, y: 0, vx: 0, vy: vc * factor });
const relative = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('circular propagation matches the independent analytic solution over many revolutions', () => {
  const s = initial(1), n = Math.sqrt(P.MU / r ** 3), period = 2 * Math.PI / n;
  for (const fraction of [.01, .25, .5, .9, 1, 41.375, 1000.75]) {
    const t = fraction * period, actual = P.propagate(s, t);
    relative(actual.x, r * Math.cos(n * t), 1e-8);
    relative(actual.y, r * Math.sin(n * t), 1e-8);
    relative(Math.hypot(actual.x, actual.y), r);
    relative(Math.hypot(actual.vx, actual.vy), vc);
  }
});

test('elliptic orbit reaches analytic apsides and retains energy and angular momentum', () => {
  const s = initial(.8), e = P.elements(s);
  assert.equal(e.kind, 'ellipse'); relative(e.e, .36);
  const peri = P.propagate(s, e.period / 2);
  relative(peri.x, -e.periapsis); relative(peri.y, 0, 1e-7);
  for (let k = 1; k < 50; k++) {
    const current = P.elements(P.propagate(s, e.period * k * .1234));
    relative(current.energy, e.energy); relative(current.h, e.h);
  }
});

test('parabolic motion matches independent Barker equation', () => {
  const s = initial(Math.SQRT2), q = r, d = 2.3;
  assert.equal(P.elements(s).kind, 'parabola');
  const t = Math.sqrt(2 * q ** 3 / P.MU) * (d + d ** 3 / 3);
  const current = P.propagate(s, t);
  relative(current.x, q * (1 - d * d)); relative(current.y, 2 * q * d);
  assert.ok(Math.abs(P.elements(current).energy) < 1e-9);
});

test('hyperbolic motion matches independent eccentric-anomaly coordinates', () => {
  const s = initial(1.6), e = P.elements(s), a = -e.a, h = 1.7;
  assert.equal(e.kind, 'hyperbola');
  const t = Math.sqrt(a ** 3 / P.MU) * (e.e * Math.sinh(h) - h);
  const current = P.propagate(s, t);
  relative(current.x, a * (e.e - Math.cosh(h)));
  relative(current.y, a * Math.sqrt(e.e ** 2 - 1) * Math.sinh(h));
  relative(P.elements(current).energy, e.energy);
});

test('exact sphere-crossing time stops zero-speed, grazing, elliptic and unbound impacts', () => {
  const cases = [initial(0), initial(.25), initial(.5),
    { x: r, y: 0, vx: -15, vy: .1 },
    { x: r, y: 0, vx: -Math.sqrt(2 * P.MU / r), vy: 0 },
    { x: r, y: 0, vx: -Math.sqrt(2 * P.MU / r - .2 ** 2), vy: .2 }];
  // An ellipse with a periapsis barely inside the sphere can cross and exit
  // between frames; analytic collision time must catch even this event.
  const peri = P.RADIUS * (1 - 1e-9);
  cases.push({ x: r, y: 0, vx: 0, vy: Math.sqrt(2 * P.MU * peri / (r * (r + peri))) });
  for (const s of cases) {
    const b = P.createBody(s);
    assert.ok(Number.isFinite(b.impactAt) && b.impactAt > 0);
    P.advance(b, 1e6);
    assert.equal(b.status, 'impact');relative(Math.hypot(b.state.x, b.state.y), P.RADIUS, 1e-8);
    const frozen = { ...b.state };P.advance(b, 1e6);assert.deepEqual(b.state, frozen);
  }
});

test('outward unbound radial trajectories do not collide or lose gravitational force offscreen', () => {
  for (const v of [Math.sqrt(2 * P.MU / r), 15]) {
    const b = P.createBody({ x: r, y: 0, vx: v, vy: 0 });
    assert.equal(b.impactAt, Infinity);P.advance(b, 1e6);
    assert.equal(b.status, 'active');assert.ok(b.state.x > r * 20);
    assert.ok(b.state.vx < v);relative(P.elements(b.state).energy, b.elements.energy, 1e-8);
  }
});

test('independent particles, speed reversal and time subdivision yield the same physical orbit', () => {
  const alone = P.createBody(initial(.8)), together = P.createBody(initial(.8));
  const other = P.createBody({ x: -r, y: 0, vx: 10, vy: 5 });
  P.advance(alone, 17000);
  for (let k = 0; k < 170; k++) { P.advance(together, 100); P.advance(other, 100); }
  assert.deepEqual(alone.state, together.state);
  const forward = P.propagate(initial(1), 3333);
  const reverse = P.propagate(initial(-1), 3333);
  relative(reverse.x, forward.x);relative(reverse.y, -forward.y);
});

test('invalid launch positions and time steps fail before corrupting the simulation', () => {
  assert.throws(() => P.createBody({ x: 0, y: 0, vx: 0, vy: 0 }), RangeError);
  assert.throws(() => P.propagate(initial(1), -1), RangeError);
  assert.throws(() => P.advance(P.createBody(initial(1)), NaN), RangeError);
});
