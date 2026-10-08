/* Render and inspect actual paired 2-D LBM solutions produced by worker.js. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CFD = window.BaseballCFD;
  const DEFAULTS = { speedKmh: 130, spinRpm: 1800, seamHeightMm: .8, seamAngleDeg: 35, seamCount: 2, seamMagnification: 6 };
  const controls = { speed: 'speedKmh', spin: 'spinRpm', 'seam-height': 'seamHeightMm', 'seam-angle': 'seamAngleDeg' };
  const state = { config: { ...DEFAULTS }, field: 'smoke', running: true, streamlines: true, average: false, arrows: true, generation: 0, ready: false, error: '' };
  let worker, frame = null, configureTimer, drawPending = false;
  const rasters = new Map();
  const ema = { smooth: null, seamed: null };
  const speedStops = [[0, [17, 44, 59]], [.25, [36, 97, 110]], [.5, [86, 168, 153]], [.75, [218, 211, 126]], [1, [237, 153, 99]]];
  const pressureStops = [[0, [71, 127, 195]], [.5, [228, 231, 220]], [1, [199, 94, 79]]];
  const vorticityStops = [[0, [94, 137, 181]], [.5, [19, 47, 55]], [1, [237, 154, 103]]];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const signed = (v, d = 2) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(d)}`;
  const derived = () => CFD.normalizeConfig(state.config);

  function colorAt(stops, value) {
    const v = clamp(value, 0, 1);
    for (let k = 1; k < stops.length; k++) {
      if (v <= stops[k][0]) {
        const a = stops[k - 1], b = stops[k], t = (v - a[0]) / (b[0] - a[0]);
        return a[1].map((c, j) => Math.round(c + (b[1][j] - c) * t));
      }
    }
    return stops.at(-1)[1];
  }
  const palettes = {
    speed: Array.from({ length: 256 }, (_, i) => colorAt(speedStops, i / 255)),
    pressure: Array.from({ length: 256 }, (_, i) => colorAt(pressureStops, i / 255)),
    vorticity: Array.from({ length: 256 }, (_, i) => colorAt(vorticityStops, i / 255))
  };

  function spinText(rpm) {
    if (rpm < 0) return '↻ 順時針（後旋）：球頂向右轉，升力向上';
    if (rpm > 0) return '↺ 逆時針（上旋）：球頂向左轉，升力向下';
    return '○ 不旋轉，只觀察表面幾何';
  }

  function updateLabels() {
    const c = state.config, d = derived();
    $('speed-output').innerHTML = `${c.speedKmh} <small>km/h</small>`;
    $('spin-output').innerHTML = `${c.spinRpm < 0 ? '−' : ''}${Math.abs(c.spinRpm)} <small>rpm</small>`;
    $('seam-height-output').innerHTML = `${c.seamHeightMm.toFixed(1)} <small>mm</small>`;
    $('seam-angle-output').innerHTML = `${c.seamAngleDeg} <small>°</small>`;
    $('re-hint').textContent = `模型 Re = ${d.modelRe}：球速越快，黏性的影響越小，尾流越容易左右擺動。`;
    const direction = c.spinRpm > 0 ? '↺' : c.spinRpm < 0 ? '↻' : '○';
    $('spin-direction').textContent = spinText(c.spinRpm);
    document.querySelectorAll('.spin-label').forEach((el) => { el.textContent = `${direction} ${Math.abs(c.spinRpm)} rpm${c.spinRpm < 0 ? ' 後旋' : c.spinRpm > 0 ? ' 上旋' : ''}`; });
    $('seam-detail').textContent = c.seamHeightMm === 0 ? '0 mm · 光滑表面' : `${c.seamCount} 處 · 放大 6×`;
    $('model-re').innerHTML = `${d.modelRe} <small>模型</small>`;
    $('real-re').textContent = `真球約 ${(d.realRe / 1e5).toFixed(2)} × 10⁵（D = 73 mm）`;
    $('spin-ratio').textContent = `${d.spinRatio < 0 ? '−' : ''}${Math.abs(d.spinRatio).toFixed(3)}`;
    $('toggle-run').textContent = state.running ? '暫停' : '繼續';
    $('toggle-run').disabled = !state.ready || !!state.error;
    $('step').disabled = state.running || !state.ready || !!state.error;
    $('export-csv').disabled = !frame || !!state.error;
  }

  function updateLegend() {
    const names = { smoke: ['', '', '白色煙線：從左側噴嘴連續釋放，隨數值流場漂流'], speed: ['0', '≥ 2.0', '流速 / 來流速度 U'], pressure: ['≤ −2', '≥ +2', '壓力係數 Cp'], vorticity: ['≤ −12', '≥ +12', '渦度 × D / U'] };
    const [min, max, label] = names[state.field];
    $('legend-min').textContent = min;
    $('legend-max').textContent = max;
    $('legend-label').textContent = label + (state.average && (state.field === 'speed' || state.field === 'pressure') ? '（時間平均）' : '');
    $('color-scale').className = `color-scale ${state.field}-scale`;
    $('color-scale').hidden = state.field === 'smoke';
    document.querySelectorAll('[data-field]').forEach((button) => {
      const active = button.dataset.field === state.field;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function clearForces() {
    ema.smooth = ema.seamed = null;
    for (const id of ['cl-smooth', 'cd-smooth', 'cl-seamed', 'cd-seamed']) $(id).textContent = '—';
    $('avg-span').textContent = '（累積中）';
  }

  function configure() {
    clearTimeout(configureTimer);
    if (!worker) return;
    state.generation++;
    frame = null;
    state.ready = false;
    state.error = '';
    rasters.clear(); clearForces(); resetSmoke();
    $('steps-label').textContent = '0 步';
    $('status-text').textContent = '重建幾何，重新開始演算…';
    $('status-dot').style.background = '#b19c65';
    updateLabels();
    scheduleDraw();
    worker.postMessage({ type: 'configure', generation: state.generation, config: state.config, running: state.running && !document.hidden });
  }

  function queueConfigure() {
    clearTimeout(configureTimer);
    state.generation++;
    frame = null;
    state.ready = false;
    rasters.clear(); clearForces();
    $('steps-label').textContent = '0 步';
    $('status-text').textContent = '條件已改變，準備重新演算…';
    updateLabels();
    scheduleDraw();
    configureTimer = setTimeout(configure, 160);
  }

  function fail(message) {
    state.error = message;
    state.running = false;
    state.ready = false;
    $('status-text').textContent = message;
    $('status-dot').style.background = '#c76550';
    $('observation-title').textContent = '數值風洞已停止';
    $('observation-text').textContent = '可嘗試重設條件。此頁需透過 HTTP 網站載入，並使用支援 Web Worker 的瀏覽器。';
    updateLabels();
  }

  function forceFor(solution) {
    const f = solution.forces, e = ema[solution.variant];
    const useMean = !!f.mean;
    return useMean ? { cl: f.mean.cl, cd: f.mean.cd, mean: true } : e ? { cl: e.cl, cd: e.cd, mean: false } : null;
  }

  function updateDiagnostics() {
    if (!frame) return;
    const a = frame.smooth, b = frame.seamed, c = a.config;
    const stable = a.diagnostics.stable && b.diagnostics.stable;
    if (!stable) { fail('數值穩定性檢查未通過，已停止演算；請重設條件。'); return; }
    for (const s of [a, b]) {
      const prev = ema[s.variant], k = .25;
      ema[s.variant] = prev ? { cl: prev.cl + k * (s.forces.cl - prev.cl), cd: prev.cd + k * (s.forces.cd - prev.cd) } : { cl: s.forces.cl, cd: s.forces.cd };
    }
    const passes = a.steps / c.stepsPerDiameter, averaged = a.forces.averagedDiameters, cycles = a.forces.cycles;
    $('steps-label').textContent = `${a.steps.toLocaleString('en-US')} 步`;
    $('status-dot').style.background = state.running ? '#438b65' : '#b19c65';
    $('status-text').textContent = `${state.running ? '演算中' : '已暫停'} · 模型 Re ${c.modelRe} · 氣流經過 ${passes.toFixed(1)} 個球徑${a.forces.mean ? (cycles ? ` · 已平均 ${cycles} 個渦旋週期` : ' · 穩定流，已平均') : passes > 4 ? ' · 平均累積中' : ''} · 兩側同步`;
    $('grid-label').textContent = `${a.nx} × ${a.ny} 格點 / 每側 · D2Q9 TRT · τ = ${c.tau.toFixed(3)}`;
    const noSeam = c.seamHeightMm === 0;
    if (a.forces.mean) {
      $('cl-smooth').textContent = signed(a.forces.mean.cl); $('cd-smooth').textContent = a.forces.mean.cd.toFixed(2);
      $('cl-seamed').textContent = signed(b.forces.mean.cl); $('cd-seamed').textContent = b.forces.mean.cd.toFixed(2);
      $('avg-span').textContent = cycles ? `（${cycles} 個完整渦旋週期）` : `（穩定流，${averaged.toFixed(0)} 球徑）`;
    } else {
      $('cl-smooth').textContent = $('cd-smooth').textContent = $('cl-seamed').textContent = $('cd-seamed').textContent = '—';
      $('avg-span').textContent = passes < 4 ? `（${Math.max(0, 4 - passes).toFixed(1)} 球徑後開始累積）` : '（等待完整的渦旋週期…）';
    }
    const clS = a.forces.mean ? a.forces.mean.cl : null, clB = b.forces.mean ? b.forces.mean.cl : null;
    if (noSeam) {
      $('observation-title').textContent = '縫線高度為 0，兩側回到相同流場';
      $('observation-text').textContent = '這是對照檢查：相同幾何、邊界和初始條件，得到完全相同的數值解。' + (c.spinRpm === 0 ? '沒有旋轉時，渦旋上下交替脫落，平均升力接近 0。' : '兩側的升力只來自旋轉（馬格努斯效應）。');
    } else if (passes < 4 || !a.forces.mean) {
      $('observation-title').textContent = '氣流正在建立，等尾流開始擺動';
      $('observation-text').textContent = '前幾個球徑是起始的暫態。之後球後方的渦旋會一上一下交替脫落（卡門渦街），升力也跟著上下擺動；平均的力只取完整的擺動週期，才不會偏向某一邊。';
    } else if (c.spinRpm !== 0) {
      const up = c.spinRpm < 0;
      $('observation-title').textContent = up ? '後旋：下方流速慢、上方流速快，球被往上推' : '上旋：上方流速慢、下方流速快，球被往下壓';
      $('observation-text').textContent = `旋轉的表面帶著空氣走：與來流同向的一側流速變快、壓力變低，另一側相反，壓力差把球推向低壓側（馬格努斯效應）。打開「時間平均」可看到尾流整體${up ? '往下' : '往上'}偏，反作用力把球${up ? '往上' : '往下'}推。${clS !== null ? `目前平均升力：光滑 ${signed(clS)}、縫線 ${signed(clB)}。` : ''}`;
    } else {
      $('observation-title').textContent = '沒有旋轉，縫線位置也能讓尾流偏向一側';
      $('observation-text').textContent = `光滑球的渦旋上下對稱交替脫落，平均升力約為 0；凸起的縫線會改變它那一側的氣流分離位置，讓尾流偏移、產生側向力（縫線偏移尾流的二維類比）。試試「單側縫線」，並打開「時間平均」比較兩邊的尾流。${clS !== null ? `目前平均升力：光滑 ${signed(clS)}、縫線 ${signed(clB)}。` : ''}`;
    }
    updateLabels();
  }

  function setupCanvas(canvas) {
    const width = canvas.clientWidth || 480, height = canvas.clientHeight || 240;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
  }

  // Display window: crop the inlet sponge and far edges so the ball reads larger.
  function viewWindow(solution, width, height) {
    const g = solution.geometry, D = solution.config.diameterCells;
    const x0 = Math.max(0, g.cx - 2.2 * D), x1 = solution.nx - 2;
    const half = Math.min(solution.ny / 2, (x1 - x0) * height / width / 2);
    return { x0, x1, y0: g.cy - half, y1: g.cy + half };
  }

  function insideBump(solution, x, y) {
    const { cx, cy, radius } = solution.geometry;
    return (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2;
  }

  function fieldRaster(solution) {
    const avg = state.average && solution.meanSamples > 0 && state.field !== 'vorticity';
    const key = `${solution.variant}-${state.field}-${avg}`;
    let raster = rasters.get(key);
    if (raster && raster.steps === solution.steps) return raster.canvas;
    if (!raster) {
      const canvas = document.createElement('canvas');
      canvas.width = solution.nx; canvas.height = solution.ny;
      raster = { canvas, steps: -1 }; rasters.set(key, raster);
    }
    const ctx = raster.canvas.getContext('2d');
    const data = ctx.createImageData(solution.nx, solution.ny);
    const colors = palettes[state.field], c = solution.config;
    const { cx, cy, radius } = solution.geometry;
    for (let p = 0; p < solution.nx * solution.ny; p++) {
      let rgb;
      if (solution.solid[p]) {
        const x = p % solution.nx, y = Math.floor(p / solution.nx);
        const light = 1 - .12 * ((x - cx + y - cy) / (2 * radius) + 1);
        rgb = insideBump(solution, x, y) ? [205, 126, 95] : [239 * light, 237 * light, 215 * light];
      } else {
        let value;
        if (state.field === 'speed') value = (avg ? solution.meanSpeed[p] : Math.hypot(solution.ux[p], solution.uy[p])) / c.uIn / 2;
        else if (state.field === 'pressure') value = ((avg ? solution.cpMean[p] : solution.cp[p]) + 2) / 4;
        else value = (solution.vorticity[p] * c.diameterCells / c.uIn + 12) / 24;
        rgb = colors[Math.round(clamp(value, 0, 1) * 255)];
      }
      data.data[p * 4] = rgb[0]; data.data[p * 4 + 1] = rgb[1]; data.data[p * 4 + 2] = rgb[2]; data.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    raster.steps = solution.steps;
    return raster.canvas;
  }

  function sample(solution, x, y) {
    if (x < 1 || y < 1 || x >= solution.nx - 2 || y >= solution.ny - 2) return null;
    const i = Math.floor(x), j = Math.floor(y), p = j * solution.nx + i;
    const ids = [p, p + 1, p + solution.nx, p + solution.nx + 1];
    if (ids.some((id) => solution.solid[id])) return null;
    const fx = x - i, fy = y - j, w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    return { ux: ids.reduce((sum, id, k) => sum + solution.ux[id] * w[k], 0), uy: ids.reduce((sum, id, k) => sum + solution.uy[id] * w[k], 0) };
  }

  function drawStreamlines(ctx, solution, scale) {
    ctx.strokeStyle = state.field === 'pressure' ? '#203d4655' : '#edf4de65';
    ctx.lineWidth = Math.max(.45, .55 / scale);
    ctx.lineCap = 'round';
    for (let y0 = 4; y0 < solution.ny - 4; y0 += 6) {
      let x = Math.max(2, solution.geometry.cx - 2.2 * solution.config.diameterCells), y = y0;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 480; k++) {
        const v = sample(solution, x, y);
        if (!v) break;
        const speed = Math.hypot(v.ux, v.uy);
        if (speed < .003) break;
        // Midpoint step along the calculated instantaneous velocity (streamlines, not particle paths).
        const mid = sample(solution, x + .5 * v.ux / speed, y + .5 * v.uy / speed);
        if (!mid) break;
        const m = Math.hypot(mid.ux, mid.uy);
        if (m < .003) break;
        const nextX = x + mid.ux / m, nextY = y + mid.uy / m;
        if (!sample(solution, nextX, nextY)) break;
        x = nextX; y = nextY; ctx.lineTo(x, y);
        if (k % 60 === 30) {
          const angle = Math.atan2(mid.uy, mid.ux), len = 2;
          ctx.moveTo(x - len * Math.cos(angle - .45), y - len * Math.sin(angle - .45));
          ctx.lineTo(x, y);
          ctx.lineTo(x - len * Math.cos(angle + .45), y - len * Math.sin(angle + .45));
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  // ---- Smoke wind tunnel: passive tracers released from an upstream rake and advected by
  // the latest solved velocity field (streaklines, like a real smoke tunnel). ----
  const smoke = { smooth: null, seamed: null, rate: 0, lastSteps: null, lastTime: 0, spin: 0 };
  function resetSmoke() { smoke.smooth = smoke.seamed = null; smoke.lastSteps = null; smoke.rate = 0; }
  function smokeState(solution) {
    let sm = smoke[solution.variant];
    if (!sm) {
      const g = solution.geometry, D = solution.config.diameterCells, nozzles = [];
      for (let y = g.cy - 2.4 * D; y <= g.cy + 2.4 * D + .01; y += D / 7) nozzles.push(y);
      sm = smoke[solution.variant] = { x: new Float32Array(30000), y: new Float32Array(30000), age: new Float32Array(30000), n: 0, nozzles, carry: 0, rakeX: g.cx - 2 * D };
      // Pre-fill the tunnel with straight smoke lines so the view is never empty; the solved flow bends them.
      for (const ny of nozzles) {
        for (let x = sm.rakeX; x < solution.nx - 3 && sm.n < sm.x.length; x += .5) {
          const p = Math.round(ny) * solution.nx + Math.round(x);
          if (solution.solid[p] || (x - g.cx) ** 2 + (ny - g.cy) ** 2 < (g.radius + 1) ** 2) continue;
          sm.x[sm.n] = x; sm.y[sm.n] = ny; sm.age[sm.n] = 0; sm.n++;
        }
      }
    }
    return sm;
  }
  function advanceSmoke(solution, steps) {
    const sm = smokeState(solution), U = solution.config.uIn;
    // Emit one puff per nozzle every 0.5 cell of free-stream travel.
    sm.carry += steps * U;
    while (sm.carry >= .5) {
      sm.carry -= .5;
      for (const ny of sm.nozzles) {
        if (sm.n >= sm.x.length) break;
        sm.x[sm.n] = sm.rakeX + sm.carry; sm.y[sm.n] = ny; sm.age[sm.n] = 0; sm.n++;
      }
    }
    const sub = Math.max(1, Math.ceil(steps * U * 2.5)), h = steps / sub;
    let w = 0;
    for (let i = 0; i < sm.n; i++) {
      let x = sm.x[i], y = sm.y[i], alive = true;
      for (let s = 0; s < sub; s++) {
        const v = sample(solution, x, y);
        if (!v) { alive = false; break; }
        const m = sample(solution, x + .5 * h * v.ux, y + .5 * h * v.uy);
        if (!m) { alive = false; break; }
        x += h * m.ux; y += h * m.uy;
      }
      if (!alive || x > solution.nx - 3) continue;
      sm.x[w] = x; sm.y[w] = y; sm.age[w] = sm.age[i] + steps; w++;
    }
    sm.n = w;
  }
  function drawSmoke(ctx, solution, scale) {
    ctx.fillStyle = '#0d2128'; ctx.fillRect(0, 0, solution.nx, solution.ny);
    const sm = smokeState(solution), r = Math.max(.32, .9 / scale);
    ctx.fillStyle = '#f3f1e6';
    ctx.globalAlpha = .55;
    for (let i = 0; i < sm.n; i++) ctx.fillRect(sm.x[i] - r, sm.y[i] - r, 2 * r, 2 * r);
    ctx.globalAlpha = 1;
    // nozzle rake
    ctx.fillStyle = '#6f8b86';
    for (const ny of sm.nozzles) ctx.fillRect(sm.rakeX - 2.2, ny - .45, 2, .9);
  }
  function drawSpinMarks(ctx, solution) {
    const g = solution.geometry, om = solution.config.omegaLattice;
    if (!om) return;
    const a0 = smoke.spin, R = g.radius * .62;
    ctx.strokeStyle = '#b9b29a'; ctx.lineWidth = .7;
    for (let k = 0; k < 3; k++) {
      const a = a0 + k * 2 * Math.PI / 3;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, R, -a - .5, -a + .5); ctx.stroke();
    }
  }

  function arrow(ctx, x0, y0, x1, y1, color, width, head) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * head * .6, y1 - Math.sin(a) * head * .6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(a - .5), y1 - head * Math.sin(a - .5));
    ctx.lineTo(x1 - head * Math.cos(a + .5), y1 - head * Math.sin(a + .5)); ctx.closePath(); ctx.fill();
  }

  function drawForces(ctx, solution) {
    const force = forceFor(solution);
    if (!force) return;
    const g = solution.geometry, R = g.radius;
    // Drag (to the right) and lift (up = negative screen y); lengths in ball radii per unit coefficient.
    const dragLen = clamp(force.cd, 0, 3) * R * .9, liftLen = clamp(force.cl, -2.5, 2.5) * R * 1.4;
    ctx.save();
    ctx.globalAlpha = force.mean ? 1 : .75;
    if (dragLen > 1) arrow(ctx, g.cx + R + 1, g.cy, g.cx + R + 1 + dragLen, g.cy, '#e6e2cf', 1.1, 3.2);
    if (Math.abs(liftLen) > 1.2) {
      const y0 = g.cy - Math.sign(liftLen) * (R + 1);
      arrow(ctx, g.cx, y0, g.cx, y0 - liftLen, '#ffd36b', 1.6, 4);
      ctx.fillStyle = '#ffd36b'; ctx.font = '600 5.5px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`升力 ${signed(force.cl)}${force.mean ? '' : '（瞬時）'}`, g.cx + 3, y0 - liftLen * .55);
    }
    ctx.restore();
  }

  function drawScene(canvas, solution) {
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.fillStyle = '#15343c'; ctx.fillRect(0, 0, width, height);
    if (!solution) {
      ctx.fillStyle = '#a0b7ae'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(state.error ? '數值風洞尚未啟動' : '建立流體格點中…', width / 2, height / 2);
      return;
    }
    const view = viewWindow(solution, width, height);
    const scale = Math.min(width / (view.x1 - view.x0), height / (view.y1 - view.y0));
    ctx.save();
    ctx.translate((width - (view.x1 - view.x0) * scale) / 2 - view.x0 * scale, (height - (view.y1 - view.y0) * scale) / 2 - view.y0 * scale);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    if (state.field === 'smoke') drawSmoke(ctx, solution, scale);
    else {
      ctx.drawImage(fieldRaster(solution), 0, 0);
      if (state.streamlines) drawStreamlines(ctx, solution, scale);
    }
    const g = solution.geometry;
    if (state.field === 'smoke') {
      const grad = ctx.createRadialGradient(g.cx - g.radius * .35, g.cy - g.radius * .4, 1, g.cx, g.cy, g.radius);
      grad.addColorStop(0, '#fffef6'); grad.addColorStop(1, '#cfcab6');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2); ctx.fill();
      for (const seam of g.seamCenters) { ctx.fillStyle = '#d0644c'; ctx.beginPath(); ctx.arc(seam.x, seam.y, seam.radius, 0, Math.PI * 2); ctx.fill(); }
      drawSpinMarks(ctx, solution);
    }
    ctx.lineWidth = .5; ctx.strokeStyle = '#fcfae48c';
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2); ctx.stroke();
    // Outline each solved seam bump where it actually protrudes from the surface.
    for (const seam of g.seamCenters) {
      ctx.strokeStyle = '#ffb59a'; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.arc(seam.x, seam.y, seam.radius + .3, 0, Math.PI * 2); ctx.stroke();
    }
    if (state.arrows) drawForces(ctx, solution);
    const D = solution.config.diameterCells;
    ctx.strokeStyle = '#75999299'; ctx.lineWidth = .6;
    const bx = view.x0 + 6, by = view.y1 - 9;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + D, by);
    ctx.moveTo(bx, by - 2); ctx.lineTo(bx, by + 2);
    ctx.moveTo(bx + D, by - 2); ctx.lineTo(bx + D, by + 2); ctx.stroke();
    ctx.fillStyle = '#d0e0cf'; ctx.font = '4.5px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('1D · 球徑', bx + D / 2, by + 6);
    ctx.restore();
  }

  function pressureSamples(solution, field) {
    const g = solution.geometry, points = [];
    for (let degree = 0; degree <= 360; degree += 5) {
      const t = degree * Math.PI / 180, dx = Math.cos(t), dy = -Math.sin(t);
      let radius = g.radius;
      for (const seam of g.seamCenters) {
        const sx = seam.x - g.cx, sy = seam.y - g.cy;
        const projection = sx * dx + sy * dy;
        const perpendicular2 = sx * sx + sy * sy - projection * projection;
        if (projection > 0 && perpendicular2 <= seam.radius * seam.radius) radius = Math.max(radius, projection + Math.sqrt(Math.max(0, seam.radius * seam.radius - perpendicular2)));
      }
      const x = Math.round(g.cx + (radius + 1.5) * dx), y = Math.round(g.cy + (radius + 1.5) * dy);
      const p = y * solution.nx + x;
      points.push({ degree, value: solution.solid[p] ? null : field[p] });
    }
    return points;
  }

  function drawPressureChart() {
    const { ctx, width, height } = setupCanvas($('pressure-chart'));
    const margin = { left: 42, right: 10, top: 13, bottom: 26 };
    const pw = width - margin.left - margin.right, ph = height - margin.top - margin.bottom;
    const has = !!frame, hasMean = has && frame.smooth.meanSamples > 0;
    const instant = has ? [pressureSamples(frame.smooth, frame.smooth.cp), pressureSamples(frame.seamed, frame.seamed.cp)] : [];
    const mean = hasMean ? [pressureSamples(frame.smooth, frame.smooth.cpMean), pressureSamples(frame.seamed, frame.seamed.cpMean)] : [];
    const top = 1.5, bottom = -3;
    const xx = (degree) => margin.left + degree / 360 * pw;
    const yy = (cp) => margin.top + (top - clamp(cp, bottom - .2, top + .2)) / (top - bottom) * ph;
    ctx.font = '9px Inter, sans-serif'; ctx.lineWidth = 1;
    for (const value of [1, 0, -1, -2, -3]) {
      const y = yy(value);
      ctx.strokeStyle = value === 0 ? '#bfcabc' : '#e8ece3';
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
      ctx.fillStyle = '#839082'; ctx.textAlign = 'right'; ctx.fillText(String(value), margin.left - 8, y + 3);
    }
    for (const [degree, label] of [[0, '0° 後方'], [90, '90° 上方'], [180, '180° 正前方'], [270, '270° 下方'], [360, '360°']]) {
      const x = xx(degree);
      ctx.strokeStyle = '#e8ece3'; ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, height - margin.bottom); ctx.stroke();
      ctx.fillStyle = '#839082'; ctx.textAlign = degree === 0 ? 'left' : degree === 360 ? 'right' : 'center'; ctx.fillText(label, x, height - 9);
    }
    ctx.fillStyle = '#839082'; ctx.textAlign = 'left'; ctx.fillText('Cp', 6, 13);
    const drawCurve = (curve, color, widthPx, alpha) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = widthPx; ctx.beginPath();
      let begun = false;
      for (const p of curve) {
        if (!Number.isFinite(p.value)) { begun = false; continue; }
        if (begun) ctx.lineTo(xx(p.degree), yy(p.value));
        else { ctx.moveTo(xx(p.degree), yy(p.value)); begun = true; }
      }
      ctx.stroke(); ctx.restore();
    };
    instant.forEach((curve, k) => drawCurve(curve, k === 0 ? '#487b6a' : '#c76550', hasMean ? 1 : 1.8, hasMean ? .45 : 1));
    mean.forEach((curve, k) => drawCurve(curve, k === 0 ? '#487b6a' : '#c76550', 2.2, 1));
    if (!frame) {
      ctx.fillStyle = '#839082'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('等待數值流場…', margin.left + pw / 2, margin.top + ph / 2 - 12);
    }
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(.1, (now - (smoke.lastTime || now)) / 1000); smoke.lastTime = now;
    if (state.field !== 'smoke' || !frame || document.hidden) return;
    const steps = state.running ? smoke.rate * dt : 0;
    if (steps > 0) {
      advanceSmoke(frame.smooth, steps); advanceSmoke(frame.seamed, steps);
      smoke.spin += frame.smooth.config.omegaLattice * steps;
    }
    scheduleDraw();
  }
  function noteSteps(steps) {
    const t = performance.now();
    if (smoke.lastSteps !== null && steps > smoke.lastSteps && smoke.stamp) {
      const r = (steps - smoke.lastSteps) / ((t - smoke.stamp) / 1000);
      smoke.rate = smoke.rate ? smoke.rate + .3 * (r - smoke.rate) : r;
    }
    if (smoke.lastSteps === null || steps !== smoke.lastSteps) { smoke.lastSteps = steps; smoke.stamp = t; }
  }

  function scheduleDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => {
      drawPending = false;
      drawScene($('smooth-canvas'), frame && frame.smooth);
      drawScene($('seamed-canvas'), frame && frame.seamed);
      drawPressureChart();
    });
  }

  function exportCSV() {
    if (!frame || state.error) return;
    const c = frame.smooth.config;
    const lines = [
      '# Baseball CFD: 2D low-Re cylinder model (TRT LBM); fixed magnified seams; not a 3D baseball prediction.',
      `# speed_kmh=${c.speedKmh},spin_rpm=${c.spinRpm},model_Re=${c.modelRe},real_reference_Re=${c.realRe},spin_ratio=${c.spinRatio},seam_reference_mm=${c.seamHeightMm},seam_magnification=${c.seamMagnification},seam_angle_deg=${c.seamAngleDeg},seam_count=${c.seamCount},steps=${frame.smooth.steps}`,
      `# mean_CL_smooth=${frame.smooth.forces.mean ? frame.smooth.forces.mean.cl : ''},mean_CD_smooth=${frame.smooth.forces.mean ? frame.smooth.forces.mean.cd : ''},mean_CL_seamed=${frame.seamed.forces.mean ? frame.seamed.forces.mean.cl : ''},mean_CD_seamed=${frame.seamed.forces.mean ? frame.seamed.forces.mean.cd : ''},averaged_diameters=${frame.smooth.forces.averagedDiameters}`,
      '# Velocity is in lattice units; Cp=2*(rho-rho_ref)/(3*U^2) with rho_ref measured upstream; coordinates are grid indices (y downward). Exclude solid=1 cells.',
      'case,x_grid,y_grid,solid,ux_lattice,uy_lattice,rho_lattice,Cp,Cp_mean,vorticity_lattice'
    ];
    for (const solution of [frame.smooth, frame.seamed]) {
      for (let p = 0; p < solution.nx * solution.ny; p++) {
        lines.push([solution.variant, p % solution.nx, Math.floor(p / solution.nx), solution.solid[p], solution.ux[p].toPrecision(7), solution.uy[p].toPrecision(7), solution.rho[p].toPrecision(7), solution.cp[p].toPrecision(7), solution.cpMean[p].toPrecision(7), solution.vorticity[p].toPrecision(7)].join(','));
      }
    }
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `baseball-cfd-Re${c.modelRe}-${frame.smooth.steps}steps.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function syncInputs() {
    for (const [id, key] of Object.entries(controls)) $(id).value = state.config[key];
    const radio = document.querySelector(`[name="seam-count"][value="${state.config.seamCount}"]`);
    if (radio) radio.checked = true;
  }
  function clearPresets(except) {
    document.querySelectorAll('[data-preset]').forEach((el) => { const active = el === except; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); });
  }

  for (const [id, key] of Object.entries(controls)) {
    $(id).addEventListener('input', () => {
      state.config[key] = Number($(id).value);
      clearPresets(null);
      queueConfigure();
    });
  }
  document.querySelectorAll('[name="seam-count"]').forEach((input) => input.addEventListener('change', () => {
    state.config.seamCount = Number(input.value); clearPresets(null); queueConfigure();
  }));
  $('reset').addEventListener('click', () => {
    state.config = { ...DEFAULTS }; state.running = true;
    syncInputs(); clearPresets(null);
    configure();
  });
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const presets = {
      still: { spinRpm: 0 },
      cw: { spinRpm: -1800 },
      ccw: { spinRpm: 1800 },
      seams: { spinRpm: 0, seamAngleDeg: 95, seamHeightMm: 1.5, seamCount: 1 }
    };
    Object.assign(state.config, presets[button.dataset.preset]);
    if (button.dataset.preset === 'seams') { state.average = true; $('average-field').checked = true; updateLegend(); }
    syncInputs(); clearPresets(button);
    configure();
  }));
  document.querySelectorAll('[data-field]').forEach((button) => button.addEventListener('click', () => { state.field = button.dataset.field; updateLegend(); scheduleDraw(); }));
  $('streamlines').addEventListener('change', () => { state.streamlines = $('streamlines').checked; scheduleDraw(); });
  $('average-field').addEventListener('change', () => { state.average = $('average-field').checked; updateLegend(); scheduleDraw(); });
  $('force-arrows').addEventListener('change', () => { state.arrows = $('force-arrows').checked; scheduleDraw(); });
  $('toggle-run').addEventListener('click', () => {
    state.running = !state.running;
    worker.postMessage({ type: state.running ? 'resume' : 'pause' });
    updateDiagnostics(); updateLabels();
  });
  $('step').addEventListener('click', () => {
    const n = Math.round(derived().stepsPerDiameter / 2);
    worker.postMessage({ type: 'step', count: n });
    if (frame && state.field === 'smoke') { advanceSmoke(frame.smooth, n); advanceSmoke(frame.seamed, n); }
  });
  $('export-csv').addEventListener('click', exportCSV);
  window.addEventListener('resize', scheduleDraw);
  document.addEventListener('visibilitychange', () => {
    if (!worker || state.error) return;
    if (document.hidden) worker.postMessage({ type: 'pause' });
    else if (state.running && state.ready) worker.postMessage({ type: 'resume' });
  });
  window.addEventListener('pagehide', () => { if (worker) worker.terminate(); });
  // A bfcache-restored page must start a new worker after pagehide terminated it.
  window.addEventListener('pageshow', (event) => { if (event.persisted) startWorker(); });

  function startWorker() {
    try {
      if (worker) worker.terminate();
      if (!window.Worker) { fail('此瀏覽器不支援 Web Worker，無法啟動數值求解。'); return; }
      worker = new Worker('worker.js');
      worker.addEventListener('message', (event) => {
        const message = event.data;
        if (message.generation !== state.generation) return;
        if (message.type === 'error') { fail(`求解器停止：${message.message}`); return; }
        if (message.type === 'snapshot') {
          const fresh = !frame;
          frame = message; state.ready = true;
          if (fresh) { resetSmoke(); }
          noteSteps(message.smooth.steps);
          updateDiagnostics(); scheduleDraw();
        }
      });
      worker.addEventListener('error', () => { fail('無法載入求解器，請確認透過 HTTP 網站開啟此頁並重新整理。'); });
      configure();
    } catch (error) { fail('無法啟動數值求解器，請確認瀏覽器支援 Web Worker。'); }
  }

  syncInputs(); updateLabels(); updateLegend(); scheduleDraw(); startWorker(); requestAnimationFrame(animate);
})();
