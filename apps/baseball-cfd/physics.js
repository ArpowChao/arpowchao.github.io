/* D2Q9 BGK lattice Boltzmann flow around a circular cross-section.
 * Geometry stays fixed; spin sets a tangential moving-wall velocity.
 * Raised seam ribs are deliberately magnified to resolve them on this grid.
 * This is a low-Re 2D educational CFD model, not a 3D baseball prediction.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BaseballCFD = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const CX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
  const CY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
  const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
  const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
  const clamp = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : fallback));

  function normalizeConfig(raw) {
    raw = raw || {};
    const config = {
      nx: Math.round(clamp(raw.nx, 192, 384, 288)),
      ny: Math.round(clamp(raw.ny, 112, 208, 144)),
      diameterCells: Math.round(clamp(raw.diameterCells, 30, 48, 44)),
      uIn: 0.055,
      speedKmh: clamp(raw.speedKmh, 80, 160, 145),
      spinRpm: clamp(raw.spinRpm, -3000, 3000, 0),
      seamHeightMm: clamp(raw.seamHeightMm, 0, 1.5, 0.8),
      seamMagnification: clamp(raw.seamMagnification, 1, 10, 6),
      seamAngleDeg: ((clamp(raw.seamAngleDeg, -36000, 36000, 45) % 360) + 360) % 360,
      seamCount: Number(raw.seamCount) === 4 ? 4 : 2,
      modelRe: clamp(raw.modelRe, 60, 160, 120),
      diameterM: 0.073,
      airViscosityM2s: 1.5e-5,
      fixedOrientation: true
    };
    config.speedMps = config.speedKmh / 3.6;
    config.gridRe = config.modelRe;
    config.viscosity = config.uIn * config.diameterCells / config.gridRe;
    config.tau = 0.5 + 3 * config.viscosity;
    config.realRe = config.speedMps * config.diameterM / config.airViscosityM2s;
    config.spinRatio = (config.spinRpm * 2 * Math.PI / 60) * (config.diameterM / 2) / config.speedMps;
    config.timeStepSeconds = config.uIn * config.diameterM / (config.diameterCells * config.speedMps);
    config.omegaLattice = config.spinRatio * config.uIn / (config.diameterCells / 2);
    return config;
  }

  function equilibrium(q, rho, ux, uy) {
    const cu = CX[q] * ux + CY[q] * uy;
    return W[q] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * (ux * ux + uy * uy));
  }

  function createSimulation(raw, variant) {
    const config = normalizeConfig(raw);
    variant = variant === 'seamed' ? 'seamed' : 'smooth';
    const nx = config.nx, ny = config.ny, cells = nx * ny;
    const geometry = {
      cx: Math.round(nx * 0.29), cy: Math.floor(ny / 2),
      radius: config.diameterCells / 2,
      seamCenters: [], seamRadius: 0, seamHeightCells: 0,
      fixedOrientation: true
    };
    if (variant === 'seamed' && config.seamHeightMm > 0) {
      geometry.seamHeightCells = config.seamHeightMm * config.seamMagnification * config.diameterCells / (config.diameterM * 1000);
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

    const solid = new Uint8Array(cells);
    const wallX = new Float32Array(cells), wallY = new Float32Array(cells);
    const rho = new Float32Array(cells), ux = new Float32Array(cells), uy = new Float32Array(cells);
    let populations = new Float32Array(cells * 9);
    let postCollision = new Float32Array(cells * 9);
    const inlet = new Float32Array(9);
    const wallCorrection = new Float32Array(cells * 9);
    let steps = 0, stable = true, error = null;
    for (let q = 0; q < 9; q++) inlet[q] = equilibrium(q, 1, config.uIn, 0);

    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const p = y * nx + x;
        const dx = x - geometry.cx, dy = y - geometry.cy;
        let inside = dx * dx + dy * dy <= geometry.radius * geometry.radius;
        for (const seam of geometry.seamCenters) {
          if ((x - seam.x) ** 2 + (y - seam.y) ** 2 <= seam.radius * seam.radius) inside = true;
        }
        solid[p] = inside ? 1 : 0;
        // Positive physical spin is counterclockwise on the screen (y grows down).
        wallX[p] = config.omegaLattice * dy;
        wallY[p] = -config.omegaLattice * dx;
        rho[p] = 1;
        ux[p] = inside ? wallX[p] : config.uIn;
        uy[p] = inside ? wallY[p] : 0;
        for (let q = 0; q < 9; q++) populations[p * 9 + q] = inlet[q];
      }
    }

    // Precompute boundary-link velocities. A rotating circular surface is already
    // tangent to the geometry; fixed ribs require removing the local normal
    // component, otherwise a stationary bump would spuriously inject fluid.
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const p = y * nx + x;
        if (solid[p]) continue;
        for (let q = 1; q < 9; q++) {
          if (!solid[(y - CY[q]) * nx + x - CX[q]]) continue;
          const midX = x - CX[q] * 0.5, midY = y - CY[q] * 0.5;
          const dx = midX - geometry.cx, dy = midY - geometry.cy;
          let normalX = dx, normalY = dy;
          let distance = Math.hypot(dx, dy) - geometry.radius;
          for (const seam of geometry.seamCenters) {
            const sx = midX - seam.x, sy = midY - seam.y;
            const seamDistance = Math.hypot(sx, sy) - seam.radius;
            if (seamDistance < distance) {
              distance = seamDistance; normalX = sx; normalY = sy;
            }
          }
          const normalLength = Math.hypot(normalX, normalY) || 1;
          normalX /= normalLength; normalY /= normalLength;
          let wx = config.omegaLattice * dy, wy = -config.omegaLattice * dx;
          const normalVelocity = wx * normalX + wy * normalY;
          wx -= normalVelocity * normalX; wy -= normalVelocity * normalY;
          wallCorrection[p * 9 + q] = 6 * W[q] * (CX[q] * wx + CY[q] * wy);
        }
      }
    }

    function updateMacros(checkStability) {
      for (let p = 0; p < cells; p++) {
        if (solid[p]) continue;
        const k = p * 9;
        const f0 = populations[k], f1 = populations[k + 1], f2 = populations[k + 2];
        const f3 = populations[k + 3], f4 = populations[k + 4], f5 = populations[k + 5];
        const f6 = populations[k + 6], f7 = populations[k + 7], f8 = populations[k + 8];
        const density = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
        const vx = (f1 - f3 + f5 - f6 - f7 + f8) / density;
        const vy = (f2 - f4 + f5 + f6 - f7 - f8) / density;
        rho[p] = density; ux[p] = vx; uy[p] = vy;
        if (checkStability && (!Number.isFinite(density) || density < 0.4 || density > 1.6 || vx * vx + vy * vy > 0.2025)) {
          stable = false;
          error = 'Numerical stability limit reached. Reset the simulation or lower the model Reynolds number.';
          return false;
        }
      }
      return true;
    }

    function step(count) {
      count = Math.max(0, Math.min(10000, Math.floor(count === undefined ? 1 : Number(count)) || 0));
      const relaxation = 1 / config.tau;
      let completed = 0;
      for (let iteration = 0; iteration < count && stable; iteration++) {
        if (!updateMacros(true)) break;
        for (let p = 0; p < cells; p++) {
          if (solid[p]) continue;
          const k = p * 9, density = rho[p], vx = ux[p], vy = uy[p];
          const base = 1 - 1.5 * (vx * vx + vy * vy);
          for (let q = 0; q < 9; q++) {
            const cu = CX[q] * vx + CY[q] * vy;
            const eq = W[q] * density * (base + 3 * cu + 4.5 * cu * cu);
            postCollision[k + q] = populations[k + q] + relaxation * (eq - populations[k + q]);
          }
        }
        // Pull streaming and halfway bounce-back. At a moving wall, the reflected
        // population receives 2*w*rho*(c_i . u_wall)/cs^2, cs^2=1/3.
        for (let y = 0; y < ny; y++) {
          for (let x = 0; x < nx; x++) {
            const p = y * nx + x;
            if (solid[p]) continue;
            const k = p * 9;
            if (x === 0 || y === 0 || y === ny - 1) {
              for (let q = 0; q < 9; q++) populations[k + q] = inlet[q];
              continue;
            }
            for (let q = 0; q < 9; q++) {
              const sx = x - CX[q], sy = y - CY[q];
              if (sx >= nx) {
                populations[k + q] = postCollision[(p - 1) * 9 + q];
                continue;
              }
              const neighbor = sy * nx + sx;
              if (solid[neighbor]) {
                populations[k + q] = postCollision[k + OPP[q]] + rho[p] * wallCorrection[k + q];
              } else {
                populations[k + q] = postCollision[neighbor * 9 + q];
              }
            }
          }
        }
        // Zero-gradient open outlet (all populations copied from its upstream cell).
        for (let y = 1; y < ny - 1; y++) {
          const k = (y * nx + nx - 1) * 9;
          for (let q = 0; q < 9; q++) populations[k + q] = populations[k - 9 + q];
        }
        steps++; completed++;
      }
      return completed;
    }

    function diagnostics() {
      updateMacros(true);
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
      const vorticity = new Float32Array(cells), cp = new Float32Array(cells);
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const p = y * nx + x;
          if (solid[p]) continue;
          // Screen-coordinate curl: d(uy)/dx - d(ux)/dy. Near solid cells,
          // use fluid-only one-sided differences, including at domain edges;
          // fictitious solid velocities must not contribute to fluid curl.
          const hasLeft = x > 0 && !solid[p - 1], hasRight = x < nx - 1 && !solid[p + 1];
          const hasTop = y > 0 && !solid[p - nx], hasBottom = y < ny - 1 && !solid[p + nx];
          const dUyDx = hasLeft && hasRight ? 0.5 * (uy[p + 1] - uy[p - 1])
            : hasRight ? uy[p + 1] - uy[p] : hasLeft ? uy[p] - uy[p - 1] : 0;
          const dUxDy = hasTop && hasBottom ? 0.5 * (ux[p + nx] - ux[p - nx])
            : hasBottom ? ux[p + nx] - ux[p] : hasTop ? ux[p] - ux[p - nx] : 0;
          vorticity[p] = dUyDx - dUxDy;
          cp[p] = 2 * (rho[p] - 1) / (3 * config.uIn * config.uIn);
        }
      }
      return {
        variant, nx, ny, steps, config, geometry, diagnostics: health,
        ux: new Float32Array(ux), uy: new Float32Array(uy), rho: new Float32Array(rho),
        vorticity, cp, solid: new Uint8Array(solid)
      };
    }

    return { config, geometry, variant, step, snapshot, diagnostics };
  }

  return { normalizeConfig, createSimulation };
});
