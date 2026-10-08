/* D2Q9 two-relaxation-time (TRT) lattice Boltzmann flow around a circular cross-section.
 * Geometry stays fixed; spin sets a tangential moving-wall velocity.
 * Raised seam ribs are deliberately magnified to resolve them on this grid.
 * This is a low-Re 2D educational CFD model, not a 3D baseball prediction.
 *
 * Domain: velocity inlet with a 0.75 D sponge (left, 3.5 D upstream), zero-gradient outlet (right, ~9.8 D downstream),
 * free-slip (specular) top and bottom, blockage D/H ≈ 15 %.
 * Forces use momentum exchange on every boundary link; Cp uses a measured free-stream reference.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BaseballCFD = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const CX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
  const CY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
  const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
  const MIRROR_Y = [0, 1, 4, 3, 2, 8, 7, 6, 5];
  const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
  const MAGIC = 3 / 16; // TRT magic parameter: wall location independent of viscosity
  const clamp = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : fallback));

  // Teaching scale: the real-ball Re (~1e5) cannot be resolved in real time, so the
  // speed slider maps linearly onto a resolvable model Re (80 km/h → 60, 160 km/h → 180).
  const RE_MIN = 60, RE_MAX = 180, SPEED_MIN = 80, SPEED_MAX = 160;
  function modelReForSpeed(speedKmh) {
    const s = clamp(speedKmh, SPEED_MIN, SPEED_MAX, 130);
    return Math.round(RE_MIN + (s - SPEED_MIN) * (RE_MAX - RE_MIN) / (SPEED_MAX - SPEED_MIN));
  }

  function normalizeConfig(raw) {
    raw = raw || {};
    const speedKmh = clamp(raw.speedKmh, SPEED_MIN, SPEED_MAX, 130);
    const config = {
      nx: Math.round(clamp(raw.nx, 160, 480, 320)),
      ny: Math.round(clamp(raw.ny, 81, 241, 161)),
      diameterCells: Math.round(clamp(raw.diameterCells, 16, 40, 24)),
      uIn: 0.1,
      speedKmh,
      spinRpm: clamp(raw.spinRpm, -3000, 3000, 0),
      seamHeightMm: clamp(raw.seamHeightMm, 0, 1.5, 0.8),
      seamMagnification: clamp(raw.seamMagnification, 1, 10, 6),
      seamAngleDeg: ((clamp(raw.seamAngleDeg, -36000, 36000, 45) % 360) + 360) % 360,
      seamCount: [1, 2, 4].includes(Number(raw.seamCount)) ? Number(raw.seamCount) : 2,
      // modelReOverride exists for tests/research; the app derives Re from the speed.
      modelRe: raw.modelReOverride !== undefined ? Math.round(clamp(raw.modelReOverride, 40, 200, 120)) : modelReForSpeed(speedKmh),
      kick: raw.kick !== false,
      diameterM: 0.073,
      airViscosityM2s: 1.5e-5,
      fixedOrientation: true
    };
    if (raw.modelReOverride !== undefined) config.modelReOverride = config.modelRe;
    if (config.ny % 2 === 0) config.ny += 1; // odd height keeps the ball exactly on the mirror line
    config.speedMps = config.speedKmh / 3.6;
    config.gridRe = config.modelRe;
    config.viscosity = config.uIn * config.diameterCells / config.gridRe;
    config.tau = 0.5 + 3 * config.viscosity;
    config.tauMinus = 0.5 + MAGIC / (config.tau - 0.5);
    config.realRe = config.speedMps * config.diameterM / config.airViscosityM2s;
    config.spinRatio = (config.spinRpm * 2 * Math.PI / 60) * (config.diameterM / 2) / config.speedMps;
    config.timeStepSeconds = config.uIn * config.diameterM / (config.diameterCells * config.speedMps);
    config.omegaLattice = config.spinRatio * config.uIn / (config.diameterCells / 2);
    config.stepsPerDiameter = config.diameterCells / config.uIn;
    config.warmupSteps = Math.round(4 * config.stepsPerDiameter); // averages start after 4 flow-through diameters
    return config;
  }

  function equilibrium(q, rho, ux, uy) {
    const cu = CX[q] * ux + CY[q] * uy;
    return W[q] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * (ux * ux + uy * uy));
  }

  function createSimulation(raw, variant) {
    const config = normalizeConfig(raw);
    variant = variant === 'seamed' ? 'seamed' : 'smooth';
    const nx = config.nx, ny = config.ny, cells = nx * ny, U = config.uIn, D = config.diameterCells;
    const geometry = {
      cx: Math.round(3.5 * D), cy: (ny - 1) / 2,
      radius: D / 2,
      seamCenters: [], seamRadius: 0, seamHeightCells: 0,
      fixedOrientation: true
    };
    if (variant === 'seamed' && config.seamHeightMm > 0) {
      geometry.seamHeightCells = config.seamHeightMm * config.seamMagnification * D / (config.diameterM * 1000);
      geometry.seamRadius = Math.max(0.75, 1.35 * geometry.seamHeightCells);
      const radial = geometry.radius + geometry.seamHeightCells - geometry.seamRadius;
      for (let i = 0; i < config.seamCount; i++) {
        const angleDeg = config.seamAngleDeg + i * 360 / config.seamCount;
        const angle = angleDeg * Math.PI / 180;
        geometry.seamCenters.push({
          x: geometry.cx + radial * Math.cos(angle),
          y: geometry.cy - radial * Math.sin(angle),
          radius: geometry.seamRadius, angleDeg
        });
      }
    }
    const { cx, cy, radius: R } = geometry;
    const om = config.omegaLattice;

    const solid = new Uint8Array(cells);
    const rho = new Float32Array(cells), ux = new Float32Array(cells), uy = new Float32Array(cells);
    let f = new Float32Array(cells * 9), fNew = new Float32Array(cells * 9);
    const linkCorr = new Float32Array(cells * 9);
    const meanRho = new Float64Array(cells), meanUx = new Float64Array(cells), meanUy = new Float64Array(cells);
    let meanSamples = 0;
    // Force averages are taken over whole vortex-shedding cycles: a band-passed lift signal
    // marks each cycle (upward crossings with hysteresis); partial cycles bias the mean.
    const forces = { fx: 0, fy: 0, sumFx: 0, sumFy: 0, samples: 0, fast: 0, positive: false, marks: [] };
    const hysteresis = 0.02 * 0.5 * U * U * D;
    let steps = 0, stable = true, error = null;

    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const p = y * nx + x, dx = x - cx, dy = y - cy;
        let inside = dx * dx + dy * dy <= R * R;
        for (const seam of geometry.seamCenters) {
          if ((x - seam.x) ** 2 + (y - seam.y) ** 2 <= seam.radius * seam.radius) inside = true;
        }
        solid[p] = inside ? 1 : 0;
      }
    }

    // Initial state: inviscid potential flow around the circle (removes the impulsive-start
    // pressure shock) plus an optional small transverse kick in the near wake, applied
    // identically to both cases, so vortex shedding starts within a few diameters.
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const p = y * nx + x, dx = x - cx, dy = y - cy;
        let vx, vy, density;
        if (solid[p]) {
          // Positive physical spin is counterclockwise on the screen (y grows down).
          vx = om * dy; vy = -om * dx; density = 1;
        } else {
          const X = dx, Y = -dy, r2 = X * X + Y * Y, r4 = r2 * r2, R2 = R * R;
          const u = U * (1 - R2 * (X * X - Y * Y) / r4);
          const v = -U * R2 * 2 * X * Y / r4;
          vx = u; vy = -v;
          if (config.kick) {
            // Divergence-free Lamb–Oseen vortex just off the wake axis (no acoustic pulse).
            const kx = x - (cx + 1.1 * D), ky = y - (cy - 0.3 * D), kr2 = kx * kx + ky * ky, rc2 = (0.35 * D) ** 2;
            const swirl = kr2 > 1e-9 ? 0.6 * U * Math.sqrt(rc2) * (1 - Math.exp(-kr2 / rc2)) / kr2 : 0;
            vx += -swirl * ky; vy += swirl * kx;
          }
          density = 1 + 1.5 * (U * U - vx * vx - vy * vy);
        }
        rho[p] = density; ux[p] = vx; uy[p] = vy;
        for (let q = 0; q < 9; q++) f[p * 9 + q] = equilibrium(q, density, vx, vy);
      }
    }

    // Boundary links: fluid cell p pushing direction q into a solid cell. Halfway bounce-back
    // with moving-wall term; fixed ribs keep only the tangential part of the rotation velocity.
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const p = y * nx + x;
        if (solid[p]) continue;
        for (let q = 1; q < 9; q++) {
          const tx = x + CX[q], ty = y + CY[q];
          if (tx < 0 || tx >= nx || ty < 0 || ty >= ny || !solid[ty * nx + tx]) continue;
          const midX = x + CX[q] * 0.5, midY = y + CY[q] * 0.5;
          const dx = midX - cx, dy = midY - cy;
          let normalX = dx, normalY = dy, distance = Math.hypot(dx, dy) - R;
          for (const seam of geometry.seamCenters) {
            const sx = midX - seam.x, sy = midY - seam.y, sd = Math.hypot(sx, sy) - seam.radius;
            if (sd < distance) { distance = sd; normalX = sx; normalY = sy; }
          }
          const nl = Math.hypot(normalX, normalY) || 1;
          normalX /= nl; normalY /= nl;
          let wx = om * dy, wy = -om * dx;
          const vn = wx * normalX + wy * normalY;
          wx -= vn * normalX; wy -= vn * normalY;
          linkCorr[p * 9 + q] = -6 * W[q] * (CX[q] * wx + CY[q] * wy);
        }
      }
    }

    // Inlet sponge: relaxes outgoing pressure waves toward the free stream so they do not
    // ring between the velocity inlet and the ball.
    const spongeCells = Math.round(0.75 * D), eqFree = new Float64Array(9), sponge = new Float64Array(nx);
    for (let q = 0; q < 9; q++) eqFree[q] = equilibrium(q, 1, U, 0);
    for (let x = 0; x < spongeCells; x++) sponge[x] = 0.3 * ((spongeCells - x) / spongeCells) ** 2;
    const refColumn = spongeCells + 2;

    const post = new Float64Array(9);
    function step(count) {
      count = Math.max(0, Math.min(20000, Math.floor(count === undefined ? 1 : Number(count)) || 0));
      const wp = 1 / config.tau, wm = 1 / config.tauMinus;
      let completed = 0;
      for (let iteration = 0; iteration < count && stable; iteration++) {
        let fx = 0, fy = 0, bad = false;
        for (let y = 0; y < ny; y++) {
          const row = y * nx;
          for (let x = 0; x < nx; x++) {
            const p = row + x;
            if (solid[p]) continue;
            const k = p * 9;
            let f0, f1, f2, f3, f4, f5, f6, f7, f8, d, vx, vy;
            if (x === 0) {
              // Velocity inlet: equilibrium at U with density extrapolated from the interior.
              d = rho[p + 1]; vx = U; vy = 0;
              const u2 = 1.5 * U * U;
              f0 = 4 / 9 * d * (1 - u2);
              f1 = d / 9 * (1 + 3 * U + 4.5 * U * U - u2); f3 = d / 9 * (1 - 3 * U + 4.5 * U * U - u2);
              f2 = f4 = d / 9 * (1 - u2);
              f5 = f8 = d / 36 * (1 + 3 * U + 4.5 * U * U - u2);
              f6 = f7 = d / 36 * (1 - 3 * U + 4.5 * U * U - u2);
            } else {
              f0 = f[k]; f1 = f[k + 1]; f2 = f[k + 2]; f3 = f[k + 3]; f4 = f[k + 4];
              f5 = f[k + 5]; f6 = f[k + 6]; f7 = f[k + 7]; f8 = f[k + 8];
              d = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
              vx = (f1 - f3 + f5 - f6 - f7 + f8) / d;
              vy = (f2 - f4 + f5 + f6 - f7 - f8) / d;
            }
            rho[p] = d; ux[p] = vx; uy[p] = vy;
            if (!(d > 0.5 && d < 1.5) || vx * vx + vy * vy > 0.09) bad = true;
            // TRT collision on the four opposite pairs.
            const u2 = 1.5 * (vx * vx + vy * vy);
            post[0] = f0 - wp * (f0 - 4 / 9 * d * (1 - u2));
            let cu, ep, em, fp, fm;
            cu = vx; ep = d / 9 * (1 + 4.5 * cu * cu - u2); em = d / 9 * 3 * cu;
            fp = 0.5 * (f1 + f3); fm = 0.5 * (f1 - f3);
            post[1] = f1 - wp * (fp - ep) - wm * (fm - em); post[3] = f3 - wp * (fp - ep) + wm * (fm - em);
            cu = vy; ep = d / 9 * (1 + 4.5 * cu * cu - u2); em = d / 9 * 3 * cu;
            fp = 0.5 * (f2 + f4); fm = 0.5 * (f2 - f4);
            post[2] = f2 - wp * (fp - ep) - wm * (fm - em); post[4] = f4 - wp * (fp - ep) + wm * (fm - em);
            cu = vx + vy; ep = d / 36 * (1 + 4.5 * cu * cu - u2); em = d / 36 * 3 * cu;
            fp = 0.5 * (f5 + f7); fm = 0.5 * (f5 - f7);
            post[5] = f5 - wp * (fp - ep) - wm * (fm - em); post[7] = f7 - wp * (fp - ep) + wm * (fm - em);
            cu = -vx + vy; ep = d / 36 * (1 + 4.5 * cu * cu - u2); em = d / 36 * 3 * cu;
            fp = 0.5 * (f6 + f8); fm = 0.5 * (f6 - f8);
            post[6] = f6 - wp * (fp - ep) - wm * (fm - em); post[8] = f8 - wp * (fp - ep) + wm * (fm - em);
            if (x < spongeCells) { const sg = sponge[x]; for (let q = 0; q < 9; q++) post[q] += sg * (eqFree[q] - post[q]); }
            // Push streaming.
            fNew[k] = post[0];
            for (let q = 1; q < 9; q++) {
              const tx = x + CX[q];
              if (tx < 0 || tx >= nx) continue; // leaves through inlet/outlet (both rebuilt below)
              let ty = y + CY[q], tq = q;
              if (ty < 0 || ty >= ny) { ty = y; tq = MIRROR_Y[q]; } // free-slip side walls
              const t = ty * nx + tx;
              if (solid[t]) {
                const back = post[q] + d * linkCorr[k + q];
                fNew[k + OPP[q]] = back;
                fx += CX[q] * (post[q] + back); fy += CY[q] * (post[q] + back);
              } else fNew[t * 9 + tq] = post[q];
            }
          }
        }
        // Zero-gradient open outlet.
        for (let y = 0; y < ny; y++) {
          const k = (y * nx + nx - 1) * 9;
          for (let q = 0; q < 9; q++) fNew[k + q] = fNew[k - 9 + q];
        }
        const swap = f; f = fNew; fNew = swap;
        steps++; completed++;
        forces.fx = fx; forces.fy = fy;
        if (bad) {
          stable = false;
          error = 'Numerical stability limit reached. Reset the simulation or lower the speed.';
          break;
        }
        if (steps === 1) forces.fast = fy;
        forces.fast += (fy - forces.fast) / 80; // removes acoustic jitter, keeps the shedding swing
        if (steps > config.warmupSteps) {
          forces.sumFx += fx; forces.sumFy += fy; forces.samples++;
          const band = forces.fast - forces.sumFy / forces.samples;
          // y grows downward, so an upward lift swing is a negative band value.
          if (!forces.positive && band < -hysteresis) {
            forces.positive = true;
            forces.marks.push({ sumFx: forces.sumFx, sumFy: forces.sumFy, samples: forces.samples });
          } else if (forces.positive && band > hysteresis) forces.positive = false;
          if (steps % 5 === 0) {
            for (let p = 0; p < cells; p++) { meanRho[p] += rho[p]; meanUx[p] += ux[p]; meanUy[p] += uy[p]; }
            meanSamples++;
          }
        }
      }
      return completed;
    }

    function referenceDensity(field) {
      // Free-stream reference: mean density across the column just past the inlet sponge (~2.6 D upstream).
      let s = 0, n = 0;
      for (let y = 0; y < ny; y++) { const p = y * nx + refColumn; if (!solid[p]) { s += field[p]; n++; } }
      return n ? s / n : 1;
    }

    function coefficients() {
      const qD = 0.5 * U * U * D, m = forces.marks;
      let mean = null, cycles = 0, span = 0;
      if (m.length >= 3) {
        // Whole shedding cycles only, skipping the first (start-up transient).
        const a = m[1], b = m[m.length - 1];
        cycles = m.length - 2; span = b.samples - a.samples;
        mean = { cd: (b.sumFx - a.sumFx) / span / qD, cl: -(b.sumFy - a.sumFy) / span / qD };
      } else if (forces.samples > 12 * config.stepsPerDiameter) {
        // No shedding detected over 12 diameters: steady flow, a plain time average is representative.
        span = forces.samples;
        mean = { cd: forces.sumFx / span / qD, cl: -forces.sumFy / span / qD };
      }
      return {
        cd: forces.fx / qD, cl: -forces.fy / qD, // lift positive = up on the screen
        mean, cycles, averagedDiameters: span / config.stepsPerDiameter,
        accumulatingDiameters: forces.samples / config.stepsPerDiameter
      };
    }

    function diagnostics() {
      let minDensity = Infinity, maxDensity = -Infinity, maxSpeed = 0, mass = 0, fluidCells = 0;
      for (let p = 0; p < cells; p++) {
        if (solid[p]) continue;
        minDensity = Math.min(minDensity, rho[p]); maxDensity = Math.max(maxDensity, rho[p]);
        maxSpeed = Math.max(maxSpeed, Math.hypot(ux[p], uy[p])); mass += rho[p]; fluidCells++;
      }
      return { stable, error, minDensity, maxDensity, maxSpeed, mass, fluidCells, steps, tau: config.tau, gridRe: config.gridRe };
    }

    function snapshot() {
      const health = diagnostics();
      const vorticity = new Float32Array(cells), cp = new Float32Array(cells), cpMean = new Float32Array(cells);
      const rhoRef = referenceDensity(rho), scale = 2 / (3 * U * U);
      const mRef = meanSamples ? referenceDensity(meanRho) / meanSamples : rhoRef;
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const p = y * nx + x;
          if (solid[p]) continue;
          // Screen-coordinate curl: d(uy)/dx - d(ux)/dy, fluid-only one-sided differences at walls/edges.
          const hasLeft = x > 0 && !solid[p - 1], hasRight = x < nx - 1 && !solid[p + 1];
          const hasTop = y > 0 && !solid[p - nx], hasBottom = y < ny - 1 && !solid[p + nx];
          const dUyDx = hasLeft && hasRight ? 0.5 * (uy[p + 1] - uy[p - 1])
            : hasRight ? uy[p + 1] - uy[p] : hasLeft ? uy[p] - uy[p - 1] : 0;
          const dUxDy = hasTop && hasBottom ? 0.5 * (ux[p + nx] - ux[p - nx])
            : hasBottom ? ux[p + nx] - ux[p] : hasTop ? ux[p] - ux[p - nx] : 0;
          vorticity[p] = dUyDx - dUxDy;
          cp[p] = scale * (rho[p] - rhoRef);
          cpMean[p] = meanSamples ? scale * (meanRho[p] / meanSamples - mRef) : cp[p];
        }
      }
      const meanSpeed = new Float32Array(cells);
      if (meanSamples) for (let p = 0; p < cells; p++) meanSpeed[p] = Math.hypot(meanUx[p], meanUy[p]) / meanSamples;
      return {
        variant, nx, ny, steps, config, geometry, diagnostics: health,
        ux: new Float32Array(ux), uy: new Float32Array(uy), rho: new Float32Array(rho),
        vorticity, cp, cpMean, meanSpeed, meanSamples, rhoRef, solid: new Uint8Array(solid),
        forces: coefficients()
      };
    }

    return { config, geometry, variant, step, snapshot, diagnostics, coefficients };
  }

  return { normalizeConfig, createSimulation, modelReForSpeed, RE_MIN, RE_MAX };
});
