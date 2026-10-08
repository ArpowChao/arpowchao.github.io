'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../apps/lid-toss/physics.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} != ${b} (±${tol})`);

test('free flight lands where the ideal parabola says', () => {
  const cfg = P.makeConfig({ canX: 40 });
  for (const [ang, v] of [[15, 6], [30, 8], [45, 7.5], [60, 9], [75, 10]]) {
    const { result } = P.simulateShot(cfg, P.newLid(cfg, false), ang, v);
    near(result.landX, P.landingX(cfg, ang, v), 2e-3, `θ=${ang} v=${v}`);
    const th = ang * P.DEG, apex = cfg.releaseH + (v * Math.sin(th)) ** 2 / (2 * cfg.g);
    near(result.apex, apex, 2e-3, 'apex');
  }
});

test('aiming at the closed lid springs it open (low and high angle)', () => {
  const cfg = P.makeConfig({ canX: 5 });
  const h = P.hinge(cfg);
  for (const ang of [15, 30, 45, 60, 70]) {
    const v = P.requiredSpeed(cfg, ang, cfg.canX - 0.05, h.y);
    const lid = P.newLid(cfg, false);
    const { result } = P.simulateShot(cfg, lid, ang, v);
    assert.equal(result.lidOpened, true, `θ=${ang} v=${v.toFixed(2)}`);
    for (let i = 0; i < 200; i++) P.updateLid(lid, cfg, cfg.dt);
    assert.equal(lid.state, 'open');
    near(lid.phi, cfg.lidOpenPhi, 1e-12);
  }
});

test('with the lid closed the ball can never enter without opening it', () => {
  const cfg = P.makeConfig({ canX: 4 });
  for (let ang = 5; ang <= 85; ang += 5) for (let v = 3; v <= 14; v += 0.5) {
    const { result } = P.simulateShot(cfg, P.newLid(cfg, false), ang, v);
    if (result.kind === 'in') assert.equal(result.lidOpened, true);
  }
});

test('with the lid open, a descending shot through the opening goes in', () => {
  for (const canX of [3, 5, 7.5]) {
    const cfg = P.makeConfig({ canX });
    for (const ang of [50, 60, 70]) {
      const v = P.requiredSpeed(cfg, ang, cfg.canX - 0.03, cfg.canH);
      const { result } = P.simulateShot(cfg, P.newLid(cfg, true), ang, v);
      assert.equal(result.kind, 'in', `d=${canX} θ=${ang} v=${v.toFixed(2)}`);
    }
  }
});

test('a low flat shot hits the can wall and bounces back', () => {
  const cfg = P.makeConfig({ canX: 5 });
  const { front } = P.canEdges(cfg);
  const v = P.requiredSpeed(cfg, 12, front - 0.08, 0.45);
  const { result, sim } = P.simulateShot(cfg, P.newLid(cfg, false), 12, v);
  assert.equal(result.kind, 'wall');
  assert.ok(sim.ball.x < front);
});

test('same-speed challenge is solvable: one speed opens the lid and later scores', () => {
  const cfg = P.makeConfig({ canX: 5 });
  const v = P.requiredSpeed(cfg, 58, cfg.canX - 0.03, cfg.canH);
  let opener = null, scorer = null;
  for (let a = 5; a <= 85; a += 0.5) {
    if (opener === null && P.simulateShot(cfg, P.newLid(cfg, false), a, v).result.lidOpened) opener = a;
    if (scorer === null && P.simulateShot(cfg, P.newLid(cfg, true), a, v).result.kind === 'in') scorer = a;
  }
  assert.ok(opener !== null, 'some angle opens the lid');
  assert.ok(scorer !== null, 'some angle scores');
});

test('ball comes to rest and every shot terminates', () => {
  const cfg = P.makeConfig({ canX: 3 });
  for (const [a, v] of [[0, 1], [85, 15], [45, 15], [10, 2]]) {
    const { sim } = P.simulateShot(cfg, P.newLid(cfg, false), a, v);
    assert.equal(sim.done, true);
    assert.ok(sim.t <= cfg.maxTime + cfg.dt);
  }
});
