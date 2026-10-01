'use strict';
importScripts('physics.js');
let latestRequest = 0;

function compact(result) {
  // The visualization draws a central cross-section; omit thousands of 3-D
  // sample coordinates from messages, while retaining their computed totals.
  const { pointsA, pointsB, ...summary } = result;
  return summary;
}

self.onmessage = async (event) => {
  const { id, params, gridSize, minGap, maxGap } = event.data;
  latestRequest = id;
  try {
    const physics = self.ChargedSpheresPhysics;
    const current = compact(physics.directSumForce(params, gridSize));
    if (id !== latestRequest) return;
    self.postMessage({ id, type: 'current', result: current });
    const series = [];
    const count = 37;
    for (let i = 0; i < count; i++) {
      // Yield between calculations so a newly selected experiment can cancel
      // an old sweep without blocking controls or displaying stale results.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (id !== latestRequest) return;
      const gapRatio = minGap * (maxGap / minGap) ** (i / (count - 1));
      const options = { ...params, separation: params.radius * (2 + gapRatio) };
      const result = physics.directSumForce(options, gridSize);
      series.push({ gapRatio, force: result.force, error: result.magnitudeRelativeError });
      if ((i + 1) % 8 === 0) self.postMessage({ id, type: 'progress', count: i + 1, total: count });
    }
    if (id === latestRequest) self.postMessage({ id, type: 'series', series });
  } catch (error) {
    if (id === latestRequest) self.postMessage({ id, type: 'error', message: error.message });
  }
};
