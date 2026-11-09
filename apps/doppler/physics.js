(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DopplerPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPS = 1e-9;
  function validate(p) {
    if (![p.c, p.f, p.mach].every(Number.isFinite) || p.c <= 0 || p.f <= 0 || Math.abs(p.mach) >= 1) throw new RangeError('Require c > 0, f > 0 and |v/c| < 1.');
  }
  function source(p, t) { return { x: p.mach * p.c * t, y: 0 }; }
  function wave(p, n, t) {
    validate(p);
    const emitted = n / p.f, center = source(p, emitted);
    return { n, emitted, ...center, radius: p.c * Math.max(0, t - emitted) };
  }
  function waves(p, t) {
    validate(p);
    if (!Number.isFinite(t) || t < (p.t0 || 0)) throw new RangeError('Require time after the source starts.');
    // p.t0（可省略，預設 0）：波源從 t0 開始打水；t0 < 0 表示水面一開始就布滿波
    const n0 = Math.ceil((p.t0 || 0) * p.f - EPS), n1 = Math.floor(t * p.f + EPS);
    return Array.from({ length: Math.max(0, n1 - n0 + 1) }, (_, k) => wave(p, n0 + k, t));
  }
  // 觀察者可以等速移動：位置 = (x, y) + (vx, vy)·t；vx、vy 省略時為靜止。
  function observerAt(o, t) { return { x: o.x + (o.vx || 0) * t, y: o.y + (o.vy || 0) * t }; }
  function arrival(p, n, observer) {
    const w = wave(p, n, n / p.f), vx = observer.vx || 0, vy = observer.vy || 0;
    const at = observerAt(observer, w.emitted), dx = at.x - w.x, dy = at.y - w.y;
    if (!vx && !vy) return w.emitted + Math.hypot(dx, dy) / p.c;
    // |D + u·τ| = c·τ（τ ≥ 0）；觀察者速度 < 波速時恰有一個正根
    const a = vx * vx + vy * vy - p.c * p.c, b = 2 * (dx * vx + dy * vy), d2 = dx * dx + dy * dy;
    if (a >= 0) throw new RangeError('Require observer speed < wave speed.');
    return w.emitted + (-b - Math.sqrt(b * b - 4 * a * d2)) / (2 * a);
  }
  function arrivals(p, observer, end = 10) {
    validate(p);
    return waves(p, end).map(w => ({ n: w.n, emitted: w.emitted, time: arrival(p, w.n, observer) })).filter(a => a.time <= end + EPS);
  }
  function received(p, observer, t) {
    const events = arrivals(p, observer, t), last = events.at(-1), previous = events.at(-2);
    const interval = previous ? last.time - previous.time : null;
    return { count: events.length, events, interval, frequency: interval > EPS ? 1 / interval : null, last: last ? last.time : null };
  }
  function spacing(p) {
    validate(p);
    return { still: p.c / p.f, right: p.c * (1 - p.mach) / p.f, left: p.c * (1 + p.mach) / p.f };
  }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function snapshotRings(c, pieces) {
    if (!Number.isFinite(c) || c <= 0) throw new RangeError('Require positive wave speed.');
    const rings = pieces.filter(p => p.placed !== false && !p.marker && p.radius > 0);
    if (rings.some(p => ![p.x, p.y, p.radius].every(Number.isFinite))) throw new RangeError('Require finite wave geometry.');
    return rings;
  }
  function snapshotWaves(c, pieces, elapsed) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Require nonnegative elapsed time.');
    return snapshotRings(c, pieces).map(p => ({ ...p, radius: p.radius + c * elapsed }));
  }
  function snapshotArrivals(c, pieces, observer) {
    if (![observer.x, observer.y].every(Number.isFinite)) throw new RangeError('Require finite observer coordinates.');
    return snapshotRings(c, pieces).map(p => ({ n: p.n, time: (distance(p, observer) - p.radius) / c }))
      // A wave already beyond the duck has passed before this snapshot.
      .filter(a => a.time >= -EPS).map(a => ({ ...a, time: Math.max(0, a.time) }))
      .sort((a, b) => a.time - b.time || a.n - b.n);
  }
  function snapshotReceived(c, pieces, observer, elapsed) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Require nonnegative elapsed time.');
    const events = snapshotArrivals(c, pieces, observer).filter(a => a.time <= elapsed + EPS);
    const last = events.at(-1), previous = events.at(-2), interval = previous ? last.time - previous.time : null;
    return { events, count: events.length, last: last ? last.time : null, interval };
  }
  return { source, wave, waves, observerAt, arrival, arrivals, received, spacing, distance, snapshotWaves, snapshotArrivals, snapshotReceived };
});
