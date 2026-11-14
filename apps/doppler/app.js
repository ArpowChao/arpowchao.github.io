(() => {
  'use strict';
  const P = window.DopplerPhysics, $ = id => document.getElementById(id);
  const canvas = $('pond'), ctx = canvas.getContext('2d');
  const params = { c: 1, f: 1, mach: 0 };
  const observers = [{ x: 5, y: 0 }, { x: -5, y: 0 }];
  const LETTERS = 'ABCDEF', DUCK_FILL = ['#32a0ac', '#88bdc3', '#d1709a', '#7a8fd6', '#6db36d', '#d48a3c'];
  const EXTRA_SPOTS = [[0, 4], [0, -4], [3.5, 3], [-3.5, -3], [3.5, -3], [-3.5, 3]];
  const FLASH_MS = 520;
  let view3d = null;
  const tasks = window.DopplerTasks;
  let time = 5, playing = false, lastFrame = null, lastReadout = 0;
  let swim = 0; // 小鴨游動速度（倍波速，向左）；只在示範（自動模擬）時移動
  let ruler = null, measureMode = false, pointer = null, view = null;
  let manual = true, pieces = [], selectedPiece = 0, savedCenters = null;
  let preview = null, flashDirty = false;
  const quack = new window.DopplerQuack();
  const undo = [];
  const legacyParking = [{ x: -2, y: 1.5 }, { x: 1.5, y: 1 }, { x: -1.5, y: -1.5 }, { x: 2, y: -1 }, { x: 0, y: 2 }, { x: 3, y: -2 }];
  let task = 0, answers = tasks.map(() => ''), savedStudent = '', storageOK = true;
  const records = [];
  const fmt = (v, places = 2) => Number(v).toFixed(places);
  const status = message => { $('status').textContent = message; const f = document.getElementById('fs-status'); if (f) f.textContent = message; };
  try {
    const saved = JSON.parse(localStorage.getItem('doppler-worksheet-v2') || 'null');
    if (saved && Array.isArray(saved.answers)) answers = tasks.map((_, i) => typeof saved.answers[i] === 'string' ? saved.answers[i].slice(0, 2400) : '');
    if (saved && typeof saved.student === 'string') savedStudent = saved.student.slice(0, 80);
    if (saved && typeof saved.snapToGrid === 'boolean') $('snap-grid').checked = saved.snapToGrid;
    if (saved && saved.manualSettings && [saved.manualSettings.c, saved.manualSettings.f, saved.manualSettings.mach].every(Number.isFinite) &&
        saved.manualSettings.c >= .5 && saved.manualSettings.c <= 2 && saved.manualSettings.f >= .5 && saved.manualSettings.f <= 2 &&
        Math.abs(saved.manualSettings.mach) <= .9) Object.assign(params, saved.manualSettings);
    if (saved && Array.isArray(saved.manualCenters)) savedCenters = saved.manualCenters.filter(p => Number.isInteger(p.n) && p.n >= 0 && p.n <= 10 && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 30 && Math.abs(p.y) <= 30);
    // Migrate untouched scattered defaults into the tray; retain student work.
    if (savedCenters?.length && savedCenters.every(p => p.placed === undefined && p.x === legacyParking[p.n % 6].x && p.y === legacyParking[p.n % 6].y)) savedCenters = null;
  } catch (_) { storageOK = false; }
  $('student').value = savedStudent;
  function persist() {
    try { localStorage.setItem('doppler-worksheet-v2', JSON.stringify({ answers, student: $('student').value, snapToGrid: $('snap-grid').checked, manualSettings: { ...params },
      manualCenters: pieces.map(p => ({ n: p.n, x: p.x, y: p.y, placed: p.placed })) })); }
    catch (_) { storageOK = false; }
    if (!storageOK) $('save-note').textContent = '無法保存，請先下載';
  }
  function setPlaying(next) {
    playing = Boolean(next && (!manual || preview)); lastFrame = null;
    if (!playing) quack.stop();
    $('play').textContent = playing ? 'Ⅱ 暫停' : '▶ 播放';
    $('play').setAttribute('aria-pressed', String(playing));
    $('preview-play').textContent = manual && playing ? 'Ⅱ 暫停' : preview ? preview.elapsed >= preview.end ? '▶ 重播' : '▶ 繼續' : '▶ 播放';
    $('preview-play').setAttribute('aria-pressed', String(manual && playing));
  }
  function clearPreview() { if (manual) setPlaying(false); preview = null; flashDirty = false; }
  function previewReading(i) {
    return preview ? P.snapshotReceived(params.c, preview.waves, observers[i], preview.elapsed) : { count: 0, interval: null, last: null };
  }
  // 觀察者目前位置：自己排列時不動；示範時依游動速度移動
  // 示範與觀察者動：波源早已在打水（t0 = -12 s），水面一開始就布滿波，
  // 每隻小鴨從 0 秒起都已經在被波打，叫聲節奏可以直接互相比較。
  // 波源在 5 秒時剛好走到原點（0～10 秒走在 A、B 之間），不會跑過前方的小鴨。
  function phys() {
    if (manual) return params;
    // 波源要早到讓「最前面的波前」在 0 秒時已越過整片水面（含前方小鴨）
    const x0 = -params.mach * params.c * 5, reach = 16 + Math.abs(x0);
    return { ...params, x0, t0: -Math.ceil(reach / (params.c * (1 - Math.abs(params.mach)))) };
  }
  // 圈大到把整片可見水面包住時看不到，不必畫
  const shown = waves => waves.filter(w => w.radius < Math.hypot(w.x, w.y) + 45);
  function posAt(o) { return manual ? o : P.observerAt(o, time); }
  function applySwim() { observers.forEach(o => { o.vx = -swim * params.c; o.vy = 0; }); }
  // 只算 0 秒（開始播放）之後收到的波；間隔仍用最近兩次抵達計算
  function live(o) {
    const r = P.received(phys(), o, time), events = r.events.filter(a => a.time > 1e-9);
    return { ...r, events, count: events.length };
  }
  function reading(i) { return manual ? previewReading(i) : live(observers[i]); }
  const panOf = o => Math.max(-1, Math.min(1, posAt(o).x / 6));
  const obsExtent = o => [Math.abs(o.x) + .5, Math.abs(o.x + (o.vx || 0) * 10) + .5, Math.abs(o.y) + .5];
  // 示範（自動模擬）播放時，波峰到達哪隻小鴨就讓牠叫
  let autoHits = null;
  function autoQuack(reset) {
    const counts = observers.map(o => P.received(phys(), o, time).count);
    if (!reset && autoHits && autoHits.length === counts.length && $('observers').checked && $('quack-sound').checked)
      counts.forEach((n, i) => { for (let k = autoHits[i]; k < n; k++) quack.play(i, panOf(observers[i])); });
    autoHits = counts;
  }
  function detectHits(now) {
    if (!preview || !$('observers').checked) return;
    observers.forEach((_, i) => {
      const r = previewReading(i);
      if (r.count > preview.hits[i]) {
        if ($('quack-sound').checked) for (let n = preview.hits[i]; n < r.count; n++) {
          if (!quack.play(i, panOf(observers[i]))) $('sound-status').textContent = '請按「試聽」開啟聲音';
        }
        preview.flashAt[i] = now; flashDirty = true;
      }
      preview.hits[i] = r.count;
    });
  }
  $('preview-play').addEventListener('click', async () => {
    if (playing) { setPlaying(false); refresh(); return; }
    if (!manual || pointer || !$('observers').checked || !pieces.some(p => p.placed && p.radius > 0)) return;
    if ($('quack-sound').checked && !await quack.unlock()) {
      $('sound-status').textContent = '請按「試聽」開啟聲音';
    }
    if (!manual || pointer || !$('observers').checked) return;
    if (!preview || preview.elapsed >= preview.end) {
      const waves = snapshot(), arrivals = observers.flatMap(o => P.snapshotArrivals(params.c, waves, o));
      preview = { waves, elapsed: 0, hits: observers.map(() => 0), flashAt: observers.map(() => -Infinity), end: Math.max(3, ...arrivals.map(a => a.time)) + .6 };
    }
    setMeasure(false); setPlaying(true); detectHits(performance.now()); refresh();
  });
  $('preview-reset').addEventListener('click', () => { clearPreview(); refresh(); status('已回到排列'); });
  $('quack-sound').addEventListener('change', async () => {
    if (!$('quack-sound').checked) { quack.stop(); $('sound-status').textContent = '呱聲已關閉'; }
    else $('sound-status').textContent = await quack.unlock() ? '呱聲已開啟' : '請按「試聽」開啟聲音';
  });
  $('test-quack').addEventListener('click', async () => {
    const ready = await quack.unlock();
    if (ready && quack.play(0, panOf(observers[0]))) {
      observers.slice(1).forEach((o, i) => quack.play(i + 1, panOf(o), (i + 1) * .55));
      $('quack-sound').checked = true;
      $('sound-status').textContent = observers.map((_, i) => LETTERS[i] + '「' + quack.name(i) + '」').join('　') + '　（沒聲音？調高音量）';
    } else $('sound-status').textContent = '無法播放聲音';
  });
  function configText() {
    const setting = params.mach === 0 ? '波源靜止' : '波源向' + (params.mach > 0 ? '右' : '左') + ' · ' + fmt(Math.abs(params.mach)) + ' 波速';
    return (manual ? (preview ? '我的排列播放 · 目標：' : '手動排列 · 目標：') : '自動模擬 · ') + setting;
  }
  function snapshot() { return pieces.map(p => ({ ...p })); }
  function rebuildPieces(centers = pieces) {
    clearPreview();
    const old = new Map(centers.map(p => [p.n, p]));
    const rings = P.waves({ ...params, mach: 0 }, 5).filter(w => w.radius > 1e-8);
    rings.push({ n: rings.length, emitted: 5, radius: 0, marker: true });
    pieces = rings.map(w => {
      const prior = w.marker ? centers.find(p => p.marker) || old.get(w.n) : old.get(w.n);
      const p = !w.marker && prior?.marker ? null : prior;
      return { ...w, x: p?.x ?? 0, y: p?.y ?? 0, placed: w.marker ? true : p ? p.placed !== false : false };
    });
    selectedPiece = Math.min(selectedPiece, pieces.length - 1);
    buildTray();
    refreshPieces();
  }
  function buildTray() {
    $('tray-pieces').replaceChildren();
    for (const p of pieces) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tray-piece'; button.dataset.piece = p.n;
      const radius = p.radius ? 20 * p.radius / Math.max(...pieces.map(w => w.radius)) : 0;
      button.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true">' + (radius ? '<circle cx="22" cy="22" r="' + radius + '" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="22" cy="22" r="2" fill="currentColor"/>' : '<ellipse cx="18" cy="22" rx="14" ry="10" fill="#e9b93a" stroke="#b2821a"/><circle cx="31" cy="22" r="7" fill="#e9b93a" stroke="#b2821a"/><path d="M37 19h6v6h-6" fill="#e5a234"/><path d="M9 17q8-4 15 0M9 27q8 4 15 0" fill="none" stroke="#b2821a"/><circle cx="32" cy="19" r="1" fill="#153f4d"/><circle cx="32" cy="25" r="1" fill="#153f4d"/>') + '</svg><span>' + (p.radius ? '圈 ' + (p.n + 1) : '波源小鴨') + '</span>';
      button.addEventListener('pointerdown', e => {
        if (e.button !== 0 || pointer || !manual) return;
        e.preventDefault(); clearPreview(); selectedPiece = p.n; setMeasure(false);
        if (!pieces[p.n].placed) {
          pointer = { id: e.pointerId, mode: 'piece', i: p.n, camera: { ...view }, dx: 0, dy: 0, before: snapshot(), fromTray: true, inside: false };
          capture(e.pointerId);
        }
        refresh();
      });
      button.addEventListener('click', () => { selectedPiece = p.n; setMeasure(false); refresh(); status(pieces[p.n].placed ? '這片已放在水面，可以拖曳圓心或圓周。' : '已選圓片；在水面點一下放置，或按 Enter 放在中央。'); });
      button.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectedPiece = p.n; placeAtCenter(); } });
      $('tray-pieces').append(button);
    }
  }
  function placeAtCenter() {
    clearPreview();
    const p = pieces[selectedPiece]; if (!p || p.placed) { canvas.focus({ preventScroll: true }); return; }
    const before = snapshot(); p.placed = true; p.x = 0; p.y = 0; remember(before); refresh(); canvas.focus({ preventScroll: true });
  }
  function remember(before) {
    if (!before || before.length === pieces.length && before.every((p, i) => p.x === pieces[i]?.x && p.y === pieces[i]?.y && p.placed === pieces[i]?.placed)) return;
    clearPreview();
    undo.push(before); if (undo.length > 40) undo.shift();
    refreshPieces(); persist();
  }
  function refreshPieces() {
    $('piece-select').replaceChildren();
    for (const p of pieces) $('piece-select').add(new Option((p.placed ? '' : '待放置 · ') + (p.radius === 0 ? '當下波源位置（半徑 0）' : '圓片 ' + (p.n + 1) + ' · 半徑 ' + fmt(p.radius, 1) + ' m'), String(p.n)));
    $('piece-select').value = String(selectedPiece); $('undo-piece').disabled = !undo.length;
    const p = pieces[selectedPiece];
    if (p) $('piece-readout').textContent = (p.placed ? '圓心：(' + fmt(p.x) + ', ' + fmt(p.y) + ') m · ' : '待放置 · ') + 'r=' + fmt(p.radius) + ' m';
    if (p && !$('position-form').contains(document.activeElement)) { $('piece-x').value = p.x; $('piece-y').value = p.y; }
    for (const button of $('tray-pieces').children) {
      const piece = pieces[Number(button.dataset.piece)]; button.dataset.placed = String(piece.placed);
      button.setAttribute('aria-pressed', String(piece.n === selectedPiece));
      button.setAttribute('aria-label', (piece.radius ? '圓片 ' + (piece.n + 1) + '，半徑 ' + fmt(piece.radius) + ' 公尺' : '當下波源位置') + (piece.placed ? '，已放在水面' : '，拖入水面或點選後放置'));
    }
  }
  function setManual(next) {
    setPlaying(false); clearPreview(); manual = next; pointer = null;
    if (!manual) time = 5;
    $('automatic').checked = !manual;
    $('timeline').hidden = manual; $('manual-toolbar').hidden = !manual; $('piece-panel').hidden = !manual; $('arrival-panel').hidden = manual;
    $('piece-tray').hidden = !manual;
    $('manual-scene-tools').hidden = !manual;
    $('observer-picker').hidden = manual;
    $('preset-heading').textContent = manual ? '波源速度' : '自動模擬速度';
    setMeasure(false); refresh();
    status(manual ? '拖曳圓圈排列' : '自動模擬中');
  }
  // 全螢幕時，水面畫在浮動面板之外的區域
  function safeInsets() {
    const ins = { l: 0, r: 0, t: 0, b: 0 };
    if (!document.querySelector('.experiment.is-full')) return ins;
    const stage = document.querySelector('.experiment');
    const cr = canvas.getBoundingClientRect(), portrait = cr.height > cr.width * 1.05;
    for (const p of stage.querySelectorAll('.fs-panel')) {
      if (p.hidden || p.classList.contains('folded') || !p.offsetParent) continue;
      const r = p.getBoundingClientRect();
      if (p.dataset.fs === 'time' || portrait) {
        if (r.top - cr.top < cr.height / 2) ins.t = Math.max(ins.t, r.bottom - cr.top + 8); else ins.b = Math.max(ins.b, cr.bottom - r.top + 8);
      } else if (r.left - cr.left < cr.width / 2) ins.l = Math.max(ins.l, r.right - cr.left + 8); else ins.r = Math.max(ins.r, cr.right - r.left + 8);
    }
    ins.l = Math.min(ins.l, cr.width * .4); ins.r = Math.min(ins.r, cr.width * .4); ins.t = Math.min(ins.t, cr.height * .4); ins.b = Math.min(ins.b, cr.height * .4);
    return ins;
  }
  function projection(width, height, insets = null) {
    const ins = insets || { l: 0, r: 0, t: 0, b: 0 }, w = width - ins.l - ins.r, h = height - ins.t - ins.b;
    const extent = manual ? Math.max(6.25, ...pieces.map(p => p.radius + 1.25)) :
      // 水面一開始就布滿波，視野固定：涵蓋小鴨與波源 0～10 秒走過的路段
      Math.max(6.5, Math.abs(params.mach) * params.c * 5 + 1.5, ...observers.flatMap(obsExtent));
    // Use the whole square board for the five waves, without extra side ranges
    // or a pixel-per-metre cap. The physical view stays fixed while arranging.
    const scale = Math.max(1, (Math.min(w, h) - (manual ? 0 : 54)) / (2 * extent));
    return { scale, cx: ins.l + w / 2, cy: ins.t + h / 2, width, height,
      halfWidth: width / 2 / scale, halfHeight: height / 2 / scale };
  }
  function xy(point, camera) { return { x: camera.cx + point.x * camera.scale, y: camera.cy - point.y * camera.scale }; }
  function world(x, y) { return { x: (x - view.cx) / view.scale, y: (view.cy - y) / view.scale }; }
  function text(c, label, x, y, color = '#153f4d', align = 'left', size = 12) {
    c.fillStyle = color; c.font = size + 'px "Microsoft JhengHei",sans-serif'; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(label, x, y);
  }
  function arrow(c, from, to, color) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    c.strokeStyle = color; c.lineWidth = 1.6; c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
    c.fillStyle = color; c.beginPath(); c.moveTo(to.x, to.y);
    c.lineTo(to.x - 7 * Math.cos(angle - .45), to.y - 7 * Math.sin(angle - .45));
    c.lineTo(to.x - 7 * Math.cos(angle + .45), to.y - 7 * Math.sin(angle + .45)); c.fill();
  }
  function duck(c, point, color, direction, tag, flash, sound = '呱') {
    const glow = typeof flash === 'number' ? flash : flash ? 1 : 0;
    c.save(); c.translate(point.x, point.y);
    if (glow > 0) {
      const g = c.createRadialGradient(0, 0, 4, 0, 0, 46);
      g.addColorStop(0, 'rgba(255,228,90,' + (.95 * glow) + ')'); g.addColorStop(1, 'rgba(255,228,90,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 46, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(213,158,0,' + glow + ')'; c.lineWidth = 3.5; c.beginPath(); c.arc(0, 0, 24 + 10 * (1 - glow), 0, Math.PI * 2); c.stroke();
    }
    c.scale(direction, 1); c.fillStyle = color; c.strokeStyle = '#153f4d'; c.lineWidth = .9;
    c.beginPath(); c.moveTo(-13, -4); c.lineTo(-21, 0); c.lineTo(-13, 4); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(-3, 0, 15, 10, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#153f4d55'; c.lineWidth = 1.1;
    c.beginPath(); c.ellipse(-5, -5, 8, 3, -.16, Math.PI, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(-5, 5, 8, 3, .16, 0, Math.PI); c.stroke();
    c.strokeStyle = '#153f4d'; c.lineWidth = .9; c.beginPath(); c.arc(12, 0, 7, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#e5a234'; c.beginPath(); c.moveTo(18, -3); c.lineTo(28, -2); c.lineTo(28, 2); c.lineTo(18, 3); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#153f4d'; for (const y of [-3.5, 3.5]) { c.beginPath(); c.arc(13, y, 1, 0, Math.PI * 2); c.fill(); }
    // The position marker is on the back, so its exact point remains visible.
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#153f4d'; c.beginPath(); c.arc(0, 0, 1.5, 0, Math.PI * 2); c.fill();
    c.restore(); text(c, tag, point.x, point.y + 28, '#153f4d', 'center', 14);
    if (glow > .35) text(c, sound + '！', point.x, point.y - 40, '#946400', 'center', 18);
  }
  function drawScene(c, width, height, savedCamera = null) {
    const camera = savedCamera || projection(width, height, c === ctx ? safeInsets() : null);
    c.save(); c.beginPath(); c.rect(0, 0, width, height); c.clip();
    c.fillStyle = '#f7fbfc'; c.fillRect(0, 0, width, height);
    const cell = params.c / params.f, smallCell = cell / 4;
    if ($('grid').checked) {
      const gridLines = (step, color, lineWidth) => {
        c.lineWidth = lineWidth; c.strokeStyle = color; c.beginPath();
        for (let n = Math.ceil(-camera.cx / camera.scale / step); n <= (width - camera.cx) / camera.scale / step; n++) { const px = xy({ x: n * step, y: 0 }, camera).x; c.moveTo(px, 0); c.lineTo(px, height); }
        for (let n = Math.ceil((camera.cy - height) / camera.scale / step); n <= camera.cy / camera.scale / step; n++) { const py = xy({ x: 0, y: n * step }, camera).y; c.moveTo(0, py); c.lineTo(width, py); }
        c.stroke();
      };
      if (smallCell * camera.scale >= 1) gridLines(smallCell, '#d6e4e8', .75);
      gridLines(cell, '#90b1bd', 1.2);
      c.strokeStyle = '#658e9b'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, camera.cy); c.lineTo(width, camera.cy); c.moveTo(camera.cx, 0); c.lineTo(camera.cx, height); c.stroke();
      const labelStep = cell * Math.max(1, Math.ceil(30 / (cell * camera.scale)));
      for (let n = Math.ceil(-camera.cx / camera.scale / labelStep); n <= (width - camera.cx) / camera.scale / labelStep; n++) { const x = n * labelStep, px = xy({ x, y: 0 }, camera).x; if (px > 20 && px < width - 20) text(c, fmt(x, 1).replace('.0', ''), px, height - 13, '#688790', 'center', 13); }
    }
    const waves = manual ? preview ? P.snapshotWaves(params.c, preview.waves, preview.elapsed) : pieces.filter(p => p.placed) : shown(P.waves(phys(), time));
    c.save(); c.setLineDash([3, 6]); c.lineWidth = 1; c.strokeStyle = '#b6cdd2'; c.beginPath();
    const source = xy(manual ? pieces.at(-1) : P.source(phys(), time), camera);
    if (!manual) { const from = xy(P.source(phys(), phys().t0), camera); c.moveTo(from.x, from.y); c.lineTo(source.x, source.y); c.stroke(); } c.restore();
    waves.forEach(w => {
      const p = xy(w, camera), radius = w.radius * camera.scale;
      if (radius > .1) {
        c.strokeStyle = manual && w.n === selectedPiece ? '#a47700' : w.n % 2 ? '#278aac' : '#08677f';
        c.lineWidth = manual && w.n === selectedPiece ? 2.8 : 1.7;
        c.beginPath(); c.arc(p.x, p.y, radius, 0, Math.PI * 2); c.stroke();
      }
      if ($('centers').checked) { c.fillStyle = '#507985'; c.beginPath(); c.arc(p.x, p.y, 2.5, 0, Math.PI * 2); c.fill(); }
      if (manual && w.radius > 0 && ($('centers').checked || w.n === selectedPiece)) {
        const color = w.n === selectedPiece ? '#a47700' : '#08677f';
        c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.beginPath();
        c.moveTo(p.x - 10, p.y); c.lineTo(p.x + 10, p.y); c.moveTo(p.x, p.y - 10); c.lineTo(p.x, p.y + 10); c.stroke();
        c.strokeStyle = color; c.lineWidth = 1.6; c.stroke();
        c.fillStyle = color; c.beginPath(); c.arc(p.x, p.y, 2, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffffee'; c.beginPath(); c.arc(p.x + 16, p.y - 16, 10, 0, Math.PI * 2); c.fill();
        text(c, String(w.n + 1), p.x + 16, p.y - 16, color, 'center', 14);
      }
      if ($('labels').checked && radius > 2) {
        const angle = params.mach >= 0 ? -2.05 : -.95;
        const label = '發波 t=' + fmt(w.emitted, 1).replace('.0', '') + 's';
        const tx = p.x + Math.cos(angle) * radius, ty = p.y + Math.sin(angle) * radius;
        c.fillStyle = '#f7fbfcee'; c.fillRect(tx - 50, ty - 11, 100, 22);
        text(c, label, tx, ty, '#08677f', 'center', 14);
      }
    });
    if (!manual && params.mach !== 0) arrow(c, { x: source.x, y: source.y - 30 }, { x: source.x + Math.sign(params.mach) * 42, y: source.y - 30 }, '#977008');
    if (!manual || pieces.at(-1).placed) {
      duck(c, source, '#e9b93a', params.mach < 0 ? -1 : 1, '波源', false);
      if (manual && selectedPiece === pieces.length - 1) { c.strokeStyle = '#a47700'; c.lineWidth = 2; c.beginPath(); c.arc(source.x, source.y, 22, 0, Math.PI * 2); c.stroke(); }
      if ($('labels').checked && (manual || Math.abs(waves.at(-1).emitted - time) < 1e-8)) text(c, (manual ? '當下 t=' : '剛發出 t=') + fmt(manual ? 5 : time, 1) + 's', source.x, source.y + 45, '#977008', 'center', 13);
    }
    if ($('observers').checked) observers.forEach((o, i) => {
      const sx = manual ? pieces.at(-1).x : P.source(phys(), time).x;
      const at = xy(posAt(o), camera), moving = !manual && o.vx;
      duck(c, at, DUCK_FILL[i], moving ? Math.sign(o.vx) : o.x >= sx ? -1 : 1, LETTERS[i] + ' 小鴨', glowOf(i), quack.name(i));
      if (moving) arrow(c, { x: at.x, y: at.y - 26 }, { x: at.x + Math.sign(o.vx) * 34, y: at.y - 26 }, '#3d6b78');
    });
    if (manual && pieces[selectedPiece]?.placed) {
      const selected = pieces[selectedPiece], p = xy(selected, camera);
      const label = '(' + fmt(selected.x) + ', ' + fmt(selected.y) + ')';
      const x = Math.max(5, Math.min(width - 120, p.x + 14)), y = Math.max(12, Math.min(height - 15, p.y + 21));
      c.fillStyle = '#fff9e8'; c.fillRect(x - 3, y - 12, 118, 24); text(c, label, x, y, '#765400', 'left', 14);
    }
    if (ruler) {
      const a = xy(ruler.a, camera), b = xy(ruler.b, camera);
      c.save(); c.strokeStyle = '#a47700'; c.lineWidth = 2; c.setLineDash([5, 3]); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.restore();
      for (const p of [a, b]) { c.fillStyle = '#a47700'; c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill(); }
      const label = fmt(P.distance(ruler.a, ruler.b)) + ' m', x = Math.max(40, Math.min(width - 40, (a.x + b.x) / 2)), y = Math.max(16, Math.min(height - 16, (a.y + b.y) / 2 - 14));
      c.fillStyle = '#fff5d4'; c.fillRect(x - 45, y - 12, 90, 24); text(c, label, x, y, '#765400', 'center', 15);
    }
    c.restore(); return { camera, cell };
  }
  // 波峰剛到時的發光強度（0～1，逐漸淡出）
  function glowOf(i) {
    if (manual) { const t = preview ? performance.now() - (preview.flashAt[i] ?? -Infinity) : Infinity; return t < FLASH_MS ? 1 - t / FLASH_MS : 0; }
    const r = P.received(phys(), observers[i], time); if (r.last === null) return 0;
    const dt = (time - r.last) * 1000 / Math.max(.25, Number($('play-rate').value)); return dt < FLASH_MS ? 1 - dt / FLASH_MS : 0;
  }
  function draw() {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
    // Fill the whole backing bitmap, including any fractional CSS edge pixel.
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f7fbfc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const result = drawScene(ctx, rect.width, rect.height); view = result.camera;
    $('grid-caption').textContent = $('grid').checked ? '1 大格 = 1λ = ' + fmt(result.cell, 2).replace(/\.00$/, '') + ' m' : '';
    canvas.dataset.wavelength = result.cell; canvas.dataset.smallCell = result.cell / 4;
    canvas.dataset.placedCount = pieces.filter(p => p.placed).length;
    canvas.dataset.placedCircleCount = pieces.filter(p => p.radius > 0 && p.placed).length;
  }
  function readouts() {
    $('scene-time').textContent = manual ? preview ? '我的排列 · ＋' + fmt(preview.elapsed) + ' s' : '自己組合 · 5 s' : 't = ' + fmt(time) + ' s'; $('time-readout').textContent = fmt(time) + ' s'; $('time').value = time;
    $('manual-playback').hidden = !$('observers').checked;
    ['preview-play', 'preview-reset', 'preview-time'].forEach(id => { $(id).hidden = !manual; });
    $('preview-play').disabled = !pieces.some(p => p.placed && p.radius > 0);
    $('preview-reset').disabled = !preview;
    $('preview-time').value = '經過 ' + fmt(preview?.elapsed || 0) + ' s';
    for (let i = 0; i < 2; i++) {
      const id = i ? 'b' : 'a', r = reading(i);
      $('duck-' + id + '-count').textContent = '收到 ' + r.count + ' 次';
      $('duck-' + id + '-interval').textContent = r.interval === null ? '間隔 —' : '間隔 ' + fmt(r.interval, 2) + ' s（每秒 ' + fmt(1 / r.interval, 2) + ' 次）';
      $('duck-' + id + '-reading').dataset.flash = String(glowOf(i) > .3);
    }
    $('scene-setting').textContent = manual ? '題目：' + (params.mach === 0 ? '靜止波源' : fmt(Math.abs(params.mach)) + ' 波速向' + (params.mach > 0 ? '右' : '左')) : configText();
    $('parameter-note').textContent = '波源移速 ' + fmt(Math.abs(params.mach * params.c)) + ' m/s' + (manual ? '（不會自動排列）' : '');
    $('mach-value').textContent = fmt(Math.abs(params.mach));
    $('measurement').textContent = ruler ? '距離 ' + fmt(P.distance(ruler.a, ruler.b)) + ' m' : '按「量距離」後在水面拖曳';
    $('clear-measure').disabled = !ruler;
    $('back').disabled = time <= 0; $('step').disabled = time >= 10;
    $('manual-toolbar').firstElementChild.textContent = (pieces.length - 1) + ' 個圓圈＋波源小鴨';
    $('arrival-readings').replaceChildren();
    if (manual) { refreshPieces(); return; }
    if (!$('observers').checked) { const p = document.createElement('p'); p.className = 'copy'; p.textContent = '先勾選「A、B 小鴨」'; $('arrival-readings').append(p); return; }
    observers.forEach((o, i) => {
      const r = live(o), card = document.createElement('div'); card.className = 'arrival-card';
      const q = posAt(o), h = document.createElement('h3'); h.textContent = LETTERS[i] + ' 小鴨 · (' + fmt(q.x, 1) + ', ' + fmt(q.y, 1) + ') m'; card.append(h);
      for (const label of ['抵達 ' + r.count + ' 次', '間隔 ' + (r.interval === null ? '—' : fmt(r.interval, 2) + ' s'), '頻率 ' + (r.frequency === null ? '—' : fmt(r.frequency, 2) + ' 次/s')]) { const p = document.createElement('p'); p.textContent = label; card.append(p); }
      const p = document.createElement('p'); p.className = 'arrival-times'; p.textContent = r.events.length ? '抵達時刻：' + r.events.map(a => fmt(a.time, 2) + 's').join('、') : '還沒有波抵達。'; card.append(p);
      $('arrival-readings').append(card);
    });
  }
  function refresh() { fsSync(); draw(); readouts(); }
  function setTime(next) { setPlaying(false); time = Math.max(0, Math.min(10, next)); refresh(); }
  function changeMach(value) {
    setPlaying(false); clearPreview(); params.mach = value; $('mach').value = Math.abs(value); $('reverse').checked = value < 0;
    document.querySelectorAll('[data-mach]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.mach) === value)));
    refresh(); persist(); status('速度：' + (value === 0 ? '靜止' : fmt(Math.abs(value)) + ' 波速'));
  }
  document.querySelectorAll('[data-mach]').forEach(button => button.addEventListener('click', () => changeMach(Number(button.dataset.mach))));
  $('play').addEventListener('click', () => { quack.unlock(); if (time >= 10 && !playing) time = 0; autoHits = null; setPlaying(!playing); refresh(); });
  $('reset').addEventListener('click', () => { setTime(0); status('回到 0 秒'); });
  $('time').addEventListener('input', () => setTime(Number($('time').value)));
  $('step').addEventListener('click', () => setTime((Math.floor(time * params.f + 1e-8) + 1) / params.f));
  $('back').addEventListener('click', () => setTime((Math.ceil(time * params.f - 1e-8) - 1) / params.f));
  ['labels', 'centers', 'grid'].forEach(id => $(id).addEventListener('change', refresh));
  $('observers').addEventListener('change', () => { clearPreview(); refresh(); });
  function setMeasure(next) {
    measureMode = next; $('measure').setAttribute('aria-pressed', String(next)); canvas.style.cursor = next ? 'crosshair' : 'grab';
    $('gesture-hint').textContent = next ? '在水面拖曳量距離' : manual ? '拖入水面排列' : '拖曳 A、B 小鴨';
  }
  $('measure').addEventListener('click', () => { setPlaying(false); setMeasure(!measureMode); refresh(); });
  $('clear-measure').addEventListener('click', () => { ruler = null; refresh(); });
  function basic() {
    params.c = 1; params.f = 1; $('wave-speed').value = 1; $('frequency').value = 1; $('play-rate').value = 1;
    rebuildPieces(); undo.length = 0;
    ruler = null; setMeasure(false); changeMach(0);
  }
  $('restore').addEventListener('click', () => { basic(); status('已恢復預設'); });
  ['wave-speed', 'frequency'].forEach((id, i) => $(id).addEventListener('change', () => {
    const input = $(id), value = Number(input.value), key = i ? 'f' : 'c';
    if (!input.value || !Number.isFinite(value) || value < .5 || value > 2 || !input.checkValidity()) { input.value = params[key]; status('請輸入 0.5～2'); return; }
    setPlaying(false); params[key] = value; rebuildPieces(); undo.length = 0; refresh(); persist();
    status('已更新');
  }));
  ['mach', 'reverse'].forEach(id => $(id).addEventListener('input', () => changeMach(Number($('mach').value) * ($('reverse').checked ? -1 : 1))));
  $('automatic').addEventListener('change', () => setManual(!$('automatic').checked));
  $('piece-select').addEventListener('change', () => { selectedPiece = Number($('piece-select').value); setMeasure(false); refresh(); });
  $('scatter').addEventListener('click', () => { const before = snapshot(), source = pieces.at(-1); rebuildPieces([source]); ruler = null; remember(before); refresh(); status('已全部收回'); });
  $('undo-piece').addEventListener('click', () => { if (!undo.length) return; clearPreview(); pieces = undo.pop(); refresh(); persist(); status('已復原'); });
  function constrainPiece(p, camera, snap = false) {
    const pad = .35, maxX = Math.max(0, camera.halfWidth - p.radius - pad);
    const maxY = Math.max(0, camera.halfHeight - p.radius - pad);
    const step = params.c / params.f / 4;
    const limitX = snap ? Math.floor((maxX + 1e-9) / step) * step : maxX;
    const limitY = snap ? Math.floor((maxY + 1e-9) / step) * step : maxY;
    p.x = Math.max(-limitX, Math.min(limitX, snap ? Math.round(p.x / step) * step : p.x));
    p.y = Math.max(-limitY, Math.min(limitY, snap ? Math.round(p.y / step) * step : p.y));
    if (Math.abs(p.x) < 1e-12) p.x = 0; if (Math.abs(p.y) < 1e-12) p.y = 0;
  }
  function setPosition(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const p = pieces[selectedPiece], candidate = { ...p, x, y };
    constrainPiece(candidate, view);
    if (Math.abs(candidate.x - x) > 1e-8 || Math.abs(candidate.y - y) > 1e-8) {
      $('position-note').textContent = '超出水面，請靠近中央'; return;
    }
    const before = snapshot(); Object.assign(p, { x, y, placed: true });
    clearPreview();
    $('piece-x').value = x; $('piece-y').value = y;
    $('position-note').textContent = '已放到 (' + fmt(x) + ', ' + fmt(y) + ')';
    remember(before); refresh();
  }
  $('position-form').addEventListener('submit', e => { e.preventDefault(); if ($('position-form').reportValidity()) setPosition($('piece-x').valueAsNumber, $('piece-y').valueAsNumber); });
  $('piece-origin').addEventListener('click', () => setPosition(0, 0));
  $('snap-grid').addEventListener('change', () => {
    setMeasure(measureMode);
    persist();
    status($('snap-grid').checked ? '拖曳時圓心會對齊小格交點；你排好的位置保留。' : '可以自由拖曳，或輸入座標精確放置。');
  });
  function hitPiece(point) {
    const candidates = pieces.filter(p => p.placed).map(p => {
      const center = xy(p, view), d = Math.hypot(center.x - point.x, center.y - point.y);
      return { p, d, edge: Math.abs(d - p.radius * view.scale) };
    });
    const centers = candidates.filter(h => h.d < (h.p.radius === 0 ? 24 : 13));
    if (centers.length) return (centers.find(h => h.p.n === selectedPiece) || centers.sort((a, b) => a.d - b.d)[0]).p;
    const edges = candidates.filter(h => h.p.radius > 0 && h.edge < 12);
    return (edges.find(h => h.p.n === selectedPiece) || edges.sort((a, b) => a.edge - b.edge)[0])?.p;
  }
  function capture(id) { try { canvas.setPointerCapture(id); } catch (_) { } }
  function eventPoint(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || pointer) return;
    const p = eventPoint(e); setPlaying(false); canvas.focus({ preventScroll: true });
    if (manual && preview && !measureMode) { clearPreview(); draw(); }
    if (measureMode) { pointer = { id: e.pointerId, mode: 'measure' }; const w = world(p.x, p.y); ruler = { a: w, b: { ...w } }; }
    else {
      const observerIndex = $('observers').checked ? observers.findIndex(o => { const s = xy(posAt(o), view); return Math.hypot(s.x - p.x, s.y - p.y) < 24; }) : -1;
      const piece = manual ? hitPiece(p) : null;
      if (manual && !pieces[selectedPiece].placed && !piece && observerIndex < 0) {
        const before = snapshot(), selected = pieces[selectedPiece], w = world(p.x, p.y);
        selected.placed = true; selected.x = w.x; selected.y = w.y; constrainPiece(selected, view, $('snap-grid').checked);
        pointer = { id: e.pointerId, mode: 'piece', i: selected.n, camera: { ...view }, dx: selected.x - w.x, dy: selected.y - w.y, before };
        capture(e.pointerId); refresh(); return;
      }
      if (observerIndex >= 0 && (!piece || P.distance(piece, world(p.x, p.y)) * view.scale > 13)) {
        $('observer-select').value = observerIndex; pointer = { id: e.pointerId, mode: 'observer', i: observerIndex, camera: { ...view } };
      } else if (piece) {
        selectedPiece = piece.n; const w = world(p.x, p.y);
        pointer = { id: e.pointerId, mode: 'piece', i: piece.n, camera: { ...view }, dx: piece.x - w.x, dy: piece.y - w.y, before: snapshot() };
      } else { status(manual ? '抓圓心或圓周拖曳' : '拖曳 A、B 小鴨'); return; }
    }
    capture(e.pointerId); refresh();
  });
  // iPad Safari：手指從圓片托盤開始拖時，事件可能仍送到托盤按鈕，所以在 window 上統一接收
  window.addEventListener('pointermove', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    const p = eventPoint(e), cam = pointer.camera || view;
    if (pointer.fromTray) {
      pointer.inside = p.x >= 0 && p.y >= 0 && p.x <= cam.width && p.y <= cam.height;
      pieces[pointer.i].placed = pointer.inside;
      if (!pointer.inside) { refresh(); return; }
    }
    const w = { x: (Math.max(24, Math.min(cam.width - 24, p.x)) - cam.cx) / cam.scale, y: (cam.cy - Math.max(24, Math.min(cam.height - 24, p.y))) / cam.scale };
    if (pointer.mode === 'measure') ruler.b = w;
    else if (pointer.mode === 'piece') {
      const piece = pieces[pointer.i]; piece.x = w.x + pointer.dx; piece.y = w.y + pointer.dy; constrainPiece(piece, cam, $('snap-grid').checked);
    }
    else { const o = observers[pointer.i], t = manual ? 0 : time; observers[pointer.i] = { ...o, x: w.x - (o.vx || 0) * t, y: w.y - (o.vy || 0) * t }; }
    refresh();
  });
  function finish(e) {
    if (!pointer || pointer.id !== e.pointerId) return;
    const action = pointer; pointer = null; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (action.mode === 'piece') {
      if (e.type === 'pointercancel' || action.fromTray && !action.inside) pieces = action.before;
      else remember(action.before);
    }
    status(manual ? '已放好' : '已暫停'); refresh();
  }
  window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);
  canvas.addEventListener('lostpointercapture', () => { if (pointer?.mode === 'piece') pieces = pointer.before; pointer = null; refresh(); });
  canvas.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (pointer?.mode === 'piece') pieces = pointer.before; pointer = null; ruler = null; setMeasure(false); refresh(); return; }
    if (e.key === 'Enter' && manual && !pointer) { e.preventDefault(); placeAtCenter(); return; }
    if (pointer || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || (!manual && !$('observers').checked)) return;
    e.preventDefault(); setPlaying(false); if (manual) clearPreview();
    const before = manual ? snapshot() : null;
    const o = manual ? pieces[selectedPiece] : observers[Number($('observer-select').value)], step = manual ? params.c / params.f / (e.shiftKey ? 20 : 4) : e.shiftKey ? .1 : .25;
    o.x = Math.max(-20, Math.min(20, o.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)));
    o.y = Math.max(-20, Math.min(20, o.y + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0)));
    if (manual) { o.placed = true; constrainPiece(o, view, !e.shiftKey && $('snap-grid').checked); remember(before); } refresh();
  });
  function loadQuestion() {
    const t = tasks[task];
    $('question').textContent = t.q; $('answer').value = answers[task];
    $('load-task').hidden = !t.setup;
    document.dispatchEvent(new CustomEvent('doppler:task', { detail: { index: task, task: t } }));
  }
  $('task').addEventListener('change', () => { task = Number($('task').value); loadQuestion(); });
  $('answer').addEventListener('input', () => { answers[task] = $('answer').value; persist(); });
  $('student').addEventListener('input', persist);
  $('load-task').addEventListener('click', () => {
    const setup = tasks[task].setup; if (!setup) return;
    basic(); observers.length = 2; observers[0] = { x: 5, y: 0 }; observers[1] = { x: -5, y: 0 }; syncDucks();
    setManual(true); time = 5;
    $('labels').checked = false; $('observers').checked = setup.observers; $('centers').checked = true; $('grid').checked = true;
    swim = 0; applySwim(); changeMach(setup.mach);
    if (setup.swim) { observers[0] = { x: 6, y: 0 }; observers[1] = { x: -4, y: 0 }; syncDucks(); setSwim(true, false); time = 0; setPlaying(false); }
    syncQuick(); refresh();
    status('已套用第 ' + (task + 1) + ' 題設定' + (setup.swim ? '：按「▶ 播放」開始' : ''));
  });
  function wrap(c, value, maxWidth) {
    const lines = [];
    for (const paragraph of value.split('\n')) {
      let line = '';
      for (const char of paragraph) { if (line && c.measureText(line + char).width > maxWidth) { lines.push(line); line = char; } else line += char; }
      lines.push(line);
    }
    return lines;
  }
  function download(url, name) { const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); }
  function studentLabel() {
    const v = id => ($(id)?.value || '').trim();
    return [v('cls') && v('cls') + ' 班', v('seat') && v('seat') + ' 號', v('group') && '第 ' + v('group') + ' 組', v('student')].filter(Boolean).join(' ');
  }
  function renderEvidence(withAnswer) {
    setPlaying(false); refresh(); persist();
    const image = document.createElement('canvas'), c = image.getContext('2d'), width = 1200, inset = 40;
    const pondHeight = Math.round(1120 * canvas.getBoundingClientRect().height / canvas.getBoundingClientRect().width);
    c.font = '21px "Microsoft JhengHei",sans-serif';
    const question = wrap(c, tasks[task].q, 1120), answer = wrap(c, $('answer').value || '（尚未填寫回答）', 1120);
    const extra = withAnswer ? 190 + (question.length + answer.length) * 34 : 0;
    image.width = width; image.height = 204 + pondHeight + extra + (preview ? 32 : 0);
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, image.width, image.height);
    text(c, '都卜勒・水波實驗', inset, 39, '#153f4d', 'left', 30);
    text(c, (preview ? '從我的排列經過 ' + fmt(preview.elapsed) : 't = ' + fmt(manual ? 5 : time)) + ' s  |  ' + configText() + '  |  c=' + fmt(params.c) + ' m/s  |  f=' + fmt(params.f) + ' 次/s', inset, 81, '#5d7b86', 'left', 17);
    text(c, manual ? preview ? '學生排列的波前向外擴散，圓心固定；次數從開始播放時算起。' : '學生手動組合：每個圓心由學生設定，圓片半徑固定。' : '波源早已在打水，水面布滿波；每圈從當時發波的位置擴大，次數從 0 s 算起。', inset, 113, '#5d7b86', 'left', 17);
    // Preserve the full work surface when exporting to a different pixel size.
    const fullCamera = projection(canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
    const exportCamera = { ...fullCamera, scale: fullCamera.scale * 1120 / canvas.getBoundingClientRect().width,
      cx: 560, cy: pondHeight / 2, width: 1120, height: pondHeight };
    c.save(); c.translate(inset, 140); const exportedView = drawScene(c, 1120, pondHeight, exportCamera); c.restore();
    const y = 140 + pondHeight;
    const notes = [];
    if ($('observers').checked) observers.forEach((o, i) => {
      const r = manual ? previewReading(i) : live(o);
      const q = posAt(o); notes.push(LETTERS[i] + '=(' + fmt(q.x) + ',' + fmt(q.y) + ')m' + (preview || !manual && $('arrival-panel').open ? ' · ' + r.count + '次 · Δt=' + (r.interval === null ? '—' : fmt(r.interval, 3) + 's') : ''));
    });
    const measurement = ($('grid').checked ? '1大格=1λ=' + fmt(exportedView.cell) + 'm；4小格/大格 · ' : '') + (ruler ? '量測 ' + fmt(P.distance(ruler.a, ruler.b)) + 'm' : '未放置量測線');
    text(c, (notes.length ? notes.join('    ') + '    ' : '') + (preview ? '' : measurement), inset, y + 31, '#5d7b86', 'left', 16);
    if (preview) text(c, measurement, inset, y + 63, '#5d7b86', 'left', 16);
    if (withAnswer) {
      let cursor = y + 85 + (preview ? 32 : 0);
      text(c, '第 ' + (task + 1) + ' 題　' + tasks[task].title + '  |  ' + (studentLabel() || '未填班級／座號'), inset, cursor, '#087c91', 'left', 21); cursor += 40;
      question.forEach(line => { text(c, line, inset, cursor, '#153f4d', 'left', 21); cursor += 34; });
      cursor += 16; text(c, '我的回答', inset, cursor, '#087c91', 'left', 21); cursor += 36;
      answer.forEach(line => { text(c, line, inset, cursor, '#153f4d', 'left', 21); cursor += 34; });
    }
    const filename = 'doppler-' + (manual ? preview ? 'my-waves' : 'manual' : 'auto') + '-q' + (task + 1) + '-v' + fmt(params.mach) + '-t' + fmt(preview ? preview.elapsed : manual ? 5 : time) + (withAnswer ? '-answer' : '-pond') + '.png';
    return { image, filename };
  }
  function evidence(withAnswer) {
    const { image, filename } = renderEvidence(withAnswer), width = image.width;
    const url = image.toDataURL('image/png'); download(url, filename);
    const figure = document.createElement('figure'); figure.className = 'record';
    const img = document.createElement('img'); img.src = url; img.alt = '第 ' + (task + 1) + ' 題，' + configText() + '，' + fmt(manual ? 5 : time) + ' 秒的實驗紀錄'; img.width = width; img.height = image.height;
    const caption = document.createElement('figcaption'), label = document.createElement('span'), link = document.createElement('a');
    label.textContent = '第 ' + (task + 1) + ' 題 · ' + configText() + ' · ' + fmt(manual ? 5 : time) + ' s';
    link.href = url; link.download = filename; link.textContent = '再下載';
    caption.append(label, link); figure.append(img, caption); $('records').prepend(figure); records.push(figure);
    if (records.length > 6) records.shift().remove();
    $('records-empty').hidden = true; $('clear-records').hidden = false;
    status('已下載');
  }
  $('capture').addEventListener('click', () => evidence(true)); $('capture-only').addEventListener('click', () => evidence(false));
  $('clear-records').addEventListener('click', () => { records.length = 0; $('records').replaceChildren(); $('records-empty').hidden = false; $('clear-records').hidden = true; status('已清除紀錄'); });
  function tick(now) {
    if (playing && manual && preview) {
      if (lastFrame !== null) preview.elapsed = Math.min(preview.end, preview.elapsed + Math.min(.1, (now - lastFrame) / 1000) * Number($('play-rate').value));
      detectHits(now); draw();
      if (now - lastReadout > 80 || preview.elapsed >= preview.end) { readouts(); lastReadout = now; }
      if (preview.elapsed >= preview.end) { setPlaying(false); status('播放完畢'); }
    } else if (playing) {
      if (lastFrame !== null) time = Math.min(10, time + Math.min(.1, (now - lastFrame) / 1000) * Number($('play-rate').value));
      autoQuack(lastFrame === null); draw();
      if (now - lastReadout > 100 || time >= 10) { readouts(); lastReadout = now; }
      if (time >= 10) { setPlaying(false); status('已到 10 秒'); }
    } else if (flashDirty) {
      draw(); readouts(); flashDirty = Boolean(preview && preview.flashAt.some(t => now - t < FLASH_MS));
    }
    lastFrame = now; requestAnimationFrame(tick);
  }
  // ---------- 更多小鴨 ----------
  function syncDucks() {
    $('observer-select').replaceChildren(...observers.map((_, i) => new Option(LETTERS[i] + ' 小鴨', String(i))));
    $('qb-remove-duck').disabled = observers.length <= 2;
    $('qb-add-duck').disabled = observers.length >= LETTERS.length;
    $('qb-add-duck').textContent = '＋ 小鴨（' + observers.length + '）';
  }
  function addDuck() {
    if (observers.length >= LETTERS.length) return;
    const cell = params.c / params.f, spot = EXTRA_SPOTS[(observers.length - 2) % EXTRA_SPOTS.length];
    clearPreview(); observers.push({ x: spot[0] * cell, y: spot[1] * cell }); applySwim();
    if (!$('observers').checked) $('observers').checked = true;
    syncDucks(); refresh(); status('已加入 ' + LETTERS[observers.length - 1] + ' 小鴨，可拖到想觀察的位置');
  }
  function removeDuck() { if (observers.length <= 2) return; clearPreview(); observers.pop(); syncDucks(); refresh(); status('已移除一隻小鴨'); }
  $('qb-add-duck').addEventListener('click', addDuck);
  $('qb-remove-duck').addEventListener('click', removeDuck);
  // ---------- 快速工具列（與下方設定同步） ----------
  const toggles = [['qb-ducks', 'observers'], ['qb-labels', 'labels']];
  toggles.forEach(([btn, box]) => $(btn).addEventListener('click', () => { $(box).checked = !$(box).checked; $(box).dispatchEvent(new Event('change')); syncQuick(); }));
  $('qb-measure').addEventListener('click', () => { if (view3d?.visible) set3D(false); $('measure').click(); syncQuick(); });
  function syncQuick() {
    toggles.forEach(([btn, box]) => $(btn).setAttribute('aria-pressed', String($(box).checked)));
    $('qb-measure').setAttribute('aria-pressed', String(measureMode));
    $('qb-3d').setAttribute('aria-pressed', String(Boolean(view3d?.visible)));
    $('qb-auto').setAttribute('aria-pressed', String(!manual));
    $('qb-auto').textContent = manual ? '▶ 示範' : '✕ 結束示範';
    $('qb-swim').setAttribute('aria-pressed', String(!manual && swim > 0));
  }
  // 示範：切到自動模擬，從 0 秒開始播放，看波源往前走、一圈一圈發出水波
  $('qb-auto').addEventListener('click', () => {
    if (manual) { quack.unlock(); setManual(false); time = 0; autoHits = null; setPlaying(true); status('示範：波源每秒打水一次，邊走邊發波'); }
    else { swim = 0; applySwim(); setManual(true); status('回到自己的排列'); }
    syncQuick(); refresh();
  });
  $('automatic').addEventListener('change', syncQuick);
  // 觀察者移動：波源靜止，所有小鴨以 0.5 倍波速向左游（A 迎著波、B 順著波）
  function setSwim(on, restart = true) {
    swim = on ? .5 : 0; applySwim();
    if (on) {
      quack.unlock(); if (manual) setManual(false);
      if (!$('observers').checked) { $('observers').checked = true; $('observers').dispatchEvent(new Event('change')); }
      if (restart) { time = 0; autoHits = null; setPlaying(true); }
      status('小鴨以 0.5 倍波速向左游：A 迎著波、B 順著波');
    } else status('小鴨停止游動');
    syncQuick(); refresh();
  }
  $('qb-swim').addEventListener('click', () => setSwim(!(swim > 0 && !manual)));
  document.querySelectorAll('.quick-bar [data-mach]').forEach(b => b.addEventListener('click', () => { if (!manual) { time = 0; setPlaying(true); refresh(); } }));
  ['observers', 'labels'].forEach(id => $(id).addEventListener('change', syncQuick));
  $('measure').addEventListener('click', syncQuick);
  // ---------- 3D 水面 ----------
  function scene3d() {
    const waves = manual ? preview ? P.snapshotWaves(params.c, preview.waves, preview.elapsed) : pieces.filter(p => p.placed) : shown(P.waves(phys(), time));
    const src = manual ? (pieces.at(-1).placed ? pieces.at(-1) : null) : P.source(phys(), time);
    const extent = manual ? Math.max(6.25, ...pieces.map(p => p.radius + 1.25)) :
      Math.ceil(Math.max(5.5, params.c * Math.max(5, time) + .65, ...observers.flatMap(obsExtent)));
    return { extent, cell: params.c / params.f, mach: params.mach, rings: waves.map(w => ({ x: w.x, y: w.y, r: w.radius })),
      source: src && { x: src.x, y: src.y }, showObservers: $('observers').checked,
      observers: observers.map((o, i) => ({ ...posAt(o), label: LETTERS[i], glow: $('observers').checked ? glowOf(i) : 0 })) };
  }
  async function set3D(on) {
    if (on && !view3d) {
      $('qb-3d').disabled = true; status('3D 載入中…');
      try { view3d = (await import('./view3d.js?v=3d-5')).create($('pond-area'), { scene: scene3d }); }
      catch (err) { $('qb-3d').disabled = false; status('這台裝置無法顯示 3D'); return; }
      $('qb-3d').disabled = false;
    }
    if (!view3d) return;
    if (on) { setMeasure(false); view3d.show(); $('view3d-tools').hidden = false; status('3D：拖曳旋轉、雙指縮放；排列請回 2D'); }
    else { view3d.hide(); $('view3d-tools').hidden = true; status(manual ? '拖曳圓圈排列' : '拖曳 A、B 小鴨'); refresh(); }
    $('qb-3d').textContent = on ? '2D' : '3D';
    syncQuick(); fsSync();
  }
  $('qb-3d').addEventListener('click', () => set3D(!view3d?.visible));
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => view3d?.setView(b.dataset.view)));
  // ---------- 全螢幕 ----------
  const stage = document.querySelector('.experiment');
  let usedFullscreenApi = false;
  function setFull(on) {
    fsMount(on);
    stage.classList.toggle('is-full', on); document.documentElement.classList.toggle('lock-scroll', on);
    $('qb-full').textContent = on ? '✕ 離開全螢幕' : '⛶ 全螢幕';
    if (on) {
      const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
      if (req) { usedFullscreenApi = true; Promise.resolve(req.call(stage)).catch(() => { usedFullscreenApi = false; }); }
    } else if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
    requestAnimationFrame(refresh);
  }
  $('qb-full').addEventListener('click', () => setFull(!stage.classList.contains('is-full')));
  // ---------- 全螢幕：畫面鋪滿，操作收進可摺疊的浮動面板 ----------
  let fsLayer = null, answering = false; const fsMoved = [];
  const FS_FOLD = 'doppler-fs-fold';
  function fsBuild() {
    fsLayer = document.createElement('div'); fsLayer.className = 'fs-layer';
    fsLayer.innerHTML = `
      <div class="fs-col fs-colL"><section class="fs-panel" data-fs="guide"><header><strong>怎麼操作</strong><span class="fs-sub" id="fs-mode"></span><button type="button" class="fs-fold" aria-label="收合">▾</button></header>
        <div class="fs-body">
          <label class="fs-task">題目<select id="fs-task"></select></label>
          <p class="fs-q" id="fs-q"></p>
          <button type="button" id="fs-load" class="fs-wide">套用這題的起始設定</button>
          <ol class="fs-steps" id="fs-steps"></ol>
          <p class="fs-status" id="fs-status" aria-live="polite"></p>
          <button type="button" id="fs-answer" class="fs-wide fs-primary">✎ 作答</button>
        </div></section>
      <section class="fs-panel" data-fs="answer" hidden><header><strong>作答</strong><span class="fs-sub" id="fs-anum"></span><button type="button" class="fs-back">← 回操作</button></header>
        <div class="fs-body"><p class="fs-q" id="fs-aq"></p><div data-slot="answer"></div></div></section>
      <section class="fs-panel" data-fs="tray"><header><strong>圓片</strong><span class="fs-sub">拖進水面</span><button type="button" class="fs-fold" aria-label="收合">▾</button></header><div class="fs-body" data-slot="tray"></div></section></div>
      <div class="fs-col fs-colR"><section class="fs-panel" data-fs="ctrl"><header><strong>控制</strong><button type="button" class="fs-exit">✕ 結束全螢幕</button><button type="button" class="fs-fold" aria-label="收合">▾</button></header>
        <div class="fs-body">
          <p class="fs-cap">波源速度</p><div data-slot="speed"></div>
          <p class="fs-cap">怎麼看</p><div class="fs-grid" data-slot="mode"></div>
          <p class="fs-cap">小鴨與工具</p><div class="fs-grid" data-slot="tools"></div>
        </div></section>
      <section class="fs-panel" data-fs="read"><header><strong>即時讀值</strong><span class="fs-sub" id="fs-time"></span><button type="button" class="fs-fold" aria-label="收合">▾</button></header><div class="fs-body" data-slot="read"></div></section></div>
      <section class="fs-panel" data-fs="time"><div class="fs-body" data-slot="time"></div></section>`;
    stage.append(fsLayer);
    let folds = {}; try { folds = JSON.parse(localStorage.getItem(FS_FOLD) || '{}'); } catch (_) { }
    fsLayer.querySelectorAll('.fs-panel').forEach(p => { if (folds[p.dataset.fs]) p.classList.add('folded'); });
    fsLayer.querySelectorAll('.fs-fold').forEach(b => {
      const p = b.closest('.fs-panel'); b.textContent = p.classList.contains('folded') ? '▸' : '▾';
      b.addEventListener('click', () => {
        p.classList.toggle('folded'); b.textContent = p.classList.contains('folded') ? '▸' : '▾';
        try { const f = JSON.parse(localStorage.getItem(FS_FOLD) || '{}'); f[p.dataset.fs] = p.classList.contains('folded'); localStorage.setItem(FS_FOLD, JSON.stringify(f)); } catch (_) { }
        draw();
      });
    });
    fsLayer.querySelector('.fs-exit').addEventListener('click', () => setFull(false));
    $('fs-load').addEventListener('click', () => $('load-task').click());
    // 作答也在全螢幕裡：左欄換成作答卡，水面與右側讀值照常可用
    $('fs-answer').addEventListener('click', () => setAnswering(true));
    fsLayer.querySelector('.fs-back').addEventListener('click', () => setAnswering(false));
    $('fs-task').addEventListener('change', () => { $('task').value = $('fs-task').value; $('task').dispatchEvent(new Event('change')); fsSync(); });
  }
  function fsMove(el, slot) {
    if (!el) return;
    const mark = document.createComment('fs'); el.before(mark); fsMoved.push([el, mark]);
    fsLayer.querySelector('[data-slot="' + slot + '"]').append(el);
  }
  function fsMount(on) {
    if (on && !fsLayer) fsBuild();
    if (on && !fsMoved.length) {
      fsMove(document.querySelector('.quick-bar .qb-group'), 'speed');
      ['qb-auto', 'qb-swim', 'qb-3d', 'view3d-tools'].forEach(id => fsMove($(id), 'mode'));
      ['qb-ducks', 'qb-add-duck', 'qb-remove-duck', 'qb-labels', 'qb-measure', 'manual-scene-tools'].forEach(id => fsMove($(id), 'tools'));
      fsMove($('piece-tray'), 'tray'); fsMove($('manual-toolbar'), 'tray');
      fsMove(document.querySelector('.scene-head'), 'read'); fsMove($('manual-playback'), 'read'); fsMove(document.querySelector('.scene-foot'), 'read');
      fsMove($('timeline'), 'time');
      fsMove($('task-figure'), 'answer'); fsMove(document.querySelector('.answer-sheet'), 'answer');
    } else if (!on) {
      answering = false; fsLayer?.classList.remove('answering');
      while (fsMoved.length) { const [el, mark] = fsMoved.pop(); mark.replaceWith(el); }
    }
    fsSync();
  }
  function setAnswering(on) {
    answering = on; fsLayer.classList.toggle('answering', on); fsSync();
    if (on) fsLayer.querySelector('[data-fs="answer"] .fs-body').scrollTop = 0;
    requestAnimationFrame(draw);
  }
  const FS_STEPS = {
    manual: ['從「圓片」把圓圈一片一片拖進水面', '把每一圈的圓心放到它發波時波源的位置（水平線上的 1～5 刻度）', '打開「🦆 小鴨」，按「▶ 播放」，聽誰被打得比較頻繁'],
    demo: ['水面早已布滿波：波源一邊往前走、一邊每秒發出一圈', '比較前方和後方相鄰兩圈的距離；聽每隻小鴨誰叫得比較密', '換「波源速度」再看一次；按「✕ 結束示範」回到自己排'],
    swim: ['波源不動，小鴨以 0.5 倍波速向左游', 'A 迎著波游、B 順著波游：聽誰叫得比較密', '看「即時讀值」：每秒被打幾次？波長有沒有變？']
  };
  function fsSync() {
    if (!fsLayer || !stage.classList.contains('is-full')) return;
    const mode = manual ? 'manual' : swim > 0 ? 'swim' : 'demo', t = tasks[task];
    $('fs-mode').textContent = { manual: '自己排', demo: '示範中', swim: '觀察者動' }[mode];
    if ($('fs-task').options.length !== $('task').options.length) $('fs-task').replaceChildren(...[...$('task').options].map(o => new Option(o.textContent, o.value)));
    $('fs-task').value = $('task').value;
    $('fs-q').textContent = t ? t.q : '';
    $('fs-load').hidden = !(t && t.setup);
    const steps = FS_STEPS[mode].concat(view3d?.visible ? ['3D：拖曳旋轉，兩指縮放；排圓片請回 2D'] : []);
    const ol = $('fs-steps'); if (ol.dataset.mode !== mode + view3d?.visible) { ol.dataset.mode = mode + view3d?.visible; ol.replaceChildren(...steps.map(s => { const li = document.createElement('li'); li.textContent = s; return li; })); }
    if (!$('fs-status').textContent) $('fs-status').textContent = $('status').textContent;
    fsLayer.querySelector('[data-fs="tray"]').hidden = answering || $('piece-tray').hidden;
    fsLayer.querySelector('[data-fs="guide"]').hidden = answering;
    fsLayer.querySelector('[data-fs="answer"]').hidden = !answering;
    $('fs-anum').textContent = '第 ' + (task + 1) + ' 題';
    $('fs-aq').textContent = t ? t.q : '';
    fsLayer.querySelector('[data-fs="time"]').hidden = $('timeline').hidden;
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
    if (!(document.fullscreenElement || document.webkitFullscreenElement) && usedFullscreenApi && stage.classList.contains('is-full')) { usedFullscreenApi = false; setFull(false); }
  }));
  // 作答送出（submit.js）讀取目前狀態用的介面
  function arrangement(mach = params.mach) {
    const rings = pieces.filter(p => p.radius > 0), marker = pieces.at(-1), placed = rings.filter(p => p.placed);
    if (placed.length < rings.length) return { label: '未完成', placed: placed.length, total: rings.length, err: null };
    const seq = [...rings, marker].sort((a, b) => a.n - b.n), step = mach * params.c / params.f, tol = params.c / params.f / 8 + 1e-9;
    let err = 0, still = true, reversed = true;
    for (let i = 0; i + 1 < seq.length; i++) {
      const dx = seq[i + 1].x - seq[i].x, dy = seq[i + 1].y - seq[i].y;
      err = Math.max(err, Math.abs(dx - step), Math.abs(dy));
      if (Math.abs(dx) > tol || Math.abs(dy) > tol) still = false;
      if (Math.abs(dx + step) > tol || Math.abs(dy) > tol) reversed = false;
    }
    const label = err <= tol ? '正確' : step !== 0 && still ? '圓心沒有移動' : step !== 0 && reversed ? '方向相反' : '圓心間距不一致';
    return { label, placed: placed.length, total: rings.length, err: Math.round(err * 1000) / 1000 };
  }
  window.DopplerLab = {
    tasks, get taskIndex() { return task; }, studentLabel,
    params: () => ({ ...params }), manual: () => manual,
    ruler: () => ruler ? Math.round(P.distance(ruler.a, ruler.b) * 1000) / 1000 : null,
    ducks: () => [0, 1].map(i => { const r = reading(i); return { count: r.count, interval: r.interval === null ? null : Math.round(r.interval * 1000) / 1000, perSecond: r.interval ? Math.round(1000 / r.interval) / 1000 : null }; }),
    arrangement,
    answer: () => $('answer').value,
    snapshot: (withAnswer = true) => renderEvidence(withAnswer).image,
    scene: scene3d,
    status
  };
  new ResizeObserver(draw).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { setPlaying(false); readouts(); } });
  rebuildPieces(savedCenters || []);
  $('wave-speed').value = params.c; $('frequency').value = params.f; $('mach').value = Math.abs(params.mach); $('reverse').checked = params.mach < 0;
  document.querySelectorAll('[data-mach]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.mach) === params.mach)));
  $('task').replaceChildren(...tasks.map((t, i) => new Option((i + 1) + '　' + t.title, String(i))));
  syncDucks(); syncQuick();
  loadQuestion(); setManual(true); persist(); refresh(); requestAnimationFrame(tick);
})();
