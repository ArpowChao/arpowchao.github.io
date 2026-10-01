/* Render and inspect actual paired 2-D LBM solutions produced by worker.js. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DEFAULTS = { speedKmh: 130, spinRpm: 1800, seamHeightMm: .8, seamAngleDeg: 35, seamCount: 2, modelRe: 120, seamMagnification: 6 };
  const controls = { speed: 'speedKmh', spin: 'spinRpm', 'seam-height': 'seamHeightMm', 'seam-angle': 'seamAngleDeg', 'model-re': 'modelRe' };
  const state = { config: { ...DEFAULTS }, field: 'speed', running: true, streamlines: true, generation: 0, ready: false, error: '' };
  let worker, frame = null, configureTimer, drawPending = false;
  const rasters = new Map();
  const speedStops = [[0, [17, 44, 59]], [.25, [36, 97, 110]], [.5, [86, 168, 153]], [.75, [218, 211, 126]], [1, [237, 153, 99]]];
  const pressureStops = [[0, [71, 127, 195]], [.5, [228, 231, 220]], [1, [199, 94, 79]]];
  const vorticityStops = [[0, [94, 137, 181]], [.5, [19, 47, 55]], [1, [237, 154, 103]]];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
  // Look-up tables keep color mapping independent of numerical worker speed.
  const palettes = {
    speed: Array.from({ length: 256 }, (_, i) => colorAt(speedStops, i / 255)),
    pressure: Array.from({ length: 256 }, (_, i) => colorAt(pressureStops, i / 255)),
    vorticity: Array.from({ length: 256 }, (_, i) => colorAt(vorticityStops, i / 255))
  };

  function updateLabels() {
    const c = state.config;
    $('speed-output').innerHTML = `${c.speedKmh} <small>km/h</small>`;
    $('spin-output').innerHTML = `${c.spinRpm < 0 ? '−' : ''}${Math.abs(c.spinRpm)} <small>rpm</small>`;
    $('seam-height-output').innerHTML = `${c.seamHeightMm.toFixed(1)} <small>mm</small>`;
    $('seam-angle-output').innerHTML = `${c.seamAngleDeg} <small>°</small>`;
    $('model-re-output').textContent = c.modelRe;
    const direction = c.spinRpm > 0 ? '↺' : c.spinRpm < 0 ? '↻' : '○';
    $('spin-direction').textContent = c.spinRpm > 0 ? '↺ 逆時針：球頂表面向左移動' : c.spinRpm < 0 ? '↻ 順時針：球頂表面向右移動' : '○ 不旋轉，只觀察表面幾何';
    document.querySelectorAll('.spin-label').forEach((el) => { el.textContent = `${direction} ${Math.abs(c.spinRpm)} rpm`; });
    $('seam-detail').textContent = c.seamHeightMm === 0 ? '0 mm · 光滑表面' : `${c.seamCount} 處 · 放大 6×`;
    const realRe = c.speedKmh / 3.6 * .073 / 1.5e-5;
    const spinRatio = c.spinRpm * Math.PI / 30 * .0365 / (c.speedKmh / 3.6);
    $('real-re').innerHTML = `${(realRe / 1e5).toFixed(2)} <small>× 10⁵</small>`;
    $('spin-ratio').textContent = `${spinRatio < 0 ? '−' : ''}${Math.abs(spinRatio).toFixed(3)}`;
    $('toggle-run').textContent = state.running ? '暫停' : '繼續';
    $('toggle-run').disabled = !state.ready || !!state.error;
    $('step').disabled = state.running || !state.ready || !!state.error;
    $('export-csv').disabled = !frame || !!state.error;
  }

  function updateLegend() {
    const names = { speed: ['0', '≥ 2.0', '流速 / 來流速度 U'], pressure: ['≤ −4', '≥ +4', '壓力係數 Cp'], vorticity: ['≤ −12', '≥ +12', '渦度 × D / U'] };
    const [min, max, label] = names[state.field];
    $('legend-min').textContent = min;
    $('legend-max').textContent = max;
    $('legend-label').textContent = label;
    $('color-scale').className = `color-scale ${state.field}-scale`;
    document.querySelectorAll('[data-field]').forEach((button) => {
      const active = button.dataset.field === state.field;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function configure() {
    clearTimeout(configureTimer);
    if (!worker) return;
    state.generation++;
    frame = null;
    state.ready = false;
    state.error = '';
    rasters.clear();
    $('wake-difference').textContent = '—';
    $('steps-label').textContent = '0 步';
    $('status-text').textContent = '重建幾何，重新開始演算…';
    $('status-dot').style.background = '#b19c65';
    updateLabels();
    scheduleDraw();
    worker.postMessage({ type: 'configure', generation: state.generation, config: state.config, running: state.running && !document.hidden });
  }

  function queueConfigure() {
    clearTimeout(configureTimer);
    updateLabels();
    // Discard the old condition immediately; a trailing update avoids rebuilding
    // every intermediate slider position. Generation prevents stale messages.
    state.generation++;
    frame = null;
    state.ready = false;
    rasters.clear();
    $('wake-difference').textContent = '—';
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

  function updateDiagnostics() {
    if (!frame) return;
    const a = frame.smooth, b = frame.seamed, c = state.config;
    const stable = a.diagnostics.stable && b.diagnostics.stable;
    if (!stable) { fail('數值穩定性檢查未通過，已停止演算；請重設條件。'); return; }
    const passes = a.steps * c.uIn / c.diameterCells;
    $('steps-label').textContent = `${a.steps.toLocaleString('en-US')} 步`;
    $('status-dot').style.background = state.running ? '#438b65' : '#b19c65';
    $('status-text').textContent = `${state.running ? '演算中' : '已暫停'} · 模型 Re ${c.modelRe} · 氣流經過 ${passes.toFixed(1)} 個球徑 · 兩側同步`;
    $('grid-label').textContent = `${a.nx} × ${a.ny} 格點 / 每側 · D2Q9 · τ = ${c.tau.toFixed(3)}`;
    const { cx, cy, radius } = a.geometry;
    let sum = 0, count = 0;
    // Compare common fluid in a declared downstream window, excluding both
    // obstacle masks. No manufactured seam multiplier or wake force is used.
    for (let y = Math.max(1, Math.floor(cy - 2 * radius)); y <= Math.min(a.ny - 2, cy + 2 * radius); y++) {
      for (let x = Math.ceil(cx + radius + 4); x < Math.min(a.nx - 2, cx + 7 * radius); x++) {
        const p = y * a.nx + x;
        if (a.solid[p] || b.solid[p]) continue;
        sum += (a.ux[p] - b.ux[p]) ** 2 + (a.uy[p] - b.uy[p]) ** 2;
        count++;
      }
    }
    const rms = count ? Math.sqrt(sum / count) / c.uIn : 0;
    $('wake-difference').innerHTML = `${(rms * 100).toFixed(2)} <small>%</small>`;
    if (c.seamHeightMm === 0) {
      $('observation-title').textContent = '把縫線高度設為 0，兩側回到相同流場';
      $('observation-text').textContent = '這是對照檢查：相同幾何、邊界和初始條件，得到相同數值解。試著提高縫線高度，再觀察差異如何傳到下游。';
    } else if (passes < 4) {
      $('observation-title').textContent = '氣流正在建立，尾流差異會逐漸向下游傳播';
      $('observation-text').textContent = '先讓來流經過數個球徑，再比較兩側。初始階段的壓力波與未發展尾流，尚不能代表長時間狀態。';
    } else {
      $('observation-title').textContent = c.spinRpm === 0 ? '沒有旋轉，縫線仍會改變局部氣流' : '旋轉改變兩側氣流，縫線再加入局部擾動';
      $('observation-text').textContent = '速度差 RMS 取球心下游約 0.6–3.5 個球徑、中心線上下各 1 個球徑的共同流體格點。這是此刻二維模型的差異，並非真球受力或球路偏移量。';
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

  function fieldRaster(solution) {
    const key = `${solution.variant}-${state.field}`;
    let raster = rasters.get(key);
    if (raster && raster.steps === solution.steps) return raster.canvas;
    if (!raster) {
      const canvas = document.createElement('canvas');
      canvas.width = solution.nx; canvas.height = solution.ny;
      raster = { canvas, steps: -1 }; rasters.set(key, raster);
    }
    const ctx = raster.canvas.getContext('2d');
    const data = ctx.createImageData(solution.nx, solution.ny);
    const colors = palettes[state.field], c = state.config;
    const { cx, cy, radius } = solution.geometry;
    for (let p = 0; p < solution.nx * solution.ny; p++) {
      let rgb;
      if (solution.solid[p]) {
        const x = p % solution.nx, y = Math.floor(p / solution.nx);
        const isSeam = (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2;
        const light = 1 - .12 * ((x - cx + y - cy) / (2 * radius) + 1);
        rgb = isSeam ? [205, 126, 95] : [239 * light, 237 * light, 215 * light];
      } else {
        const value = state.field === 'speed' ? Math.hypot(solution.ux[p], solution.uy[p]) / c.uIn / 2 : state.field === 'pressure' ? (solution.cp[p] + 4) / 8 : (solution.vorticity[p] * c.diameterCells / c.uIn + 12) / 24;
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
    ctx.lineWidth = Math.max(.55, .55 / scale);
    ctx.lineCap = 'round';
    for (let y0 = 5; y0 < solution.ny - 5; y0 += 7) {
      let x = 2, y = y0;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 420; k++) {
        const v = sample(solution, x, y);
        if (!v) break;
        const speed = Math.hypot(v.ux, v.uy);
        if (speed < .003) break;
        // A midpoint step follows the calculated instantaneous velocity;
        // these are streamlines, not pre-drawn trajectories or particle paths.
        const mid = sample(solution, x + .65 * v.ux / speed, y + .65 * v.uy / speed);
        if (!mid) break;
        const m = Math.hypot(mid.ux, mid.uy);
        if (m < .003) break;
        const nextX = x + 1.3 * mid.ux / m, nextY = y + 1.3 * mid.uy / m;
        if (!sample(solution, nextX, nextY)) break;
        x = nextX; y = nextY; ctx.lineTo(x, y);
        if (k % 55 === 25) {
          const angle = Math.atan2(mid.uy, mid.ux), len = 2.6;
          ctx.moveTo(x - len * Math.cos(angle - .45), y - len * Math.sin(angle - .45));
          ctx.lineTo(x, y);
          ctx.lineTo(x - len * Math.cos(angle + .45), y - len * Math.sin(angle + .45));
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  function drawScene(canvas, solution) {
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.fillStyle = '#15343c'; ctx.fillRect(0, 0, width, height);
    if (!solution) {
      ctx.fillStyle = '#a0b7ae'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(state.error ? '數值風洞尚未啟動' : '建立流體格點中…', width / 2, height / 2);
      return;
    }
    const scale = Math.min(width / solution.nx, height / solution.ny);
    ctx.save();
    ctx.translate((width - solution.nx * scale) / 2, (height - solution.ny * scale) / 2);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldRaster(solution), 0, 0);
    if (state.streamlines) drawStreamlines(ctx, solution, scale);
    const g = solution.geometry;
    ctx.lineWidth = .65; ctx.strokeStyle = '#fcfae48c';
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2); ctx.stroke();
    // Marks are placed at the actual model seam positions. The highlighted
    // protruding mask cells above are the geometry seen by the solver.
    for (const seam of g.seamCenters) {
      const angle = seam.angleDeg * Math.PI / 180;
      ctx.strokeStyle = '#ab5747'; ctx.lineWidth = 1.0;
      for (let offset = -2; offset <= 2; offset++) {
        const radial = g.radius - 2.5, t = angle + offset * .09;
        const x = g.cx + radial * Math.cos(t), y = g.cy - radial * Math.sin(t);
        ctx.beginPath();
        ctx.moveTo(x - 1.5 * Math.cos(t), y + 1.5 * Math.sin(t));
        ctx.lineTo(x + 1.5 * Math.cos(t), y - 1.5 * Math.sin(t)); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#75999299'; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.moveTo(8, solution.ny - 12); ctx.lineTo(8 + state.config.diameterCells, solution.ny - 12);
    ctx.moveTo(8, solution.ny - 14); ctx.lineTo(8, solution.ny - 10);
    ctx.moveTo(8 + state.config.diameterCells, solution.ny - 14); ctx.lineTo(8 + state.config.diameterCells, solution.ny - 10); ctx.stroke();
    ctx.fillStyle = '#d0e0cf'; ctx.font = '5px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('1D · 球徑', 8 + state.config.diameterCells / 2, solution.ny - 4);
    ctx.restore();
  }

  function pressureSamples(solution) {
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
      const x = Math.round(g.cx + (radius + 2) * dx), y = Math.round(g.cy + (radius + 2) * dy);
      const p = y * solution.nx + x;
      points.push({ degree, value: solution.solid[p] ? null : solution.cp[p] });
    }
    return points;
  }

  function drawPressureChart() {
    const { ctx, width, height } = setupCanvas($('pressure-chart'));
    const margin = { left: 42, right: 10, top: 13, bottom: 26 };
    const pw = width - margin.left - margin.right, ph = height - margin.top - margin.bottom;
    const curves = frame ? [pressureSamples(frame.smooth), pressureSamples(frame.seamed)] : [];
    const values = curves.flatMap((p) => p.map((s) => s.value)).filter(Number.isFinite);
    const extent = Math.max(2, ...values.map(Math.abs));
    const bound = Math.ceil(extent / 2) * 2;
    const xx = (degree) => margin.left + degree / 360 * pw;
    const yy = (cp) => margin.top + (bound - cp) / (bound * 2) * ph;
    ctx.font = '9px Inter, sans-serif'; ctx.lineWidth = 1;
    for (let j = 0; j <= 4; j++) {
      const value = bound - j * bound / 2, y = yy(value);
      ctx.strokeStyle = value === 0 ? '#bfcabc' : '#e8ece3';
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
      ctx.fillStyle = '#839082'; ctx.textAlign = 'right'; ctx.fillText(value.toFixed(value % 1 ? 1 : 0), margin.left - 8, y + 3);
    }
    for (const degree of [0, 90, 180, 270, 360]) {
      const x = xx(degree);
      ctx.strokeStyle = '#e8ece3'; ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, height - margin.bottom); ctx.stroke();
      ctx.fillStyle = '#839082'; ctx.textAlign = 'center'; ctx.fillText(`${degree}°`, x, height - 9);
    }
    ctx.fillStyle = '#839082'; ctx.textAlign = 'left'; ctx.fillText('Cp', 6, 13);
    curves.forEach((curve, k) => {
      ctx.strokeStyle = k === 0 ? '#487b6a' : '#c76550'; ctx.lineWidth = 1.8; ctx.beginPath();
      let begun = false;
      for (const p of curve) {
        if (!Number.isFinite(p.value)) { begun = false; continue; }
        if (begun) ctx.lineTo(xx(p.degree), yy(p.value));
        else { ctx.moveTo(xx(p.degree), yy(p.value)); begun = true; }
      }
      ctx.stroke();
    });
    if (!frame) {
      ctx.fillStyle = '#839082'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('等待數值流場…', margin.left + pw / 2, margin.top + ph / 2 - 12);
    }
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
    const c = state.config;
    const lines = [
      '# Baseball CFD: 2D low-Re cylinder model; fixed magnified seams; not a 3D baseball prediction.',
      `# speed_kmh=${c.speedKmh},spin_rpm=${c.spinRpm},model_Re=${c.modelRe},real_reference_Re=${c.realRe},seam_reference_mm=${c.seamHeightMm},seam_magnification=${c.seamMagnification},seam_angle_deg=${c.seamAngleDeg},seam_count=${c.seamCount},steps=${frame.smooth.steps}`,
      '# Velocity is in lattice units; Cp=2*(rho-1)/(3*U_lattice^2); coordinates are grid indices (y downward). Solid cells carry prescribed wall velocity; Cp and vorticity there are not fluid values.',
      'case,x_grid,y_grid,solid,ux_lattice,uy_lattice,rho_lattice,Cp,vorticity_lattice'
    ];
    for (const solution of [frame.smooth, frame.seamed]) {
      for (let p = 0; p < solution.nx * solution.ny; p++) {
        lines.push([solution.variant, p % solution.nx, Math.floor(p / solution.nx), solution.solid[p], solution.ux[p].toPrecision(7), solution.uy[p].toPrecision(7), solution.rho[p].toPrecision(7), solution.cp[p].toPrecision(7), solution.vorticity[p].toPrecision(7)].join(','));
      }
    }
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `baseball-cfd-Re${c.modelRe}-${frame.smooth.steps}steps.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  for (const [id, key] of Object.entries(controls)) {
    $(id).addEventListener('input', () => {
      state.config[key] = Number($(id).value);
      document.querySelectorAll('[data-preset]').forEach((el) => { el.classList.remove('active'); el.setAttribute('aria-pressed', 'false'); });
      queueConfigure();
    });
  }
  document.querySelectorAll('[name="seam-count"]').forEach((input) => input.addEventListener('change', () => {
    state.config.seamCount = Number(input.value); queueConfigure();
  }));
  $('reset').addEventListener('click', () => {
    state.config = { ...DEFAULTS }; state.running = true;
    for (const [id, key] of Object.entries(controls)) $(id).value = state.config[key];
    document.querySelector('[name="seam-count"][value="2"]').checked = true;
    document.querySelectorAll('[data-preset]').forEach((el) => { el.classList.remove('active'); el.setAttribute('aria-pressed', 'false'); });
    configure();
  });
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const presets = { still: { spinRpm: 0 }, ccw: { spinRpm: 1800 }, cw: { spinRpm: -1800 }, seams: { spinRpm: 0, seamAngleDeg: 75, seamHeightMm: 1.2, seamCount: 2 } };
    Object.assign(state.config, presets[button.dataset.preset]);
    for (const [id, key] of Object.entries(controls)) $(id).value = state.config[key];
    document.querySelector(`[name="seam-count"][value="${state.config.seamCount}"]`).checked = true;
    document.querySelectorAll('[data-preset]').forEach((el) => { const active = el === button; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); });
    configure();
  }));
  document.querySelectorAll('[data-field]').forEach((button) => button.addEventListener('click', () => { state.field = button.dataset.field; updateLegend(); scheduleDraw(); }));
  $('streamlines').addEventListener('change', () => { state.streamlines = $('streamlines').checked; scheduleDraw(); });
  $('toggle-run').addEventListener('click', () => {
    state.running = !state.running;
    worker.postMessage({ type: state.running ? 'resume' : 'pause' });
    updateDiagnostics(); updateLabels();
  });
  $('step').addEventListener('click', () => { worker.postMessage({ type: 'step', count: 24 }); });
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
        if (message.config) state.config = { ...state.config, ...message.config };
        if (message.type === 'snapshot') {
          frame = message; state.ready = true;
          updateDiagnostics(); scheduleDraw();
        }
      });
      worker.addEventListener('error', () => { fail('無法載入求解器，請確認透過 HTTP 網站開啟此頁並重新整理。'); });
      configure();
    } catch (error) { fail('無法啟動數值求解器，請確認瀏覽器支援 Web Worker。'); }
  }

  updateLabels(); updateLegend(); scheduleDraw(); startWorker();
})();
