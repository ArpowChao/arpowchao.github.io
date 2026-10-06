/* Fixed spherical primary, independent test particles; km, s, km/s.
 * Universal-variable Kepler propagation solves r'' = -mu*r/|r|^3.
 * No softened gravity, atmospheric drag, or forces between particles.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrbitPhysics = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MU = 398600.4418, RADIUS = 6371, TAU = 2 * Math.PI;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const mod = (x, n) => ((x % n) + n) % n;

  function elements(s, mu = MU) {
    const r = Math.hypot(s.x, s.y), v = Math.hypot(s.vx, s.vy);
    const dot = s.x * s.vx + s.y * s.vy, h = s.x * s.vy - s.y * s.vx;
    const energy = v * v / 2 - mu / r, alpha = -2 * energy / mu;
    const ex = ((v * v - mu / r) * s.x - dot * s.vx) / mu;
    const ey = ((v * v - mu / r) * s.y - dot * s.vy) / mu;
    const e = Math.hypot(ex, ey), p = h * h / mu;
    const a = alpha === 0 ? Infinity : 1 / alpha;
    const parabolic = Math.abs(alpha * r) < 1e-12;
    const kind = Math.abs(h) < Math.sqrt(mu * r) * 1e-10 ? 'radial' :
      e < 1e-7 ? 'circle' : parabolic ? 'parabola' : energy < 0 ? 'ellipse' : 'hyperbola';
    return { r, v, dot, h, energy, alpha, ex, ey, e, p, a, kind,
      periapsis: p / (1 + e), apoapsis: energy < 0 ? a * (1 + e) : Infinity,
      period: energy < 0 ? TAU * Math.sqrt(a ** 3 / mu) : Infinity,
      circularSpeed: Math.sqrt(mu / r), escapeSpeed: Math.sqrt(2 * mu / r) };
  }

  function stumpff(z) {
    if (Math.abs(z) < 1e-4) {
      // Series avoid cancellation around parabolic motion and short intervals.
      let c = .5, s = 1 / 6, tc = c, ts = s;
      for (let k = 1; k <= 8; k++) {
        tc *= -z / ((2 * k + 1) * (2 * k + 2));
        ts *= -z / ((2 * k + 2) * (2 * k + 3));
        c += tc; s += ts;
      }
      return { c, s };
    }
    if (z > 0) {
      const q = Math.sqrt(z);
      return { c: 2 * Math.sin(q / 2) ** 2 / z, s: (q - Math.sin(q)) / q ** 3 };
    }
    const q = Math.sqrt(-z);
    return { c: 2 * Math.sinh(q / 2) ** 2 / (-z), s: (Math.sinh(q) - q) / q ** 3 };
  }

  function propagate(initial, seconds, mu = MU) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Time must be finite and nonnegative');
    const e = elements(initial, mu), sqrtMu = Math.sqrt(mu), r0 = e.r;
    if (!(r0 > 0) || ![initial.x, initial.y, initial.vx, initial.vy].every(Number.isFinite)) {
      throw new RangeError('Invalid initial state');
    }
    // Complete elliptic revolutions need not enter the transcendental solve.
    const dt = e.energy < 0 ? seconds % e.period : seconds;
    if (dt === 0) return { ...initial };
    function equation(chi) {
      const { c, s } = stumpff(e.alpha * chi * chi);
      const time = e.dot / sqrtMu * chi * chi * c + (1 - e.alpha * r0) * chi ** 3 * s + r0 * chi;
      const radius = e.dot / sqrtMu * chi * (1 - e.alpha * chi * chi * s) +
        (1 - e.alpha * r0) * chi * chi * c + r0;
      return { f: time - sqrtMu * dt, radius, c, s };
    }
    const linearGuess = sqrtMu * dt / r0;
    // Hyperbolic chi grows logarithmically with time. A linear guess would
    // overflow cosh or spend hundreds of Newton steps in its exponential tail.
    let lo = 0, hi = Math.max(1, e.alpha < 0 ?
      Math.log1p(linearGuess * Math.sqrt(-e.alpha)) / Math.sqrt(-e.alpha) : linearGuess);
    for (let k = 0; k < 100 && equation(hi).f < 0; k++) hi *= 2;
    let chi = (lo + hi) / 2, solved = false;
    for (let k = 0; k < 100; k++) {
      const q = equation(chi);
      if (Math.abs(q.f) < 2e-12 * sqrtMu * Math.max(dt, 1)) { solved = true; break; }
      if (q.f > 0 || !Number.isFinite(q.f)) hi = chi; else lo = chi;
      const next = chi - q.f / q.radius;
      chi = Number.isFinite(next) && next > lo && next < hi ? next : (lo + hi) / 2;
    }
    if (!solved) throw new Error('Kepler solve did not converge');
    const { c, s } = stumpff(e.alpha * chi * chi);
    const f = 1 - chi * chi * c / r0, g = dt - chi ** 3 * s / sqrtMu;
    const x = f * initial.x + g * initial.vx, y = f * initial.y + g * initial.vy;
    const r = Math.hypot(x, y);
    const fd = sqrtMu / (r * r0) * (e.alpha * chi ** 3 * s - chi);
    const gd = 1 - chi * chi * c / r;
    return { x, y, vx: fd * initial.x + gd * initial.vx, vy: fd * initial.y + gd * initial.vy };
  }

  function impactTime(initial, radius = RADIUS, mu = MU) {
    const e = elements(initial, mu);
    if (e.r <= radius) return 0;
    if (e.periapsis > radius * (1 + 1e-12)) return Infinity;
    if (Math.abs(e.alpha * e.r) < 1e-12) {
      if (e.p < radius * 1e-12) {
        return e.dot < 0 ? 2 * (e.r ** 1.5 - radius ** 1.5) / (3 * Math.sqrt(2 * mu)) : Infinity;
      }
      const q = e.p / 2, d0 = e.dot / Math.sqrt(mu * e.p);
      const dc = -Math.sqrt(Math.max(0, radius / q - 1));
      const time = Math.sqrt(2 * q ** 3 / mu) * ((dc + dc ** 3 / 3) - (d0 + d0 ** 3 / 3));
      return time >= 0 ? time : Infinity;
    }
    if (e.energy < 0) {
      const e0 = Math.atan2(e.dot / Math.sqrt(mu * e.a), 1 - e.r / e.a);
      const ec = -Math.acos(clamp((1 - radius / e.a) / e.e, -1, 1));
      return mod((ec - e.e * Math.sin(ec)) - (e0 - e.e * Math.sin(e0)), TAU) * Math.sqrt(e.a ** 3 / mu);
    }
    const a = -e.a;
    const h0 = Math.asinh(e.dot / (e.e * Math.sqrt(mu * a)));
    const hc = -Math.acosh(Math.max(1, (radius / a + 1) / e.e));
    const time = ((e.e * Math.sinh(hc) - hc) - (e.e * Math.sinh(h0) - h0)) * Math.sqrt(a ** 3 / mu);
    return time >= 0 ? time : Infinity;
  }

  function createBody(initial, options = {}) {
    const mu = options.mu ?? MU, radius = options.radius ?? RADIUS;
    if (![initial.x, initial.y, initial.vx, initial.vy, mu, radius].every(Number.isFinite) || mu <= 0 || radius <= 0) {
      throw new RangeError('Invalid initial state or primary');
    }
    if (Math.hypot(initial.x, initial.y) <= radius) throw new RangeError('Launch outside the surface');
    return { initial: { ...initial }, state: { ...initial }, age: 0, mu, radius,
      elements: elements(initial, mu), impactAt: impactTime(initial, radius, mu), status: 'active' };
  }
  function advance(body, seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Invalid time step');
    if (body.status !== 'active') return body.state;
    body.age = Math.min(body.age + seconds, body.impactAt);
    body.state = propagate(body.initial, body.age, body.mu);
    if (body.age >= body.impactAt) body.status = 'impact';
    return body.state;
  }
  return { MU, RADIUS, elements, stumpff, propagate, impactTime, createBody, advance };
});
