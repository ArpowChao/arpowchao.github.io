/* Uniform volume charge: a central cross-section is drawn; forces use 3-D integration. */
(() => {
  'use strict';
  const physics = window.ChargedSpheresPhysics;
  const $ = (id) => document.getElementById(id);
  const MIN_GAP = 0.05;
  const MAX_GAP = 2000;
  const MIN_ZOOM = .25;
  const MAX_ZOOM = 1024;
  const view = { zoom: 1, centerX: 0, centerY: 0 };
  let viewScheduled = false;
  let sceneTransform;
  let dragStart;
  const state = { radius: 0.03, gapRatio: 0.2, q1: 5e-9, q2: 5e-9, gridSize: 7, showLocal: true, showPairs: false };
  const presets = {
    like: { q1: 5e-9, q2: 5e-9 },
    opposite: { q1: 5e-9, q2: -5e-9 },
    unequal: { q1: 8e-9, q2: 1e-9 },
    neutral: { q1: 5e-9, q2: 0 }
  };
  let solution;
  let integral;
  let direct = null;
  let series = null;
  let requestId = 0;
  let computationKey = '';
  let worker;
  let calculationError = '';
  let extreme = null;
  let extremeKey = '';
  let scheduled = false;
  const canvases = ['scene', 'force-chart', 'error-chart', 'slice-chart', 'pair-chart'].map($);
  const gapFromSlider = (value) => MIN_GAP * (MAX_GAP / MIN_GAP) ** (value / 1000);
  const sliderFromGap = (gap) => Math.round(1000 * Math.log(gap / MIN_GAP) / Math.log(MAX_GAP / MIN_GAP));
  const signedCharge = (q) => `${q > 0 ? '+' : q < 0 ? '−' : ''}${(Math.abs(q) * 1e9).toFixed(1)} nC`;
  const sign = (n) => n > 0 ? 1 : n < 0 ? -1 : 0;
  const direction = (force) => force > 0 ? '排斥' : force < 0 ? '吸引' : '無合力';
  const params = () => ({ radius: state.radius, separation: state.radius * (2 + state.gapRatio), q1: state.q1, q2: state.q2 });

  function forceUnits(force) {
    const abs = Math.abs(force);
    if (abs === 0) return { value: '0', unit: 'N', factor: 1 };
    const scales = [[1, 'N'], [1e-3, 'mN'], [1e-6, 'μN'], [1e-9, 'nN'], [1e-12, 'pN'], [1e-15, 'fN'], [1e-18, 'aN'], [1e-21, 'zN']];
    const [factor, unit] = scales.find(([scale]) => abs >= scale) || scales.at(-1);
    const value = abs / factor;
    return { value: value.toFixed(value >= 100 ? 1 : value >= 10 ? 2 : 3), unit, factor };
  }

  function writeForce(element, force, sharedScale) {
    const formatted = sharedScale ? { ...sharedScale } : forceUnits(force);
    if (sharedScale) {
      const value = Math.abs(force) / sharedScale.factor;
      formatted.value = value === 0 ? '0' : value.toFixed(value >= 100 ? 1 : value >= 10 ? 2 : value >= 1 ? 3 : value >= .1 ? 4 : 5);
    }
    element.replaceChildren(document.createTextNode(`${formatted.value} `));
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = formatted.unit;
    element.append(unit);
  }

  function palette() {
    const style = getComputedStyle(document.body);
    return Object.fromEntries(['text', 'muted', 'border', 'accent', 'positive', 'negative', 'near-pair', 'far-pair', 'plot-line', 'panel', 'bg'].map((name) => [name, style.getPropertyValue(`--${name}`).trim()]));
  }

  function prepareCanvas(canvas) {
    const box = canvas.getBoundingClientRect();
    const width = box.width;
    const height = box.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    return { ctx, width, height };
  }

  function arrow(ctx, x1, y1, x2, y2, color, width = 1.5, head = 5) {
    if (Math.hypot(x2 - x1, y2 - y1) < 1) return;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath(); ctx.fill();
  }

  function fitScale(width, height) {
    return Math.min((width - 96) / (solution.separation + 2 * state.radius), (height - 130) / (2 * state.radius));
  }

  function syncViewControls() {
    $('view-zoom').value = String(Math.round(1000 * Math.log(view.zoom / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)));
    $('view-zoom-output').textContent = `${view.zoom.toFixed(view.zoom >= 100 ? 0 : 2)}×`;
    $('view-out').disabled = view.zoom <= MIN_ZOOM;
    $('view-in').disabled = view.zoom >= MAX_ZOOM;
  }

  function scheduleView() {
    if (viewScheduled) return;
    viewScheduled = true;
    requestAnimationFrame(() => {
      viewScheduled = false;
      if (solution) drawScene(palette());
    });
  }

  function setViewZoom(zoom, anchor) {
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    if (anchor && sceneTransform) {
      const box = $('scene').getBoundingClientRect();
      const scale = fitScale(box.width, box.height) * view.zoom;
      const { cx, cy } = sceneTransform;
      const nextScale = scale * nextZoom / view.zoom;
      // Preserve the physical point under the cursor while zooming.
      view.centerX += (anchor.x - cx) * (1 / scale - 1 / nextScale);
      view.centerY -= (anchor.y - cy) * (1 / scale - 1 / nextScale);
    }
    view.zoom = nextZoom;
    syncViewControls();
    scheduleView();
  }

  function fitView() {
    Object.assign(view, { zoom: 1, centerX: 0, centerY: 0 });
    syncViewControls();
    scheduleView();
  }

  function focusSphere(sphere) {
    const box = $('scene').getBoundingClientRect();
    const radiusPixels = (box.height - 140) / 2;
    view.centerX = solution.centers[sphere];
    view.centerY = 0;
    setViewZoom(radiusPixels / (state.radius * fitScale(box.width, box.height)));
  }

  function drawScene(colors) {
    const { ctx, width: w, height: h } = prepareCanvas($('scene'));
    if (!w || !h) return;
    const r = state.radius;
    const d = solution.separation;
    const scale = fitScale(w, h) * view.zoom;
    const rp = r * scale;
    const cy = h * 0.43;
    const project = (point) => [w / 2 + (point.x - view.centerX) * scale, cy - (point.y - view.centerY) * scale];
    const centers = solution.centers.map((x) => project({ x, y: 0 })[0]);
    const sphereY = project({ x: 0, y: 0 })[1];
    sceneTransform = { scale, cx: w / 2, cy };
    syncViewControls();
    $('view-scale-readout').textContent = `1R = ${rp.toFixed(rp < 1 ? 3 : 1)} px · 等比例`;
    const outside = centers.flatMap((cx, i) => cx + rp < 0 || cx - rp > w || sphereY + rp < 0 || sphereY - rp > h - 60 ? [i === 0 ? 'A' : 'B'] : []);
    $('view-note').textContent = outside.length ? `球 ${outside.join('、')} 在畫外；可點「看球 A／B」或「顯示全貌」。` : rp < 6 ? '全貌中球體很小；點「看球 A／B」可放大觀察，比例保持不變。' : '拖曳平移，滾輪縮放；也可聚焦單球。';
    $('scene').setAttribute('aria-description', `球半徑與所有間距使用同一比例。1R = ${rp.toFixed(3)} 像素；球心距 = ${(d * scale).toFixed(3)} 像素。可拖曳平移，使用滾輪、縮放滑桿或加減按鈕縮放。`);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h - 60); ctx.clip();
    ctx.strokeStyle = colors.border;
    ctx.setLineDash([3, 6]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, sphereY); ctx.lineTo(w, sphereY); ctx.stroke(); ctx.setLineDash([]);

    centers.forEach((cx, sphere) => {
      const q = sphere === 0 ? state.q1 : state.q2;
      const color = q > 0 ? colors.positive : q < 0 ? colors.negative : colors.muted;
      const gradient = ctx.createRadialGradient(cx - rp * .3, sphereY - rp * .35, 0, cx, sphereY, rp);
      gradient.addColorStop(0, `${color}25`);
      gradient.addColorStop(1, `${color}09`);
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(cx, sphereY, rp, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = Math.min(1.7, rp * .18); ctx.stroke();

      // Uniformly spaced marks on a central cross-section; never surface redistribution.
      ctx.fillStyle = color;
      if (q !== 0 && rp > 9) {
        const spacing = 2 * rp / state.gridSize;
        for (let y = -rp + spacing / 2; y < rp; y += spacing) {
          for (let x = -rp + spacing / 2; x < rp; x += spacing) {
            if (x * x + y * y >= rp ** 2) continue;
            ctx.globalAlpha = state.showPairs ? .22 : .65;
            ctx.beginPath(); ctx.arc(cx + x, sphereY + y, Math.max(1.2, Math.min(2, rp / 40)), 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = colors.text;
      ctx.font = '600 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(sphere === 0 ? '球 A' : '球 B', cx, sphereY - rp - 22);
      ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = color;
      ctx.fillText(signedCharge(q), cx, sphereY + rp + 23);
      if (rp > 6) {
        ctx.fillStyle = colors.muted;
        ctx.beginPath(); ctx.arc(cx, sphereY, 2, 0, Math.PI * 2); ctx.fill();
      }
    });

    if (state.showLocal && state.q1 !== 0 && state.q2 !== 0 && rp > 16) {
      const cx = centers[1];
      const forceScale = Math.abs(physics.sampleForce(solution, solution.centers[1] - r * .7, 0).forceDensityX);
      const lengthBase = Math.min(26, rp * .32);
      for (const ux of [-.6, 0, .6]) {
        for (const uy of [-.45, 0, .45]) {
          const field = physics.sampleForce(solution, solution.centers[1] + ux * r, uy * r);
          const fx = field.forceDensityX;
          const fy = field.forceDensityY;
          const magnitude = Math.hypot(fx, fy);
          if (!magnitude || !forceScale) continue;
          const length = lengthBase * magnitude / forceScale;
          const px = cx + ux * rp;
          const py = sphereY - uy * rp;
          ctx.globalAlpha = state.showPairs ? .22 : .9;
          arrow(ctx, px, py, px + length * fx / magnitude, py - length * fy / magnitude, colors['plot-line'], 1.2, 3.8);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Equal and opposite aggregate forces, shown outside each sphere for readable direction.
    if (solution.force !== 0 && !state.showPairs && rp > 6) {
      const repulsive = solution.force > 0;
      const available = 28;
      for (let sphere = 0; sphere < 2; sphere++) {
        const outward = sphere === 0 ? -1 : 1;
        const endNear = centers[sphere] + outward * (rp + 9);
        const endFar = endNear + outward * available;
        arrow(ctx, repulsive ? endNear : endFar, sphereY, repulsive ? endFar : endNear, sphereY, colors['plot-line'], 3, 8);
        ctx.fillStyle = colors['plot-line']; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('F', (endNear + endFar) / 2, sphereY - 14);
      }
    }

    if (rp > 22 && state.gapRatio < 2) {
      const gapY = sphereY + rp * .57;
      const left = centers[0] + rp;
      const right = centers[1] - rp;
      ctx.strokeStyle = colors.accent;
      ctx.beginPath(); ctx.moveTo(left, gapY); ctx.lineTo(right, gapY); ctx.stroke();
      ctx.fillStyle = colors.accent; ctx.font = 'italic 12px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('g', (left + right) / 2, gapY - 7);
    }
    // Charge markers are annotations; omit them when the physical sphere is
    // too small to distinguish its endpoints instead of enlarging its radius.
    if (state.showPairs && extreme && rp >= 12) drawPairHighlights(ctx, project, colors);
    ctx.restore();

    // A center-distance dimension is shown only when both endpoints are visible.
    const dy = h - 38;
    if (centers.every((cx) => cx >= 24 && cx <= w - 24)) {
      ctx.strokeStyle = colors.muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(centers[0], dy); ctx.lineTo(centers[1], dy); ctx.stroke();
      centers.forEach((cx) => { ctx.beginPath(); ctx.moveTo(cx, dy - 5); ctx.lineTo(cx, dy + 5); ctx.stroke(); });
      ctx.fillStyle = colors.panel;
      const distanceLabel = `d = ${(2 + state.gapRatio).toFixed(2)} R`;
      ctx.font = '11px ui-monospace, monospace';
      const textWidth = ctx.measureText(distanceLabel).width;
      const midpoint = (centers[0] + centers[1]) / 2;
      ctx.fillRect(midpoint - textWidth / 2 - 7, dy - 10, textWidth + 14, 20);
      ctx.fillStyle = colors.muted; ctx.textAlign = 'center'; ctx.fillText(distanceLabel, midpoint, dy + 4);
    } else {
      ctx.fillStyle = colors.muted; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('球體在畫外 · 看球 A／B 或顯示全貌', w / 2, dy + 4);
    }

    if (state.showLocal && solution.force !== 0) {
      const precision = state.gapRatio >= 50 ? 4 : 2;
      const near = ((d / (d - r)) ** 2).toFixed(precision);
      const far = ((d / (d + r)) ** 2).toFixed(precision);
      ctx.fillStyle = colors.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`等體積小塊：近端 ${near} 倍 · 遠端 ${far} 倍（相對於 B 球心）`, w / 2, h - 10);
    }
  }

  function drawPairHighlights(ctx, project, colors) {
    // Both selected pairs lie on the horizontal center line (y=z=0).
    for (const [key, label] of [['far', '遠'], ['near', '近']]) {
      const pair = extreme[key];
      const color = colors[`${key}-pair`];
      const points = pair.points.map((point, sphere) => project(point, sphere));
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = .65;
      ctx.setLineDash(key === 'far' ? [5, 4] : [2, 3]);
      ctx.beginPath(); ctx.moveTo(...points[0]); ctx.lineTo(...points[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const [a, b] = points;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length;
      points.forEach(([x, y], sphere) => {
        if (pair.force > 0) {
          const outward = sphere === 0 ? -1 : 1;
          const dir = pair.signedForce > 0 ? outward : -outward;
          arrow(ctx, x + dir * ux * 7, y + dir * uy * 7, x + dir * ux * 28, y + dir * uy * 28, color, 2.2, 6);
        }
        ctx.fillStyle = colors.panel; ctx.strokeStyle = color; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        ctx.font = '600 10px system-ui'; ctx.textAlign = sphere === 0 ? 'right' : 'left';
        ctx.fillText(`${sphere === 0 ? 'A' : 'B'}${label}`, x + (sphere === 0 ? -9 : 9), y - 10);
      });
    }
  }

  function drawPairChart(colors) {
    if (!state.showPairs || !extreme) return;
    const { ctx, width: w, height: h } = prepareCanvas($('pair-chart'));
    if (!w || !h) return;
    const left = 54, right = 18, top = 33, bottom = 28;
    const pw = w - left - right;
    const near = forceUnits(extreme.near.force);
    const scaleMax = extreme.near.force || 1;
    ctx.fillStyle = colors.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(`單對受力 (${near.unit}) · 同一線性刻度`, left, 12);
    for (const [key, index] of [['near', 0], ['far', 1]]) {
      const value = extreme[key].force;
      const y = top + index * 47;
      ctx.fillStyle = colors.muted; ctx.textAlign = 'right'; ctx.font = '11px system-ui';
      ctx.fillText(key === 'near' ? '最近' : '最遠', left - 10, y + 15);
      ctx.fillStyle = colors.border; ctx.globalAlpha = .35;
      ctx.fillRect(left, y, pw, 23); ctx.globalAlpha = 1;
      ctx.fillStyle = colors[`${key}-pair`];
      ctx.fillRect(left, y, value / scaleMax * pw, 23);
    }
    ctx.textAlign = 'center'; ctx.fillStyle = colors.muted; ctx.font = '9px ui-monospace, monospace';
    const maximum = extreme.near.force / near.factor;
    for (const fraction of [0, .5, 1]) {
      const value = maximum * fraction;
      ctx.fillText(value === 0 ? '0' : value.toFixed(maximum >= 100 ? 1 : 2), left + pw * fraction, h - bottom + 13);
    }
  }

  function updatePairs() {
    $('pair-comparison').hidden = !state.showPairs;
    $('show-pairs').setAttribute('aria-expanded', String(state.showPairs));
    $('scene-caption').textContent = state.showPairs
      ? '紅色標出水平最近電荷對，藍色標出水平最遠電荷對，兩組都位於連心線；球太小時暫不顯示標記，可放大查看。箭頭表示作用方向，受力大小看下方數值與同刻度長條。球半徑與間距始終保持同一比例，畫面縮放不改變實驗數值。'
      : '球內是三維分割電荷的中央剖面示意；細箭頭表示 A 對連續 B 球中等體積小塊的作用，粗箭頭表示兩球間的合力，箭頭長度僅供各自比較。球半徑與間距始終保持同一比例，畫面縮放不改變實驗數值。';
    if (!state.showPairs) return;
    const key = JSON.stringify({ ...params(), gridSize: state.gridSize });
    if (key !== extremeKey) { extreme = physics.axisPairs(solution, state.gridSize); extremeKey = key; }
    const sharedScale = forceUnits(extreme.near.force);
    writeForce($('near-pair-force'), extreme.near.force, sharedScale);
    writeForce($('far-pair-force'), extreme.far.force, sharedScale);
    for (const [key, label] of [['near', '近'], ['far', '遠']]) {
      $(`${key}-pair-distance`).textContent = `r${label} = ${(extreme[key].distance * 100).toFixed(3)} cm · ${(extreme[key].distance / state.radius).toFixed(3)} R`;
    }
    $('pair-force-ratio').textContent = extreme.forceRatio === null ? '不適用（兩者皆為零）' : `${extreme.forceRatio.toFixed(extreme.forceRatio < 2 ? 6 : 2)} 倍`;
    $('pair-relative-difference').textContent = extreme.forceRatio === null ? '' : `（近端大 ${(100 * (extreme.forceRatio - 1)).toFixed(4)}%）`;
    $('pair-direction').textContent = `單對電荷 · ${direction(solution.force)}`;
    const charge = (q) => `${q > 0 ? '+' : q < 0 ? '−' : ''}${Math.abs(q * 1e12).toFixed(3)} pC`;
    const tinyUnits = { fN: 'fN = 10⁻¹⁵ N', aN: 'aN = 10⁻¹⁸ N', zN: 'zN = 10⁻²¹ N' };
    $('pair-charge-note').textContent = `兩對皆沿水平連心線，取自每球 ${extreme.pointsPerSphere} 個格心電荷：ΔqA = ${charge(extreme.near.points[0].q)}、ΔqB = ${charge(extreme.near.points[1].q)}。最近格心距大於球面間隙 g。${tinyUnits[sharedScale.unit] ? `本次單位 ${tinyUnits[sharedScale.unit]}。` : ''}`;
  }

  function drawForceChart(colors) {
    const { ctx, width: w, height: h } = prepareCanvas($('force-chart'));
    if (!w || !h) return;
    const left = 57, right = 13, top = 22, bottom = 31;
    const pw = w - left - right, ph = h - top - bottom;
    const coefficient = physics.K * state.q1 * state.q2 / state.radius ** 2;
    const maxForce = Math.max(Math.abs(coefficient / (2 + MIN_GAP) ** 2), ...(series || []).map((point) => Math.abs(point.force)));
    const unit = forceUnits(maxForce);
    const limit = maxForce ? maxForce / unit.factor * 1.12 : 1;
    const ymin = coefficient < 0 ? -limit : 0;
    const ymax = coefficient < 0 ? 0 : limit;
    const mapX = (gap) => left + Math.log(gap / MIN_GAP) / Math.log(MAX_GAP / MIN_GAP) * pw;
    const mapY = (force) => top + (ymax - force / unit.factor) / (ymax - ymin) * ph;
    ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'right';
    for (let tick = 0; tick <= 4; tick++) {
      const value = ymin + (ymax - ymin) * tick / 4;
      const y = top + ph - ph * tick / 4;
      ctx.strokeStyle = colors.border; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
      ctx.fillStyle = colors.muted;
      ctx.fillText(Math.abs(value) < 1e-10 ? '0' : value.toFixed(limit >= 100 ? 0 : limit >= 10 ? 1 : 2), left - 9, y + 3);
    }
    const xticks = w < 430 ? [.05, 1, 50, MAX_GAP] : [.05, .5, 5, 50, 500, MAX_GAP];
    ctx.textAlign = 'center';
    for (const value of xticks) {
      const x = mapX(value);
      ctx.fillStyle = colors.muted; ctx.fillText(String(value), x, h - 14);
      ctx.strokeStyle = colors.border;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + ph); ctx.stroke();
    }
    ctx.fillStyle = colors.muted; ctx.textAlign = 'left'; ctx.font = '10px system-ui';
    ctx.fillText(`F (${maxForce ? unit.unit : 'N'})`, left, 11);
    ctx.textAlign = 'right'; ctx.fillText('g / R', w - right, h - 1);
    function curve() {
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const g = MIN_GAP * (MAX_GAP / MIN_GAP) ** (i / 100);
        const force = coefficient / (2 + g) ** 2;
        if (i === 0) ctx.moveTo(mapX(g), mapY(force));
        else ctx.lineTo(mapX(g), mapY(force));
      }
      ctx.stroke();
    }
    if (series) {
      ctx.strokeStyle = colors['plot-line']; ctx.lineWidth = 3; ctx.beginPath();
      series.forEach((point, i) => { if (i === 0) ctx.moveTo(mapX(point.gapRatio), mapY(point.force)); else ctx.lineTo(mapX(point.gapRatio), mapY(point.force)); });
      ctx.stroke();
    }
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.3; ctx.setLineDash([5, 5]); curve(); ctx.setLineDash([]);
    const currentX = mapX(state.gapRatio), currentY = mapY(direct ? direct.force : solution.force);
    ctx.strokeStyle = colors.accent; ctx.lineWidth = .8; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(currentX, top); ctx.lineTo(currentX, top + ph); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.arc(currentX, currentY, 4.5, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = colors.panel; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawSlices(colors) {
    const { ctx, width: w, height: h } = prepareCanvas($('slice-chart'));
    if (!w || !h) return;
    const left = 12, right = 12, top = 13, bottom = 32;
    const pw = w - left - right, ph = h - top - bottom;
    const slices = direct ? direct.slices : [];
    const max = Math.max(...slices.map((slice) => Math.abs(slice.force))) || 1;
    const barWidth = Math.min(36, pw / (state.gridSize * 1.5));
    ctx.font = '9px system-ui';
    ctx.textAlign = 'left'; ctx.fillStyle = colors.muted; ctx.fillText('各層 |ΔF|', left, 9);
    for (const slice of slices) {
      const x = left + (slice.u + 1) / 2 * pw;
      const barHeight = Math.abs(slice.force) / max * (ph - 8);
      ctx.globalAlpha = .45 + .5 * Math.abs(slice.force) / max;
      ctx.fillStyle = colors['plot-line'];
      ctx.fillRect(x - barWidth / 2, top + ph - barHeight, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, top + ph); ctx.lineTo(w - right, top + ph); ctx.stroke();
    ctx.fillStyle = colors.muted; ctx.textAlign = 'left'; ctx.fillText('近 A 側 · −R', left, h - 12);
    ctx.textAlign = 'center'; ctx.fillText('B 球心 · 0', w / 2, h - 12);
    ctx.textAlign = 'right'; ctx.fillText('遠 A 側 · +R', w - right, h - 12);
    if (solution.force === 0) {
      ctx.textAlign = 'center'; ctx.fillText('體電荷的各層受力皆為零', w / 2, top + ph / 2);
    }
  }

  function drawErrorChart(colors) {
    const { ctx, width: w, height: h } = prepareCanvas($('error-chart'));
    const left = 57, right = 13, top = 19, bottom = 26;
    const pw = w - left - right, ph = h - top - bottom;
    const maxError = Math.max(...(series || []).map((point) => Math.abs(point.error || 0) * 100), Math.abs(direct?.magnitudeRelativeError || 0) * 100);
    const limit = maxError > 0 ? maxError * 1.3 : .01;
    const mapX = (g) => left + Math.log(g / MIN_GAP) / Math.log(MAX_GAP / MIN_GAP) * pw;
    const mapY = (error) => top + (limit - error * 100) / (2 * limit) * ph;
    ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'right';
    for (const tick of [-1, 0, 1]) {
      const value = limit * tick;
      const y = mapY(value / 100);
      ctx.strokeStyle = tick === 0 ? colors.muted : colors.border;
      ctx.lineWidth = tick === 0 ? 1 : .7;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
      ctx.fillStyle = colors.muted;
      const label = tick === 0 ? '0' : limit < .001 ? value.toExponential(1) : `${value > 0 ? '+' : ''}${value.toFixed(limit < .1 ? 3 : 2)}`;
      ctx.fillText(label, left - 7, y + 3);
    }
    ctx.font = '9px system-ui'; ctx.fillStyle = colors.muted; ctx.textAlign = 'left'; ctx.fillText('偏差 (%)', left, 9);
    ctx.textAlign = 'center';
    for (const tick of [.05, 1, 50, MAX_GAP]) ctx.fillText(String(tick), mapX(tick), h - 10);
    if (series && solution.force !== 0) {
      ctx.strokeStyle = colors['plot-line']; ctx.lineWidth = 2; ctx.beginPath();
      series.forEach((point, i) => { const x = mapX(point.gapRatio), y = mapY(point.error); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
    }
    if (direct && solution.force !== 0) {
      ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.arc(mapX(state.gapRatio), mapY(direct.magnitudeRelativeError), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    if (solution.force === 0) { ctx.textAlign = 'center'; ctx.fillText('基準力為零，不定義相對偏差', w / 2, top + ph * .3); }
  }

  function updateText() {
    updatePairs();
    $('gap-output').textContent = state.gapRatio.toFixed(2);
    $('radius-output').textContent = `${(state.radius * 100).toFixed(1)} cm`;
    $('charge-a-output').textContent = signedCharge(state.q1);
    $('charge-b-output').textContent = signedCharge(state.q2);
    $('grid-output').textContent = String(state.gridSize);
    $('distance-readout').textContent = `球心距 d = ${(solution.separation * 100).toFixed(2)} cm`;
    $('force-direction').textContent = direction(solution.force);
    if (direct) writeForce($('integrated-force'), direct.force);
    else $('integrated-force').textContent = calculationError ? '計算失敗' : '演算中…';
    writeForce($('coulomb-force'), solution.coulombForce);
    const relativeError = integral.relativeError;
    const numericallyClose = direct && Math.abs(direct.magnitudeRelativeError) < 1e-7;
    $('force-ratio').textContent = solution.force === 0 ? '不適用' : direct ? (Math.abs(direct.force / solution.force)).toFixed(6) : '—';
    $('force-difference').textContent = solution.force === 0 ? '兩者皆為零；不計算 0 / 0' : numericallyClose ? '數值差異 < 0.00001 %' : direct ? `數值${direct.magnitudeRelativeError > 0 ? '偏大' : '偏小'} ${(Math.abs(direct.magnitudeRelativeError) * 100).toFixed(5)} %` : '逐對加總中…';
    $('integration-error').textContent = solution.force === 0 ? '兩者皆為零' : `誤差 ${relativeError < 1e-12 ? '< 10⁻¹⁰ %' : `${(relativeError * 100).toExponential(2)} %`}`;
    $('integral-description').textContent = direct ? `${direct.pairs.toLocaleString()} 對三維電荷作用` : '正在計算所有 A–B 電荷對';
    $('point-count').textContent = direct ? `每球 ${direct.pointsPerSphere.toLocaleString()} 個電荷點` : '每球 — 個電荷點';
    $('pair-count').textContent = direct ? `共 ${direct.pairs.toLocaleString()} 對作用` : '逐對演算中…';
    $('hemisphere-contribution').textContent = direct && direct.force !== 0 ? `近側 ${(100 * direct.nearForce / direct.force).toFixed(1)}% · 遠側 ${(100 * direct.farForce / direct.force).toFixed(1)}%` : solution.force === 0 ? '近側 0 · 遠側 0' : '演算中…';
    $('solver-status').textContent = `逐對加總：每軸 ${state.gridSize} 格${direct ? `，每球 ${direct.pointsPerSphere} 點、${direct.pairs.toLocaleString()} 對作用` : '，演算中'}。獨立體積分：16 階、${integral.samples} 節點${solution.force === 0 ? '，解析值與數值皆為零。' : `，相對誤差 ${relativeError.toExponential(2)}。`}`;
    if (solution.force === 0) {
      $('insight-title').textContent = '一球的電荷密度為零，合力就是零';
      $('insight-text').textContent = '本模型中，總電荷 Q = 0 表示均勻體電荷密度 ρ = 0；沒有可重新分布的感應電荷。全體電荷加總與球心公式都得到零。';
    } else {
      $('insight-title').textContent = numericallyClose ? '數值合力已非常接近球心公式' : direct ? `本次數值${direct.magnitudeRelativeError > 0 ? '偏大' : '偏小'}：先檢查有限分割的誤差` : '連續均勻球的完整合力，精確等於球心公式';
      $('insight-text').textContent = '每個小格用格心點電荷代替，球面邊界也被近似；有限分割不再具有精確球對稱，所以數值可偏大或偏小。提高格數並對照體積分，才能分辨計算誤差與物理差異。近側局部作用更強，不代表連續球的整體合力超過球心公式。';
    }
    document.querySelectorAll('[data-preset]').forEach((button) => {
      const preset = presets[button.dataset.preset];
      const active = Math.abs(state.q1 - preset.q1) < 1e-18 && Math.abs(state.q2 - preset.q2) < 1e-18;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function render() {
    scheduled = false;
    solution = physics.solve(params());
    integral = physics.integrateForce(solution, 16);
    const key = JSON.stringify({ ...params(), gridSize: state.gridSize });
    if (key !== computationKey) {
      computationKey = key;
      direct = null; series = null; calculationError = '';
      $('chart-status').textContent = '曲線演算中…';
      requestCalculation();
    }
    updateText();
    const colors = palette();
    drawScene(colors); drawForceChart(colors); drawErrorChart(colors); drawSlices(colors); drawPairChart(colors);
  }

  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(render); }
  }

  function syncControls() {
    $('gap').value = String(sliderFromGap(state.gapRatio));
    $('radius').value = String(state.radius * 100);
    $('charge-a').value = String(state.q1 * 1e9);
    $('charge-b').value = String(state.q2 * 1e9);
    $('grid-size').value = String(state.gridSize);
    $('show-local').checked = state.showLocal;
    $('show-pairs').checked = state.showPairs;
  }

  const bindings = {
    gap: (value) => { state.gapRatio = gapFromSlider(Number(value)); },
    radius: (value) => { state.radius = Number(value) / 100; },
    'charge-a': (value) => { state.q1 = Number(value) * 1e-9; },
    'charge-b': (value) => { state.q2 = Number(value) * 1e-9; },
    'grid-size': (value) => { state.gridSize = Number(value); }
  };
  Object.entries(bindings).forEach(([id, setter]) => $(id).addEventListener('input', (event) => { setter(event.target.value); schedule(); }));
  $('show-local').addEventListener('change', (event) => { state.showLocal = event.target.checked; schedule(); });
  $('show-pairs').addEventListener('change', (event) => { state.showPairs = event.target.checked; schedule(); });
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    Object.assign(state, presets[button.dataset.preset]); syncControls(); schedule();
  }));
  $('far-away').addEventListener('click', () => { state.gapRatio = MAX_GAP; syncControls(); schedule(); });
  $('reset').addEventListener('click', () => {
    Object.assign(state, { radius: .03, gapRatio: .2, q1: 5e-9, q2: 5e-9, gridSize: 7, showLocal: true, showPairs: false });
    fitView();
    syncControls(); schedule();
  });

  $('view-zoom').addEventListener('input', (event) => setViewZoom(MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** (Number(event.target.value) / 1000)));
  $('view-in').addEventListener('click', () => setViewZoom(view.zoom * Math.SQRT2));
  $('view-out').addEventListener('click', () => setViewZoom(view.zoom / Math.SQRT2));
  $('view-fit').addEventListener('click', fitView);
  $('view-a').addEventListener('click', () => focusSphere(0));
  $('view-b').addEventListener('click', () => focusSphere(1));
  const scene = $('scene');
  scene.addEventListener('wheel', (event) => {
    event.preventDefault();
    const box = scene.getBoundingClientRect();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1);
    setViewZoom(view.zoom * Math.exp(-Math.max(-300, Math.min(300, pixels)) * .002), { x: event.clientX - box.left, y: event.clientY - box.top });
  }, { passive: false });
  scene.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !sceneTransform) return;
    dragStart = { id: event.pointerId, x: event.clientX, y: event.clientY, centerX: view.centerX, centerY: view.centerY, scale: sceneTransform.scale };
    scene.setPointerCapture(event.pointerId);
    scene.classList.add('is-dragging');
    scene.focus({ preventScroll: true });
  });
  scene.addEventListener('pointermove', (event) => {
    if (!dragStart || event.pointerId !== dragStart.id) return;
    view.centerX = dragStart.centerX - (event.clientX - dragStart.x) / dragStart.scale;
    view.centerY = dragStart.centerY + (event.clientY - dragStart.y) / dragStart.scale;
    scheduleView();
  });
  function finishDrag(event) {
    if (!dragStart || event.pointerId !== dragStart.id) return;
    dragStart = null;
    scene.classList.remove('is-dragging');
  }
  scene.addEventListener('pointerup', finishDrag);
  scene.addEventListener('pointercancel', finishDrag);
  scene.addEventListener('lostpointercapture', finishDrag);
  scene.addEventListener('keydown', (event) => {
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[event.key] && sceneTransform) {
      event.preventDefault();
      const [x, y] = arrows[event.key];
      const amount = (event.shiftKey ? 120 : 40) / sceneTransform.scale;
      view.centerX += x * amount; view.centerY += y * amount; scheduleView();
    } else if (['+', '=', '-', 'Home'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') fitView();
      else setViewZoom(view.zoom * (event.key === '-' ? 1 / Math.SQRT2 : Math.SQRT2));
    }
  });

  function setTheme(light) {
    document.body.classList.toggle('light', light);
    $('theme-toggle').textContent = light ? '切換深色' : '切換淺色';
    $('theme-toggle').setAttribute('aria-pressed', String(light));
    const meta = document.querySelector('meta[name="theme-color"]');
    meta.content = light ? '#f6f1e7' : '#101b2b';
    schedule();
  }

  function receiveCalculation(message) {
    if (message.id !== requestId) return;
    if (message.type === 'current') direct = message.result;
    if (message.type === 'series') { series = message.series; $('chart-status').textContent = `${series.length} 個間距 · 已逐對演算`; }
    if (message.type === 'progress') $('chart-status').textContent = `演算曲線 ${message.count} / ${message.total}`;
    if (message.type === 'error') { calculationError = message.message; $('chart-status').textContent = '數值演算失敗'; }
    schedule();
  }

  async function calculateWithoutWorker(message) {
    // Local file previews may prohibit Workers. Keep those previews usable,
    // yielding between sweep points instead of freezing the controls.
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (message.id !== requestId) return;
      receiveCalculation({ id: message.id, type: 'current', result: physics.directSumForce(message.params, message.gridSize) });
      const points = [];
      for (let i = 0; i < 37; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (message.id !== requestId) return;
        const g = MIN_GAP * (MAX_GAP / MIN_GAP) ** (i / 36);
        const result = physics.directSumForce({ ...message.params, separation: message.params.radius * (2 + g) }, message.gridSize);
        points.push({ gapRatio: g, force: result.force, error: result.magnitudeRelativeError });
      }
      receiveCalculation({ id: message.id, type: 'series', series: points });
    } catch (error) { receiveCalculation({ id: message.id, type: 'error', message: error.message }); }
  }

  function requestCalculation() {
    const message = { id: ++requestId, params: params(), gridSize: state.gridSize, minGap: MIN_GAP, maxGap: MAX_GAP };
    if (worker) worker.postMessage(message);
    else calculateWithoutWorker(message);
  }

  try {
    worker = new Worker('worker.js');
    worker.onmessage = (event) => receiveCalculation(event.data);
    worker.onerror = () => { worker.terminate(); worker = null; requestCalculation(); };
  } catch (_) { worker = null; }
  $('theme-toggle').addEventListener('click', () => setTheme(!document.body.classList.contains('light')));
  // Each visit starts with the requested cream background, including for
  // visitors who saved the previous version's dark-theme preference.
  setTheme(true);
  syncControls();
  new ResizeObserver(schedule).observe(document.querySelector('.results'));
  canvases.forEach((canvas) => new ResizeObserver(schedule).observe(canvas));
  schedule();
})();
