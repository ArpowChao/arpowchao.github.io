const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const physics = require('../apps/baseball-cfd/physics.js');

const smallGrid = { nx: 192, ny: 113, diameterCells: 30 };
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('physical inputs map to a stable, explicitly scaled 2D lattice model', () => {
  const c = physics.normalizeConfig({ modelRe: 999, speedKmh: 80, spinRpm: 3000 });
  assert.equal(c.modelRe, 160);
  assert.equal(c.gridRe, c.modelRe);
  close(c.viscosity, c.uIn * c.diameterCells / c.gridRe);
  close(c.tau, 0.5 + 3 * c.viscosity);
  close(c.realRe, (80 / 3.6) * 0.073 / 1.5e-5);
  close(c.omegaLattice, (3000 * 2 * Math.PI / 60) * c.timeStepSeconds);
  assert.ok(c.spinRatio > 0.5 && c.spinRatio < 0.52);
  assert.equal(c.fixedOrientation, true);
  assert.ok(c.tau > 0.5);
  assert.equal(physics.normalizeConfig({ modelRe: -1 }).modelRe, 60);
});

test('browser worker and Node use the same physics module', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps/baseball-cfd/physics.js'), 'utf8'), context);
  assert.equal(typeof context.BaseballCFD.createSimulation, 'function');
  const config = context.BaseballCFD.normalizeConfig({ speedKmh: 100, spinRpm: -1200 });
  close(config.spinRatio, physics.normalizeConfig({ speedKmh: 100, spinRpm: -1200 }).spinRatio);
});

test('zero-height seams reduce exactly to smooth-cylinder CFD', () => {
  const config = { ...smallGrid, seamHeightMm: 0, spinRpm: -1500 };
  const smooth = physics.createSimulation(config, 'smooth');
  const seamed = physics.createSimulation(config, 'seamed');
  smooth.step(90); seamed.step(90);
  const a = smooth.snapshot(), b = seamed.snapshot();
  assert.deepEqual(a.solid, b.solid);
  assert.deepEqual(a.ux, b.ux);
  assert.deepEqual(a.uy, b.uy);
  assert.deepEqual(a.rho, b.rho);
  assert.equal(b.geometry.seamCenters.length, 0);
});

test('resolved ribs change the obstacle and produce a different numerical wake', () => {
  const smooth = physics.createSimulation(smallGrid, 'smooth');
  const seamed = physics.createSimulation({ ...smallGrid, seamHeightMm: 1.5, seamCount: 4 }, 'seamed');
  assert.equal(seamed.geometry.seamCenters.length, 4);
  close(seamed.geometry.seamHeightCells, 1.5 * 6 * 30 / 73);
  smooth.step(650); seamed.step(650);
  const a = smooth.snapshot(), b = seamed.snapshot(), g = a.geometry;
  assert.ok(a.diagnostics.stable && b.diagnostics.stable);
  assert.ok(b.solid.reduce((sum, cell) => sum + cell, 0) > a.solid.reduce((sum, cell) => sum + cell, 0));
  let errorSquared = 0, samples = 0;
  for (let y = g.cy - 20; y <= g.cy + 20; y++) {
    for (let x = g.cx + g.radius + 8; x < g.cx + 90; x++) {
      const i = y * a.nx + x;
      errorSquared += (a.ux[i] - b.ux[i]) ** 2 + (a.uy[i] - b.uy[i]) ** 2;
      samples++;
    }
  }
  assert.ok(Math.sqrt(errorSquared / samples) > 0.001, 'seams must alter velocities downstream, not only the displayed geometry');
  const wake = g.cy * a.nx + g.cx + g.radius + 8;
  assert.ok(a.ux[wake] < a.config.uIn * 0.4, 'cylinder must form a resolved velocity deficit');
  const front = g.cy * a.nx + g.cx - g.radius - 2;
  assert.ok(a.cp[front] > a.cp[wake] + 0.5, 'pressure must respond to the stagnation region and wake');
  close(a.cp[front], 2 * (a.rho[front] - 1) / (3 * a.config.uIn ** 2), 1e-6);
  const curlPoint = (g.cy + g.radius + 4) * a.nx + g.cx + 2;
  close(a.vorticity[curlPoint], 0.5 * (a.uy[curlPoint + 1] - a.uy[curlPoint - 1] - a.ux[curlPoint + a.nx] + a.ux[curlPoint - a.nx]), 1e-8);
  const outlet = (g.cy + 20) * a.nx + a.nx - 1;
  close(a.cp[outlet], 2 * (a.rho[outlet] - 1) / (3 * a.config.uIn ** 2), 1e-6);
  const outletCurl = a.uy[outlet] - a.uy[outlet - 1]
    - 0.5 * (a.ux[outlet + a.nx] - a.ux[outlet - a.nx]);
  close(a.vorticity[outlet], outletCurl, 1e-8);
  const topEdge = g.cx + 2;
  const topCurl = 0.5 * (a.uy[topEdge + 1] - a.uy[topEdge - 1])
    - (a.ux[topEdge + a.nx] - a.ux[topEdge]);
  close(a.vorticity[topEdge], topCurl, 1e-8);
});

test('opposite wall spin reverses the resolved flow asymmetry', () => {
  const positive = physics.createSimulation({ ...smallGrid, spinRpm: 2000 }, 'smooth');
  const negative = physics.createSimulation({ ...smallGrid, spinRpm: -2000 }, 'smooth');
  positive.step(500); negative.step(500);
  const a = positive.snapshot(), b = negative.snapshot(), g = a.geometry;
  const top = (g.cy - g.radius - 2) * a.nx + g.cx;
  const bottom = (g.cy + g.radius + 2) * a.nx + g.cx;
  assert.ok(a.ux[bottom] > a.ux[top] + 0.01);
  assert.ok(b.ux[top] > b.ux[bottom] + 0.01);
  close(a.ux[top], b.ux[bottom], 2e-5);
  close(a.ux[bottom], b.ux[top], 2e-5);
  const besideWall = g.cy * a.nx + g.cx + g.radius + 1;
  assert.equal(a.solid[besideWall - 1], 1);
  const expectedCurl = a.uy[besideWall + 1] - a.uy[besideWall]
    - 0.5 * (a.ux[besideWall + a.nx] - a.ux[besideWall - a.nx]);
  close(a.vorticity[besideWall], expectedCurl, 1e-8);
});

test('highest Reynolds number, seam height and signed spin remain finite for sustained runs', () => {
  for (const spinRpm of [-3000, 3000]) {
    const sim = physics.createSimulation({ modelRe: 160, speedKmh: 80, spinRpm, seamHeightMm: 1.5, seamCount: 4, seamAngleDeg: 90 }, 'seamed');
    assert.equal(sim.step(1200), 1200);
    const d = sim.diagnostics();
    assert.equal(d.stable, true, d.error);
    assert.ok(d.minDensity > 0.94 && d.maxDensity < 1.06);
    assert.ok(d.maxSpeed < 0.17);
    assert.ok(Math.abs(d.mass / d.fluidCells - 1) < 0.01);
  }
  const viscous = physics.createSimulation({ ...smallGrid, modelRe: 60, speedKmh: 160, spinRpm: -3000, seamHeightMm: 1.5 }, 'seamed');
  viscous.step(450);
  assert.equal(viscous.diagnostics().stable, true);
});

test('transferring snapshots never detaches the live simulation state', () => {
  const sim = physics.createSimulation(smallGrid, 'smooth');
  sim.step(3);
  const frame = sim.snapshot();
  const transferred = structuredClone(frame, { transfer: ['ux', 'uy', 'rho', 'vorticity', 'cp', 'solid'].map(key => frame[key].buffer) });
  assert.equal(frame.ux.length, 0);
  assert.equal(transferred.ux.length, smallGrid.nx * smallGrid.ny);
  assert.equal(sim.step(3), 3);
  assert.equal(sim.snapshot().steps, 6);
  assert.equal(sim.diagnostics().stable, true);
});

test('worker honors pause, manual stepping, generations and paused reconfiguration', () => {
  const messages = [], timers = new Map();
  let timerId = 0, time = 0;
  const sandbox = {
    BaseballCFD: physics,
    importScripts() {},
    postMessage(message, transfers) { messages.push({ message, transfers }); },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    Date: { now: () => time }
  };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/baseball-cfd/worker.js'), 'utf8'), sandbox);
  const dispatch = data => sandbox.onmessage({ data });
  const latest = () => messages.at(-1).message;
  dispatch({ type: 'configure', config: smallGrid, running: false, generation: 7 });
  assert.equal(latest().type, 'snapshot');
  assert.equal(latest().generation, 7);
  assert.equal(latest().smooth.steps, 0);
  assert.equal(timers.size, 0);
  assert.equal(messages.at(-1).transfers.length, 12);
  dispatch({ type: 'step', count: 6 });
  assert.equal(latest().smooth.steps, 6);
  assert.equal(latest().seamed.steps, 6);
  assert.equal(latest().running, false);
  dispatch({ type: 'resume' });
  assert.equal(timers.size, 1);
  time = 100;
  const [id, callback] = timers.entries().next().value;
  timers.delete(id); callback();
  assert.equal(latest().smooth.steps, 9);
  dispatch({ type: 'pause' });
  assert.equal(timers.size, 0);
  assert.equal(latest().running, false);
  dispatch({ type: 'configure', config: { ...smallGrid, spinRpm: 1000 }, generation: 8 });
  assert.equal(latest().generation, 8);
  assert.equal(latest().smooth.steps, 0);
  assert.equal(latest().running, false);
  assert.equal(timers.size, 0);
  dispatch({ type: 'reset', generation: 9 });
  assert.equal(latest().generation, 9);
  assert.equal(latest().config.spinRpm, 1000);
});
