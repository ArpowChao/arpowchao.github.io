'use strict';
importScripts('physics.js');

let config = BaseballCFD.normalizeConfig();
let smooth = null, seamed = null, running = true, generation = 0;
let timer = null, lastSnapshotTime = 0;

function sendSnapshot() {
  if (!smooth || !seamed) return;
  const smoothFrame = smooth.snapshot(), seamedFrame = seamed.snapshot();
  if (!smoothFrame.diagnostics.stable || !seamedFrame.diagnostics.stable) running = false;
  const transfers = [];
  for (const frame of [smoothFrame, seamedFrame]) {
    for (const key of ['ux', 'uy', 'rho', 'vorticity', 'cp', 'solid']) transfers.push(frame[key].buffer);
  }
  postMessage({ type: 'snapshot', generation, running, config, smooth: smoothFrame, seamed: seamedFrame }, transfers);
  lastSnapshotTime = Date.now();
}

function schedule() {
  if (timer !== null || !running || !smooth || !seamed) return;
  timer = setTimeout(tick, 0);
}

function tick() {
  timer = null;
  if (!running) return;
  // Short batches let pause and slider changes interrupt the solver promptly.
  smooth.step(3); seamed.step(3);
  if (Date.now() - lastSnapshotTime >= 50) sendSnapshot();
  schedule();
}

function restart(raw) {
  config = BaseballCFD.normalizeConfig(raw);
  smooth = BaseballCFD.createSimulation(config, 'smooth');
  seamed = BaseballCFD.createSimulation(config, 'seamed');
  postMessage({ type: 'ready', generation, running, config });
  sendSnapshot();
  schedule();
}

self.onmessage = function (event) {
  const message = event.data || {};
  try {
    if (message.type === 'configure') {
      if (message.generation !== undefined) generation = message.generation;
      if (typeof message.running === 'boolean') running = message.running;
      restart(message.config);
    } else if (message.type === 'pause') {
      running = false;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      sendSnapshot();
    } else if (message.type === 'resume') {
      running = true;
      if (!smooth) restart(config);
      else { sendSnapshot(); schedule(); }
    } else if (message.type === 'step') {
      running = false;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (!smooth) restart(config);
      const count = Math.max(1, Math.min(120, Math.floor(Number(message.count) || 24)));
      smooth.step(count); seamed.step(count); sendSnapshot();
    } else if (message.type === 'reset') {
      if (message.generation !== undefined) generation = message.generation;
      restart(message.config || config);
    }
  } catch (err) {
    running = false;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    postMessage({ type: 'error', generation, message: err && err.message ? err.message : String(err) });
  }
};
