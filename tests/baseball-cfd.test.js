const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const physics = require('../apps/baseball-cfd/physics.js');

const smallGrid = { nx: 240, ny: 121, diameterCells: 18 };
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const diameters = (sim, n) => Math.round(n * sim.config.stepsPerDiameter);

test('ball speed maps onto the resolvable model Re; physical spin ratio is kept', () => {
  assert.equal(physics.normalizeConfig({ speedKmh: 80 }).modelRe, 60);
  assert.equal(physics.normalizeConfig({ speedKmh: 160 }).modelRe, 180);
  assert.equal(physics.normalizeConfig({ speedKmh: 120 }).modelRe, 120);
  assert.equal(physics.normalizeConfig({ speedKmh: 999 }).modelRe, 180);
  const c = physics.normalizeConfig({ speedKmh: 80, spinRpm: 3000 });
  close(c.viscosity, c.uIn * c.diameterCells / c.gridRe);
  close(c.tau, 0.5 + 3 * c.viscosity);
  close((c.tau - 0.5) * (c.tauMinus - 0.5), 3 / 16, 1e-12);
  close(c.realRe, (80 / 3.6) * 0.073 / 1.5e-5);
  close(c.omegaLattice, (3000 * 2 * Math.PI / 60) * c.timeStepSeconds);
  assert.ok(c.spinRatio > 0.5 && c.spinRatio < 0.52);
  assert.ok(c.tau > 0.53, 'highest Re keeps a safe relaxation time');
  assert.equal(c.ny % 2, 1, 'odd height keeps the ball on the mirror line');
  const override = physics.normalizeConfig({ speedKmh: 80, modelReOverride: 100 });
  assert.equal(override.modelRe, 100);
  assert.equal(physics.normalizeConfig(override).modelRe, 100, 'override survives re-normalisation in the worker');
  assert.equal(physics.normalizeConfig({ seamCount: 1 }).seamCount, 1);
  assert.equal(physics.normalizeConfig({ seamCount: 3 }).seamCount, 2);
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
  smooth.step(200); seamed.step(200);
  const a = smooth.snapshot(), b = seamed.snapshot();
  assert.deepEqual(a.solid, b.solid);
  assert.deepEqual(a.ux, b.ux);
  assert.deepEqual(a.rho, b.rho);
  assert.deepEqual(a.forces, b.forces);
  assert.equal(b.geometry.seamCenters.length, 0);
});

test('free-stream reference gives a physical stagnation pressure and wake', () => {
  const sim = physics.createSimulation({ ...smallGrid, speedKmh: 120, spinRpm: 0, seamHeightMm: 0, kick: false });
  sim.step(diameters(sim, 6));
  const s = sim.snapshot(), g = s.geometry;
  const front = g.cy * s.nx + Math.round(g.cx - g.radius - 1);
  const wake = g.cy * s.nx + Math.round(g.cx + g.radius + 3);
  assert.ok(s.cp[front] > 0.9 && s.cp[front] < 1.3, `stagnation Cp ${s.cp[front]} should be near 1`);
  assert.ok(s.cp[wake] < -0.3, 'base pressure is below free stream');
  assert.ok(s.ux[wake] < s.config.uIn * 0.4, 'cylinder forms a resolved velocity deficit');
  close(s.cp[front], 2 * (s.rho[front] - s.rhoRef) / (3 * s.config.uIn ** 2), 1e-5);
  const top = Math.round(g.cy - 2.4 * g.radius * 2) * s.nx + g.cx;
  assert.ok(s.ux[top] / s.config.uIn < 1.3, 'side walls no longer squeeze the flow to 1.6 U');
});

test('resolved ribs change the obstacle and produce a different numerical wake', () => {
  const smooth = physics.createSimulation(smallGrid, 'smooth');
  const seamed = physics.createSimulation({ ...smallGrid, seamHeightMm: 1.5, seamCount: 4 }, 'seamed');
  assert.equal(seamed.geometry.seamCenters.length, 4);
  close(seamed.geometry.seamHeightCells, 1.5 * 6 * 18 / 73);
  smooth.step(700); seamed.step(700);
  const a = smooth.snapshot(), b = seamed.snapshot(), g = a.geometry;
  assert.ok(a.diagnostics.stable && b.diagnostics.stable);
  assert.ok(b.solid.reduce((sum, cell) => sum + cell, 0) > a.solid.reduce((sum, cell) => sum + cell, 0));
  let errorSquared = 0, samples = 0;
  for (let y = g.cy - 15; y <= g.cy + 15; y++) {
    for (let x = g.cx + g.radius + 6; x < g.cx + 70; x++) {
      const i = y * a.nx + x;
      errorSquared += (a.ux[i] - b.ux[i]) ** 2 + (a.uy[i] - b.uy[i]) ** 2;
      samples++;
    }
  }
  assert.ok(Math.sqrt(errorSquared / samples) > 0.001, 'seams must alter velocities downstream, not only the displayed geometry');
  const curlPoint = (g.cy + g.radius + 4) * a.nx + g.cx + 2;
  close(a.vorticity[curlPoint], 0.5 * (a.uy[curlPoint + 1] - a.uy[curlPoint - 1] - a.ux[curlPoint + a.nx] + a.ux[curlPoint - a.nx]), 1e-8);
});

test('opposite spin mirrors the flow and the Magnus force points the right way', () => {
  const base = { ...smallGrid, speedKmh: 120, seamHeightMm: 0, kick: false };
  const topspin = physics.createSimulation({ ...base, spinRpm: 2000 }, 'smooth');   // counterclockwise on screen
  const backspin = physics.createSimulation({ ...base, spinRpm: -2000 }, 'smooth'); // clockwise on screen
  topspin.step(600); backspin.step(600);
  const a = topspin.snapshot(), b = backspin.snapshot(), g = a.geometry;
  const top = (g.cy - g.radius - 2) * a.nx + g.cx;
  const bottom = (g.cy + g.radius + 2) * a.nx + g.cx;
  assert.ok(a.ux[bottom] > a.ux[top] + 0.01, 'topspin: faster flow underneath');
  assert.ok(b.ux[top] > b.ux[bottom] + 0.01, 'backspin: faster flow on top');
  close(a.ux[top], b.ux[bottom], 2e-5);
  close(a.ux[bottom], b.ux[top], 2e-5);
  close(a.forces.cl, -b.forces.cl, 1e-4);
  assert.ok(b.forces.cl > 0.1, `backspin lift ${b.forces.cl} should push the ball up`);
  assert.ok(a.forces.cl < -0.1, 'topspin pushes the ball down');
});

test('vortex shedding: whole-cycle averages give zero mean lift for a symmetric ball', () => {
  const sim = physics.createSimulation({ ...smallGrid, speedKmh: 140, spinRpm: 0, seamHeightMm: 0 });
  sim.step(diameters(sim, 26));
  const f = sim.coefficients();
  assert.ok(f.cycles >= 2, `expected shedding cycles, got ${f.cycles}`);
  assert.ok(Math.abs(f.mean.cl) < 0.06, `mean lift ${f.mean.cl} should vanish`);
  assert.ok(f.mean.cd > 1.2 && f.mean.cd < 2.0, `drag coefficient ${f.mean.cd}`);
  const s = sim.snapshot();
  assert.ok(s.meanSamples > 0);
  assert.equal(s.cpMean.length, s.nx * s.ny);
});

test('highest Re, tallest seams and strongest spin stay finite for sustained runs', () => {
  for (const spinRpm of [-3000, 3000]) {
    const sim = physics.createSimulation({ speedKmh: 160, spinRpm, seamHeightMm: 1.5, seamCount: 4, seamAngleDeg: 90 }, 'seamed');
    assert.equal(sim.step(1500), 1500);
    const d = sim.diagnostics();
    assert.equal(d.stable, true, d.error);
    assert.ok(d.minDensity > 0.94 && d.maxDensity < 1.06);
    assert.ok(Math.abs(d.mass / d.fluidCells - 1) < 0.01);
  }
  const viscous = physics.createSimulation({ ...smallGrid, speedKmh: 80, spinRpm: -3000, seamHeightMm: 1.5, seamCount: 1 }, 'seamed');
  viscous.step(800);
  assert.equal(viscous.diagnostics().stable, true);
});

test('transferring snapshots never detaches the live simulation state', () => {
  const sim = physics.createSimulation(smallGrid, 'smooth');
  sim.step(3);
  const frame = sim.snapshot();
  const keys = ['ux', 'uy', 'rho', 'vorticity', 'cp', 'cpMean', 'meanSpeed', 'solid'];
  const transferred = structuredClone(frame, { transfer: keys.map(key => frame[key].buffer) });
  assert.equal(frame.ux.length, 0);
  assert.equal(transferred.ux.length, smallGrid.nx * (smallGrid.ny % 2 ? smallGrid.ny : smallGrid.ny + 1));
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
  assert.equal(messages.at(-1).transfers.length, 16);
  dispatch({ type: 'step', count: 6 });
  assert.equal(latest().smooth.steps, 6);
  assert.equal(latest().seamed.steps, 6);
  assert.equal(latest().running, false);
  dispatch({ type: 'step', count: 9999 });
  assert.equal(latest().smooth.steps, 1206, 'manual steps are capped');
  dispatch({ type: 'resume' });
  assert.equal(timers.size, 1);
  time = 100;
  const [id, callback] = timers.entries().next().value;
  timers.delete(id); callback();
  assert.ok(latest().smooth.steps > 1206);
  assert.equal(latest().smooth.steps, latest().seamed.steps);
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
