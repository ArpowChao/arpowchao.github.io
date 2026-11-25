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
  let task = 0, answers = {}, savedStudent = '', storageOK = true;
  // 自己擺圓片的關卡：每關各自保留排好的樣子（boards），第一次進來時水面淨空
  const BOARD_KEY = 'doppler-boards-v1';
  let boards = {}, boardFor = null;
  try { boards = JSON.parse(localStorage.getItem(BOARD_KEY) || '{}') || {}; } catch (_) { boards = {}; }
  const arranging = () => !!(tasks[task] && tasks[task].setup && (tasks[task].setup.arrange || tasks[task].setup.watch));
  let viewOnly = false;
  let mode = 'place', gest0 = null; const cam = { z: 1, x: 0, y: 0 }, gest = new Map(), lastPt = new Map();
  const records = [];
  const fmt = (v, places = 2) => Number(v).toFixed(places);
  const status = message => { $('status').textContent = message; const f = document.getElementById('fs-status'); if (f) f.textContent = message; };
  try {
    const saved = JSON.parse(localStorage.getItem('doppler-worksheet-v2') || 'null');
    if (saved && saved.answersById && typeof saved.answersById === 'object') tasks.forEach(t => { const a = saved.answersById[t.id]; if (typeof a === 'string') answers[t.id] = a.slice(0, 2400); });
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
    try { localStorage.setItem('doppler-worksheet-v2', JSON.stringify({ answersById: answers, student: $('student').value, snapToGrid: $('snap-grid').checked, manualSettings: { ...params },
      manualCenters: pieces.map(p => ({ n: p.n, x: p.x, y: p.y, placed: p.placed })) })); }
    catch (_) { storageOK = false; }
    saveBoard();
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
    // 只算播放開始（t > 0）之後真的打到小鴨的波：沒播放、還沒收到兩圈時不給間隔與每秒次數
    const r = P.received(phys(), o, time), events = r.events.filter(a => a.time > 1e-9);
    const last = events.at(-1), prev = events.at(-2), interval = prev ? last.time - prev.time : null;
    return { ...r, events, count: events.length, interval, frequency: interval > 1e-9 ? 1 / interval : null, last: last ? last.time : null };
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
        if (mode !== 'place') setMode('place', true);
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
  function projection(width, height, insets = null, zoomed = false) {
    const ins = insets || { l: 0, r: 0, t: 0, b: 0 }, w = width - ins.l - ins.r, h = height - ins.t - ins.b;
    const extent = manual ? Math.max(arranging() ? 5.75 : 6.25, ...pieces.map(p => p.radius + (arranging() ? .75 : 1.25))) :
      // 水面一開始就布滿波，視野固定：涵蓋小鴨與波源 0～10 秒走過的路段
      Math.max(6.5, Math.abs(params.mach) * params.c * 5 + 1.5, ...observers.flatMap(obsExtent));
    // Use the whole square board for the five waves, without extra side ranges
    // or a pixel-per-metre cap. The physical view stays fixed while arranging.
    let scale = Math.max(1, (Math.min(w, h) - (manual ? 0 : 54)) / (2 * extent));
    // 擺圖、觀察小鴨的關卡：格子放大。水面左右看到 ±4.75 格、上下 ±4.25 格（最外圈的邊可能略超出畫面，觀察模式可縮小看全部）
    const board = manual && arranging();
    if (board) scale = Math.max(1, Math.min(w / (2 * 4.75), h / (2 * 4.25)));
    // 觀察模式可以縮放、移動畫面（cam）；擺放的範圍（halfWidth）仍以原大小計算
    const ox = ins.l + w / 2, oy = ins.t + h / 2, z = zoomed ? cam.z : 1, zs = scale * z;
    return { scale: zs, cx: ox - (zoomed ? cam.x : 0) * zs, cy: oy + (zoomed ? cam.y : 0) * zs, width, height, ox, oy, base: scale, l: ins.l, t: ins.t,
      halfWidth: board ? 10 : width / 2 / scale, halfHeight: board ? 10 : height / 2 / scale };
  }
  function xy(point, camera) { return { x: camera.cx + point.x * camera.scale, y: camera.cy - point.y * camera.scale }; }
  function world(x, y) { return { x: (x - view.cx) / view.scale, y: (view.cy - y) / view.scale }; }
  function text(c, label, x, y, color = '#153f4d', align = 'left', size = 12) {
    c.fillStyle = color; c.font = size + 'px "Microsoft JhengHei",sans-serif'; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(window.T ? window.T(label) : label, x, y);
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
    const selP = viewOnly ? -1 : selectedPiece;   // 只看不操作的關卡：不標示選取的圓片
    const camera = savedCamera || projection(width, height, c === ctx ? safeInsets() : null, c === ctx);
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
      const big = c === ctx && arranging();
      if (smallCell * camera.scale >= 1) gridLines(smallCell, '#e3e7e9', big ? 1 : .75);
      gridLines(cell, '#bcc4c8', big ? 1.6 : 1.2);
      c.strokeStyle = '#97a2a7'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, camera.cy); c.lineTo(width, camera.cy); c.moveTo(camera.cx, 0); c.lineTo(camera.cx, height); c.stroke();
      const labelStep = cell * Math.max(1, Math.ceil(30 / (cell * camera.scale)));
      for (let n = Math.ceil(-camera.cx / camera.scale / labelStep); n <= (width - camera.cx) / camera.scale / labelStep; n++) { const x = n * labelStep, px = xy({ x, y: 0 }, camera).x; if (px > 20 && px < width - 20) text(c, fmt(x, 1).replace('.0', ''), px, height - 13, '#688790', 'center', 13); }
    }
    if ($('grid').checked) scaleBar(c, camera, cell);
    const waves = manual ? preview ? P.snapshotWaves(params.c, preview.waves, preview.elapsed) : pieces.filter(p => p.placed) : shown(P.waves(phys(), time));
    c.save(); c.setLineDash([3, 6]); c.lineWidth = 1; c.strokeStyle = '#b6cdd2'; c.beginPath();
    const source = xy(manual ? pieces.at(-1) : P.source(phys(), time), camera);
    if (!manual) { const from = xy(P.source(phys(), phys().t0), camera); c.moveTo(from.x, from.y); c.lineTo(source.x, source.y); c.stroke(); } c.restore();
    waves.forEach(w => {
      const p = xy(w, camera), radius = w.radius * camera.scale;
      if (radius > .1) {
        // 波前：藍色（深淺交錯），比灰色格線粗；選到的圓片用橘色
        c.strokeStyle = manual && w.n === selP ? '#d9480f' : w.n % 2 ? '#3b6fe0' : '#1c3fa8';
        c.lineWidth = manual && w.n === selP ? 3.4 : 2.6;
        c.beginPath(); c.arc(p.x, p.y, radius, 0, Math.PI * 2); c.stroke();
      }
      if ($('centers').checked) { c.fillStyle = '#507985'; c.beginPath(); c.arc(p.x, p.y, 2.5, 0, Math.PI * 2); c.fill(); }
      if (manual && w.radius > 0 && ($('centers').checked || w.n === selP)) {
        const color = w.n === selP ? '#d9480f' : '#1c3fa8';
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
      if (manual && selP === pieces.length - 1) { c.strokeStyle = '#a47700'; c.lineWidth = 2; c.beginPath(); c.arc(source.x, source.y, 22, 0, Math.PI * 2); c.stroke(); }
      if ($('labels').checked && (manual || Math.abs(waves.at(-1).emitted - time) < 1e-8)) text(c, (manual ? '當下 t=' : '剛發出 t=') + fmt(manual ? 5 : time, 1) + 's', source.x, source.y + 45, '#977008', 'center', 13);
    }
    // 擺圖的關卡：標出鴨子起始位置（t = 0）
    if (manual && (arranging() || (viewOnly && viewOnly !== 'blank'))) {
      const o = xy({ x: 0, y: 0 }, camera);
      c.save(); c.fillStyle = '#e03131'; c.strokeStyle = '#ffffff'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(o.x, o.y, 7, 0, Math.PI * 2); c.fill(); c.stroke();
      const lab = (window.T || String)('鴨子起始位置');
      c.font = '700 14px "Microsoft JhengHei", sans-serif'; const lw = c.measureText(lab).width;
      c.fillStyle = '#ffffffe6'; c.fillRect(o.x - lw / 2 - 5, o.y - 44, lw + 10, 22);
      c.fillStyle = '#c92a2a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lab, o.x, o.y - 33);
      c.restore();
    }
    if ($('observers').checked) observers.forEach((o, i) => {
      const sx = manual ? pieces.at(-1).x : P.source(phys(), time).x;
      const at = xy(posAt(o), camera), moving = !manual && o.vx;
      duck(c, at, DUCK_FILL[i], moving ? Math.sign(o.vx) : o.x >= sx ? -1 : 1, LETTERS[i] + ' 小鴨', glowOf(i), quack.name(i));
      if (moving) arrow(c, { x: at.x, y: at.y - 26 }, { x: at.x + Math.sign(o.vx) * 34, y: at.y - 26 }, '#3d6b78');
    });
    if (manual && pieces[selP]?.placed && !arranging()) {
      const selected = pieces[selP], p = xy(selected, camera);
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
  // 比例尺：標出「1 格」是哪裡到哪裡（剛好跨一大格，對齊格線），並分成 4 小格
  function scaleBar(c, camera, cell) {
    const x0 = Math.ceil(((camera.l || 0) + 30 - camera.cx) / camera.scale / cell) * cell;
    const y0 = Math.floor((camera.cy - ((camera.t || 0) + 96)) / camera.scale / cell) * cell;
    const a = xy({ x: x0, y: y0 }, camera), b = xy({ x: x0 + cell, y: y0 }, camera), len = b.x - a.x;
    if (len < 24) return;
    const T = window.T || String, label = T('1 格'), sub = T('＝ 4 小格');
    c.save();
    c.font = '13px "Microsoft JhengHei", sans-serif'; const subW = c.measureText(sub).width;
    c.font = '700 17px "Microsoft JhengHei", sans-serif'; const labW = c.measureText(label).width;
    const bw = Math.max(len, labW + 10 + subW) + 20;
    c.fillStyle = '#ffffffe6'; c.strokeStyle = '#e3b04b'; c.lineWidth = 1;
    c.beginPath(); if (c.roundRect) c.roundRect(a.x - 10, a.y - 44, bw, 62, 8); else c.rect(a.x - 10, a.y - 44, bw, 62); c.fill(); c.stroke();
    c.strokeStyle = '#c96a00'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.moveTo(a.x, a.y - 10); c.lineTo(a.x, a.y + 10); c.moveTo(b.x, b.y - 10); c.lineTo(b.x, b.y + 10); c.stroke();
    c.lineWidth = 2; c.beginPath(); for (let k = 1; k < 4; k++) { const x = a.x + len * k / 4; c.moveTo(x, a.y - 5); c.lineTo(x, a.y + 5); } c.stroke();
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#a45200'; c.fillText(label, a.x, a.y - 20);
    c.font = '13px "Microsoft JhengHei", sans-serif'; c.fillStyle = '#7a5a2a'; c.fillText(sub, a.x + labW + 10, a.y - 20);
    c.restore();
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
    // 自己擺的關卡：手指好抓（圓心 26 px、圓周 20 px），圓心和波源小鴨重疊時先抓圓片
    const big = arranging(), near = h => h.d + (h.p.radius === 0 ? 10 : 0);
    const centers = candidates.filter(h => h.d < (h.p.radius === 0 ? 24 : big ? 26 : 13));
    if (centers.length) return (centers.find(h => h.p.n === selectedPiece && h.p.radius > 0) || centers.sort((a, b) => near(a) - near(b))[0]).p;
    const edges = candidates.filter(h => h.p.radius > 0 && h.edge < (big ? 20 : 12));
    return (edges.find(h => h.p.n === selectedPiece) || edges.sort((a, b) => a.edge - b.edge)[0])?.p;
  }
  function capture(id) { try { canvas.setPointerCapture(id); } catch (_) { } }
  function eventPoint(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    lastPt.set(e.pointerId, eventPoint(e));
    if (mode === 'observe' && !measureMode) { e.preventDefault(); gest.set(e.pointerId, eventPoint(e)); capture(e.pointerId); gestStart(); return; }
    // 擺放時放下第二根手指：取消正在拖的圓片，改成兩指縮放
    if (pointer && pointer.id !== e.pointerId && pointer.mode !== 'measure') {
      e.preventDefault(); if (pointer.mode === 'piece' && pointer.before) pieces = pointer.before;
      const first = pointer.id; pointer = null;
      gest.set(first, lastPt.get(first) || eventPoint(e)); gest.set(e.pointerId, eventPoint(e)); capture(e.pointerId); gestStart(); refresh(); return;
    }
    if (pointer) return;
    const p = eventPoint(e); setPlaying(false); canvas.focus({ preventScroll: true });
    if (manual && preview && !measureMode) { clearPreview(); draw(); }
    if (measureMode) { pointer = { id: e.pointerId, mode: 'measure' }; const w = world(p.x, p.y); ruler = { a: w, b: { ...w } }; }
    else {
      const observerIndex = $('observers').checked ? observers.findIndex(o => { const s = xy(posAt(o), view); return Math.hypot(s.x - p.x, s.y - p.y) < 24; }) : -1;
      const piece = manual ? hitPiece(p) : null;
      // 選了托盤裡還沒放的圓片：點水面就放在那裡（點在別的圓心或波源上也一樣，靜止打水的圓心本來就疊在一起）
      if (manual && !pieces[selectedPiece].placed && observerIndex < 0) {
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
    lastPt.set(e.pointerId, eventPoint(e));
    if (gest.has(e.pointerId)) { gest.set(e.pointerId, eventPoint(e)); gestMove(); return; }
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
    if (gest.has(e.pointerId)) { gest.delete(e.pointerId); gestStart(); return; }
    if (!pointer || pointer.id !== e.pointerId) return;
    const action = pointer; pointer = null; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (action.mode === 'piece') {
      if (e.type === 'pointercancel' || action.fromTray && !action.inside) pieces = action.before;
      else remember(action.before);
    }
    status(manual ? '已放好' : '已暫停'); refresh();
  }
  window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);

  // ---------- 觀察模式（兩指縮放、拖曳移動畫面）／擺放模式（拖圓片、小鴨）分開，避免亂按 ----------
  function gestStart() {
    const pts = [...gest.values()];
    if (pts.length === 1) gest0 = { kind: 'pan', p: pts[0], cam: { ...cam }, s: view.scale };
    else if (pts.length >= 2) {
      const [a, b] = pts, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gest0 = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, w: world(mid.x, mid.y), cam: { ...cam } };
    } else gest0 = null;
  }
  function clampCam() {
    cam.z = Math.min(4, Math.max(.6, cam.z));   // 可以縮小到 0.6 倍看整張圖
    const lim = 7; cam.x = Math.max(-lim, Math.min(lim, cam.x)); cam.y = Math.max(-lim, Math.min(lim, cam.y));
    if (cam.z === 1) { cam.x = 0; cam.y = 0; }
  }
  function zoomAt(z, mid, w) {
    cam.z = Math.min(4, Math.max(.6, z)); const s = view.base * cam.z;
    cam.x = w.x - (mid.x - view.ox) / s; cam.y = w.y + (mid.y - view.oy) / s; clampCam(); syncMode(); draw();
  }
  function gestMove() {
    if (!gest0) return;
    const pts = [...gest.values()];
    if (gest0.kind === 'pan' && pts.length === 1) {
      if (cam.z === 1) return;
      cam.x = gest0.cam.x - (pts[0].x - gest0.p.x) / gest0.s; cam.y = gest0.cam.y + (pts[0].y - gest0.p.y) / gest0.s; clampCam(); draw();
    } else if (gest0.kind === 'pinch' && pts.length >= 2) {
      const [a, b] = pts, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomAt(gest0.cam.z * Math.hypot(a.x - b.x, a.y - b.y) / gest0.d, mid, gest0.w);
    }
  }
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); const p = eventPoint(e); zoomAt(cam.z * Math.exp(-e.deltaY * .0015), p, world(p.x, p.y));
  }, { passive: false });
  const modeBar = document.createElement('div'); modeBar.className = 'mode-switch'; modeBar.setAttribute('role', 'group'); modeBar.setAttribute('aria-label', '操作模式');
  modeBar.innerHTML = '<button type="button" data-mode="observe">👀 觀察・縮放</button><button type="button" data-mode="place">✋ 擺放</button><button type="button" class="mode-reset" aria-label="回到原大小">⟲ 原大小</button>';
  $('pond-area').append(modeBar);
  modeBar.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode, true)));
  modeBar.querySelector('.mode-reset').addEventListener('click', () => { resetZoom(); status('回到原大小'); });
  function syncMode() {
    // 觀察／擺放切換只在「觀察小鴨」的關卡出現（要放小鴨聽呱呱叫）；其他關卡縮放時只顯示「原大小」
    const modes = !!(tasks[task] && tasks[task].setup && tasks[task].setup.watch);
    modeBar.querySelectorAll('[data-mode]').forEach(b => { b.hidden = !modes; b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
    modeBar.querySelector('.mode-reset').hidden = cam.z === 1;
    modeBar.hidden = !!view3d?.visible || (!modes && cam.z === 1);
    document.body.classList.toggle('mode-observe', mode === 'observe');
  }
  function setMode(next, say) {
    mode = next; gest.clear(); gest0 = null; if (mode === 'observe') { pointer = null; setMeasure(false); }
    syncMode();
  }
  function resetZoom() { cam.z = 1; cam.x = 0; cam.y = 0; syncMode(); draw(); }
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
    $('question').textContent = t.q; $('answer').value = answers[t.id] || '';
    enterBoard(t);
    $('load-task').hidden = !(t.setup && t.setup.swim);  // 要自己排的題目不給「套用」，只有觀察者移動（第 5 題）需要
    document.dispatchEvent(new CustomEvent('doppler:task', { detail: { index: task, task: t } }));
    fsSync();   // 老師開放新關卡時（gate.js 直接切換題目）全螢幕面板也要跟著換
  }
  $('task').addEventListener('change', () => { task = Number($('task').value); loadQuestion(); });
  $('answer').addEventListener('input', () => { answers[tasks[task].id] = $('answer').value; persist(); });
  function saveBoard() {
    if (!boardFor) return;
    boards[boardFor] = { mach: params.mach, centers: pieces.map(p => ({ n: p.n, x: p.x, y: p.y, placed: p.placed })) };
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(boards)); } catch (_) { /* 只保留在這次 */ }
  }
  // 進入關卡：要自己擺的關卡把水面整理乾淨（只留波源小鴨、圓片全部在托盤），回到這關時接著排
  function enterBoard(t) {
    saveBoard(); boardFor = null;
    const su = t.setup || {}, arrange = !!su.arrange, watch = !!su.watch, boardId = su.board || (arrange ? t.id : null);
    // 只看不操作的關卡（bare）：右邊的控制、讀值、時間軸都不出現；水面顯示指定的那張圖（su.view）或空白水面
    const bare = !arrange && !watch && !su.swim, viewId = bare || su.swim ? (su.view || 'blank') : null;
    document.body.classList.toggle('arrange', arrange);
    document.body.classList.toggle('arrange-speed', !!(arrange && su.speed));
    document.body.classList.toggle('watch', watch);
    document.body.classList.toggle('bare', bare);
    document.body.classList.toggle('swimstage', !!su.swim);
    cam.z = 1; cam.x = 0; cam.y = 0; setMode(arrange ? 'place' : 'observe');
    viewOnly = viewId || false;
    if (viewId) {
      if (view3d?.visible) set3D(false);
      setPlaying(false); swim = 0; applySwim(); if (!manual) setManual(true);
      params.c = 1; params.f = 1; ruler = null; setMeasure(false);
      $('labels').checked = false; $('observers').checked = false; $('grid').checked = true; $('centers').checked = false;
      const b = viewId === 'blank' ? null : boards[viewId];
      changeMach(b && Number.isFinite(b.mach) ? b.mach : 0);
      rebuildPieces(b && Array.isArray(b.centers) ? b.centers : []);
      syncQuick(); refresh();
      return;
    }
    if (!boardId) return;
    if (view3d?.visible) set3D(false);
    setPlaying(false); swim = 0; applySwim(); if (!manual) setManual(true);
    params.c = 1; params.f = 1; $('wave-speed').value = 1; $('frequency').value = 1;
    ruler = null; setMeasure(false);
    $('labels').checked = false; $('centers').checked = true; $('grid').checked = true; $('snap-grid').checked = true;
    // 排圖時水面只留波源小鴨；觀察小鴨的關卡沿用排好的那張圖，放上 A、B 兩隻小鴨
    $('observers').checked = watch;
    if (watch) { observers.length = 2; observers[0] = { x: 4.5, y: 0 }; observers[1] = { x: -4.5, y: 0 }; syncDucks(); }
    const b = boards[boardId];
    changeMach(b && Number.isFinite(b.mach) ? b.mach : su.mach || 0);
    rebuildPieces(b && Array.isArray(b.centers) ? b.centers : []);
    undo.length = 0; selectedPiece = 0; boardFor = boardId;
    syncQuick(); refresh(); persist();
  }
  $('student').addEventListener('input', persist);
  $('load-task').addEventListener('click', () => {
    const setup = tasks[task].setup; if (!setup) return;
    basic(); observers.length = 2; observers[0] = { x: 5, y: 0 }; observers[1] = { x: -5, y: 0 }; syncDucks();
    setManual(true); time = 5;
    $('labels').checked = false; $('observers').checked = setup.observers; $('centers').checked = true; $('grid').checked = true;
    swim = 0; applySwim(); changeMach(setup.mach);
    if (setup.swim) { observers[0] = { x: 6, y: 0 }; observers[1] = { x: -4, y: 0 }; syncDucks(); setSwim(true, false); time = 0; setPlaying(false); }
    syncQuick(); refresh();
    status('已套用第 ' + tasks[task].n + ' 題設定' + (setup.swim ? '：按「▶ 播放」開始' : ''));
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
      text(c, '第 ' + tasks[task].n + ' 題　' + tasks[task].title + '  |  ' + (studentLabel() || '未填班級／座號'), inset, cursor, '#087c91', 'left', 21); cursor += 40;
      question.forEach(line => { text(c, line, inset, cursor, '#153f4d', 'left', 21); cursor += 34; });
      cursor += 16; text(c, '我的回答', inset, cursor, '#087c91', 'left', 21); cursor += 36;
      answer.forEach(line => { text(c, line, inset, cursor, '#153f4d', 'left', 21); cursor += 34; });
    }
    const filename = 'doppler-' + (manual ? preview ? 'my-waves' : 'manual' : 'auto') + '-q' + tasks[task].n + '-v' + fmt(params.mach) + '-t' + fmt(preview ? preview.elapsed : manual ? 5 : time) + (withAnswer ? '-answer' : '-pond') + '.png';
    return { image, filename };
  }
  function evidence(withAnswer) {
    const { image, filename } = renderEvidence(withAnswer), width = image.width;
    const url = image.toDataURL('image/png'); download(url, filename);
    const figure = document.createElement('figure'); figure.className = 'record';
    const img = document.createElement('img'); img.src = url; img.alt = '第 ' + tasks[task].n + ' 題，' + configText() + '，' + fmt(manual ? 5 : time) + ' 秒的實驗紀錄'; img.width = width; img.height = image.height;
    const caption = document.createElement('figcaption'), label = document.createElement('span'), link = document.createElement('a');
    label.textContent = '第 ' + tasks[task].n + ' 題 · ' + configText() + ' · ' + fmt(manual ? 5 : time) + ' s';
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
    modeBar.hidden = on;
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
  // 版面一律是「水面鋪滿＋浮動面板」；網址加 ?page 才用舊的長網頁版面（除錯用）
  function setFull(on) {
    fsMount(on);
    stage.classList.toggle('is-full', on); document.documentElement.classList.toggle('lock-scroll', on);
    $('qb-full').textContent = on ? '✕ 離開全螢幕' : '⛶ 全螢幕';
    requestAnimationFrame(refresh);
  }
  $('qb-full').addEventListener('click', () => setFull(!stage.classList.contains('is-full')));
  // 另外可以請瀏覽器隱藏網址列（真正的全螢幕）；不支援的裝置不顯示按鈕
  const root = document.documentElement;
  const canBrowserFull = !!(root.requestFullscreen || root.webkitRequestFullscreen);
  const inBrowserFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function toggleBrowserFull() {
    if (inBrowserFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { usedFullscreenApi = true; Promise.resolve((root.requestFullscreen || root.webkitRequestFullscreen).call(root)).catch(() => { usedFullscreenApi = false; }); }
  }
  // ---------- 全螢幕：畫面鋪滿，操作收進可摺疊的浮動面板 ----------
  let fsLayer = null, answering = false; const fsMoved = [];
  const FS_FOLD = 'doppler-fs-fold';
  function fsBuild() {
    fsLayer = document.createElement('div'); fsLayer.className = 'fs-layer';
    fsLayer.innerHTML = `
      <div class="fs-col fs-colL"><section class="fs-panel" data-fs="guide"><header><strong>怎麼操作</strong><button type="button" class="fs-id" data-id-open></button><button type="button" class="fs-langbtn" data-lang-toggle data-no-i18n aria-label="中文 / English">EN</button><span class="fs-sub" id="fs-mode"></span><button type="button" class="fs-fold" aria-label="收合">▾</button></header>
        <div class="fs-body">
          <label class="fs-task">題目<select id="fs-task"></select></label>
          <p class="fs-q" id="fs-q"></p>
          <button type="button" id="fs-load" class="fs-wide">套用這題的起始設定</button>
          <div class="fs-info" id="fs-info" hidden></div>
          <ol class="fs-steps" id="fs-steps"></ol>
          <p class="fs-status" id="fs-status" aria-live="polite"></p>
          <button type="button" id="fs-answer" class="fs-wide fs-primary">✎ 作答</button>
          <a class="fs-home" href="../index.html">← Physics Lab</a>
        </div></section>
      <section class="fs-panel" data-fs="answer" hidden><header><strong>作答</strong><span class="fs-sub" id="fs-anum"></span><button type="button" class="fs-id" data-id-open></button><button type="button" class="fs-back">← 回操作</button></header>
        <div class="fs-body"><p class="fs-q" id="fs-aq"></p><div data-slot="answer"></div></div></section>
      <section class="fs-panel" data-fs="tray"><header><strong>圓片</strong><span class="fs-sub">拖進水面</span><button type="button" class="fs-fold" aria-label="收合">▾</button></header><div class="fs-body" data-slot="tray"></div></section></div>
      <div class="fs-col fs-colR"><section class="fs-panel" data-fs="ctrl"><header><strong>控制</strong><button type="button" class="fs-exit">⛶ 隱藏網址列</button><button type="button" class="fs-fold" aria-label="收合">▾</button></header>
        <div class="fs-body">
          <p class="fs-cap">波源速度</p><div data-slot="speed"></div>
          <p class="fs-cap">怎麼看</p><div class="fs-grid" data-slot="mode"></div>
          <p class="fs-cap">小鴨與工具</p><div class="fs-grid" data-slot="tools"></div>
        </div></section>
      <section class="fs-panel" data-fs="more"><header><strong>更多設定</strong><span class="fs-sub">波速、頻率、圓心、復原…</span><button type="button" class="fs-fold" aria-label="收合">▾</button></header><div class="fs-body" data-slot="more"></div></section>
      <section class="fs-panel" data-fs="read"><header><strong>即時讀值</strong><span class="fs-sub" id="fs-time"></span><button type="button" class="fs-fold" aria-label="收合">▾</button></header><div class="fs-body" data-slot="read"></div></section></div>
      <section class="fs-panel" data-fs="time"><div class="fs-body" data-slot="time"></div></section>`;
    stage.append(fsLayer);
    let folds = {}; try { folds = JSON.parse(localStorage.getItem(FS_FOLD) || '{}'); } catch (_) { }
    if (folds.more === undefined) folds.more = true; // 更多設定預設收合
    fsLayer.querySelectorAll('.fs-panel').forEach(p => { if (folds[p.dataset.fs]) p.classList.add('folded'); });
    fsLayer.querySelectorAll('.fs-fold').forEach(b => {
      const p = b.closest('.fs-panel'); b.textContent = p.classList.contains('folded') ? '▸' : '▾';
      b.addEventListener('click', () => {
        p.classList.toggle('folded'); b.textContent = p.classList.contains('folded') ? '▸' : '▾';
        try { const f = JSON.parse(localStorage.getItem(FS_FOLD) || '{}'); f[p.dataset.fs] = p.classList.contains('folded'); localStorage.setItem(FS_FOLD, JSON.stringify(f)); } catch (_) { }
        draw();
      });
    });
    const scr = fsLayer.querySelector('.fs-exit');
    scr.hidden = !canBrowserFull; scr.addEventListener('click', toggleBrowserFull);
    $('fs-load').addEventListener('click', () => $('load-task').click());
    // 作答也在全螢幕裡：左欄換成作答卡，水面與右側讀值照常可用
    $('fs-answer').addEventListener('click', () => setAnswering(true));
    // 身分（班級／組別／座號）：一開始填一次，整節課沿用，送出作答時自動帶入
    const dlg = document.createElement('div'); dlg.className = 'fs-iddlg'; dlg.hidden = true;
    dlg.innerHTML = `<div class="fs-idbox" role="dialog" aria-label="填寫身分"><div class="fs-lang" data-no-i18n role="group" aria-label="Language"><button type="button" data-lang="zh">中文</button><button type="button" data-lang="en">English</button></div><h3>先填好你的身分</h3><p class="fs-idnote">整節課都用這個，送出作答時會自動帶入。</p>
      <div data-slot="who"></div><div class="fs-grp-label">組別（一組 3 人）</div>
      <div class="fs-grp">${Array.from({ length: 11 }, (_, i) => `<button type="button" data-grp="${i + 1}">${i + 1}</button>`).join('')}</div>
      <button type="button" class="fs-primary fs-wide" id="fs-id-done">開始</button></div>`;
    fsLayer.append(dlg);
    dlg.addEventListener('click', e => {
      const g = e.target.closest('[data-grp]');
      if (g) { $('group').value = g.dataset.grp; $('group').dispatchEvent(new Event('change', { bubbles: true })); idSync(); }
    });
    $('fs-id-done').addEventListener('click', () => { if (idReady()) { dlg.hidden = true; } else idSync(true); });
    fsLayer.addEventListener('click', e => { if (e.target.closest('[data-id-open]')) openId(); });
    ['cls', 'seat', 'student'].forEach(id => ['input', 'change'].forEach(ev => $(id).addEventListener(ev, () => idSync())));
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
      fsMove(document.querySelector('.lab-layout > .controls'), 'more');
      fsMove(document.querySelector('.answer-sheet > .who'), 'who');
      fsMove($('task-figure'), 'answer'); fsMove(document.querySelector('.answer-sheet'), 'answer');
    } else if (!on) {
      answering = false; fsLayer?.classList.remove('answering');
      while (fsMoved.length) { const [el, mark] = fsMoved.pop(); mark.replaceWith(el); }
    }
    fsSync();
  }
  const idReady = () => !!($('cls').value.trim() && $('seat').value.trim() && $('group').value);
  function idSync(warn) {
    if (!fsLayer) return;
    const c = $('cls').value.trim(), s = $('seat').value.trim(), g = $('group').value;
    const text = idReady() ? c + '班 ' + g + '組 ' + s + '號' : '✎ 先填身分';
    fsLayer.querySelectorAll('.fs-id').forEach(b => { b.textContent = text; b.classList.toggle('need', !idReady()); });
    fsLayer.querySelectorAll('[data-grp]').forEach(b => b.classList.toggle('on', b.dataset.grp === g));
    const done = $('fs-id-done'); if (done) done.textContent = idReady() ? '開始' : warn ? '還沒填完：' + [!c && '班級', !g && '組別', !s && '座號'].filter(Boolean).join('、') : '開始';
  }
  function openId() { if (!fsLayer) return; fsLayer.querySelector('.fs-iddlg').hidden = false; idSync(); }
  window.DopplerIdentity = { open: openId, ready: idReady };
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
  const FS_PHOTO = ['選這題會打開照片：藍筆圈在原地的、紅筆圈在移動的', '螢光筆圈跑得最快的那一隻，按「✓ 完成」', '圈好按「✎ 作答」→「送出給老師」', '想改：在作答區按「🖍 放大來圈」'];
  function fsSync() {
    if (!fsLayer || !stage.classList.contains('is-full')) return;
    const mode = manual ? 'manual' : swim > 0 ? 'swim' : 'demo', t = tasks[task];
    $('fs-mode').textContent = { manual: '自己排', demo: '示範中', swim: '觀察者動' }[mode];
    if ($('fs-task').options.length !== $('task').options.length) $('fs-task').replaceChildren(...[...$('task').options].map(o => new Option(o.textContent, o.value)));
    $('fs-task').value = $('task').value;
    $('fs-q').textContent = t ? t.q : '';
    $('fs-load').hidden = !(t && t.setup && t.setup.swim);
    const photo = !!(t && t.draw);
    const own = !photo && t && t.steps && manual;
    const steps = photo ? FS_PHOTO : own ? t.steps : FS_STEPS[mode].concat(view3d?.visible ? ['3D：拖曳旋轉，兩指縮放；排圓片請回 2D'] : []);
    const sig = photo ? 'photo' : own ? 'own-' + t.id : mode + view3d?.visible;
    // 自己擺的關卡：不放操作說明，只放排圓片要用的數據（波速、鴨子移速）
    const arr = arranging(), info = $('fs-info');
    info.hidden = !arr; $('fs-steps').hidden = arr; $('fs-status').hidden = arr;
    if (arr) {
      const m = Math.abs(params.mach), frac = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[m] || fmt(m), dir = params.mach < 0 ? '←' : '→';
      if (info.dataset.sig !== String(m)) {
        info.dataset.sig = String(m);
        info.innerHTML = '<div><span>水波波速</span><b>1 格／秒</b></div>' +
          (tasks[task].setup.speed
            ? '<div class="fs-speed"><span>鴨子移速</span><span class="seg">' + [0.25, 0.5, 0.75].map(v => '<button type="button" data-setmach="' + v + '" aria-pressed="' + (m === v) + '">' + { 0.25: '¼', 0.5: '½', 0.75: '¾' }[v] + '</button>').join('') + '</span><b>格／秒 →</b></div>'
            : '<div><span>鴨子移速</span><b>' + (m ? frac + ' 格／秒 ' + dir : '0（不動）') + '</b></div>') +
          '<div><span>打水</span><b>每秒 1 下，打了 5 秒</b></div>';
      }
    }
    if (!info.dataset.bound) { info.dataset.bound = '1'; info.addEventListener('click', e => { const bt = e.target.closest('[data-setmach]'); if (bt) document.querySelector('.qb-group [data-mach="' + bt.dataset.setmach + '"]')?.click(); }); }
    const ol = $('fs-steps'); if (ol.dataset.mode !== sig) { ol.dataset.mode = sig; ol.replaceChildren(...steps.map(s => { const li = document.createElement('li'); li.textContent = s; return li; })); }
    if (!$('fs-status').textContent) $('fs-status').textContent = $('status').textContent;
    fsLayer.querySelector('[data-fs="tray"]').hidden = answering || $('piece-tray').hidden;
    fsLayer.querySelector('[data-fs="guide"]').hidden = answering;
    fsLayer.querySelector('[data-fs="answer"]').hidden = !answering;
    $('fs-anum').textContent = '第 ' + t.n + ' 題';
    $('fs-aq').textContent = t ? t.q : '';
    fsLayer.querySelector('[data-fs="time"]').hidden = $('timeline').hidden;
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
    const b = fsLayer?.querySelector('.fs-exit'); if (b) b.textContent = inBrowserFull() ? '✕ 顯示網址列' : '⛶ 隱藏網址列';
    if (!inBrowserFull()) usedFullscreenApi = false; requestAnimationFrame(draw);
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
  $('task').replaceChildren(...tasks.map((t, i) => new Option(t.n + '　' + t.title, String(i))));
  syncDucks(); syncQuick();
  loadQuestion(); setManual(true); persist();
  if (!new URLSearchParams(location.search).has('page')) {
    setFull(true);
    // submit.js 稍後才把上次填的身分放回欄位，等它跑完再檢查
    setTimeout(() => { idSync(); if (!idReady()) openId(); }, 0);
  }
  window.addEventListener('doppler:lang', () => refresh());
  refresh(); requestAnimationFrame(tick);
})();
