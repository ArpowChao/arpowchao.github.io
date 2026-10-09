(() => {
  'use strict';
  const P = window.DopplerPhysics, $ = id => document.getElementById(id);
  const canvas = $('pond'), ctx = canvas.getContext('2d');
  const params = { c: 1, f: 1, mach: 0 };
  const observers = [{ x: 5, y: 0 }, { x: -5, y: 0 }];
  const tasks = [
    '波源在原地每秒打水 1 下。請用不同半徑的圓片，自己排列出 5 秒時的水波圖，也放好當下波源位置。從最外圈到最內圈，依序寫出發波時間。哪一圈最早？為什麼？',
    '請自己拖動圓片，分別組合出波源以 ¼、½、¾ 波速向右移動時，5 秒的水波圖。每種速度各存一張圖。前方與後方的波間距如何改變？用方格或兩點量測支持你的說法。',
    '先自己排列靜止波源的 5 秒水波圖，再放上一隻不動的小鴨。從波間距推理：每秒被波打到幾次？波持續抵達後，10 秒內共幾次？完成後可用進階自動比對檢查。',
    '請自己排列波源以 ½ 波速向右移動的 5 秒水波圖，並放上 A、B 小鴨。前方與後方誰較常被波打到？用你排出的圓心位置和波間距說明，再試試 ¼、¾ 波速。'
  ];
  let time = 5, playing = false, lastFrame = null, lastReadout = 0;
  let ruler = null, measureMode = false, pointer = null, view = null;
  let manual = true, pieces = [], selectedPiece = 0, savedCenters = null;
  let preview = null, flashDirty = false;
  const quack = new window.DopplerQuack();
  const undo = [];
  const legacyParking = [{ x: -2, y: 1.5 }, { x: 1.5, y: 1 }, { x: -1.5, y: -1.5 }, { x: 2, y: -1 }, { x: 0, y: 2 }, { x: 3, y: -2 }];
  let task = 0, answers = ['', '', '', ''], savedStudent = '', storageOK = true;
  const records = [];
  const fmt = (v, places = 2) => Number(v).toFixed(places);
  const status = message => { $('status').textContent = message; };
  try {
    const saved = JSON.parse(localStorage.getItem('doppler-worksheet-v1') || 'null');
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
    try { localStorage.setItem('doppler-worksheet-v1', JSON.stringify({ answers, student: $('student').value, snapToGrid: $('snap-grid').checked, manualSettings: { ...params },
      manualCenters: pieces.map(p => ({ n: p.n, x: p.x, y: p.y, placed: p.placed })) })); }
    catch (_) { storageOK = false; }
    if (!storageOK) $('save-note').textContent = '此瀏覽器無法保存回答；請在離開前下載圖片。';
  }
  function setPlaying(next) {
    playing = Boolean(next && (!manual || preview)); lastFrame = null;
    if (!playing) quack.stop();
    $('play').textContent = playing ? 'Ⅱ 暫停' : '▶ 播放';
    $('play').setAttribute('aria-pressed', String(playing));
    $('preview-play').textContent = manual && playing ? 'Ⅱ 暫停' : preview ? preview.elapsed >= preview.end ? '▶ 重新播放' : '▶ 繼續播放' : '▶ 播放我的排列';
    $('preview-play').setAttribute('aria-pressed', String(manual && playing));
  }
  function clearPreview() { if (manual) setPlaying(false); preview = null; flashDirty = false; }
  function previewReading(i) {
    return preview ? P.snapshotReceived(params.c, preview.waves, observers[i], preview.elapsed) : { count: 0, interval: null, last: null };
  }
  function detectHits(now) {
    if (!preview || !$('observers').checked) return;
    observers.forEach((_, i) => {
      const r = previewReading(i);
      if (r.count > preview.hits[i]) {
        if ($('quack-sound').checked) for (let n = preview.hits[i]; n < r.count; n++) {
          if (!quack.play(i)) $('sound-status').textContent = '聲音尚未啟用，請按「試聽呱聲」。';
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
      $('sound-status').textContent = '瀏覽器尚未允許聲音，請按「試聽呱聲」重試。';
    }
    if (!manual || pointer || !$('observers').checked) return;
    if (!preview || preview.elapsed >= preview.end) {
      const waves = snapshot(), arrivals = observers.flatMap(o => P.snapshotArrivals(params.c, waves, o));
      preview = { waves, elapsed: 0, hits: [0, 0], flashAt: [-Infinity, -Infinity], end: Math.max(3, ...arrivals.map(a => a.time)) + .6 };
    }
    setMeasure(false); setPlaying(true); detectHits(performance.now()); refresh();
  });
  $('preview-reset').addEventListener('click', () => { clearPreview(); refresh(); status('已回到你排好的圓圈，兩隻小鴨的位置保留。'); });
  $('quack-sound').addEventListener('change', async () => {
    if (!$('quack-sound').checked) { quack.stop(); $('sound-status').textContent = '呱聲已關閉，閃光和計次保留。'; }
    else $('sound-status').textContent = await quack.unlock() ? '呱聲已啟用。' : '請按「試聽呱聲」啟用聲音。';
  });
  $('test-quack').addEventListener('click', async () => {
    const ready = await quack.unlock();
    if (ready && quack.play(0)) {
      $('quack-sound').checked = true;
      $('sound-status').textContent = '已試播呱聲。若仍無聲，請確認此分頁與裝置音量。';
    } else $('sound-status').textContent = '瀏覽器未能啟用聲音，請重新載入後再試聽。';
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
          canvas.setPointerCapture(e.pointerId);
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
    $('preset-heading').textContent = manual ? '這次要組合哪種情況？' : '自動模擬的波源速度';
    setMeasure(false); refresh();
    status(manual ? '回到你自己的排列。拖曳每一片圓圈，或用方向鍵微調。' : '現在顯示自動模擬。取消進階區的勾選，即可回到自己的作品。');
  }
  function projection(width, height) {
    const extent = manual ? Math.max(6.25, ...pieces.map(p => p.radius + 1.25)) :
      Math.max(5.5, params.c * Math.max(5, time) + .65, ...observers.flatMap(o => [Math.abs(o.x) + .5, Math.abs(o.y) + .5]));
    // Use the whole square board for the five waves, without extra side ranges
    // or a pixel-per-metre cap. The physical view stays fixed while arranging.
    const scale = Math.max(1, (Math.min(width, height) - (manual ? 0 : 54)) / (2 * extent));
    return { scale, cx: width / 2, cy: height / 2, width, height,
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
  function duck(c, point, color, direction, tag, flash) {
    c.save(); c.translate(point.x, point.y);
    if (flash) { c.fillStyle = '#ffe37899'; c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#d59e00'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.stroke(); }
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
    c.restore(); text(c, tag, point.x, point.y + 26, '#153f4d', 'center', 11);
    if (flash) text(c, '呱！', point.x, point.y - 37, '#946400', 'center', 15);
  }
  function drawScene(c, width, height, savedCamera = null) {
    const camera = savedCamera || projection(width, height);
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
      for (let n = Math.ceil(-camera.cx / camera.scale / labelStep); n <= (width - camera.cx) / camera.scale / labelStep; n++) { const x = n * labelStep, px = xy({ x, y: 0 }, camera).x; if (px > 20 && px < width - 20) text(c, fmt(x, 1).replace('.0', ''), px, height - 13, '#688790', 'center', 10); }
    }
    const waves = manual ? preview ? P.snapshotWaves(params.c, preview.waves, preview.elapsed) : pieces.filter(p => p.placed) : P.waves(params, time);
    c.save(); c.setLineDash([3, 6]); c.lineWidth = 1; c.strokeStyle = '#b6cdd2'; c.beginPath();
    const source = xy(manual ? pieces.at(-1) : P.source(params, time), camera);
    if (!manual) { c.moveTo(camera.cx, camera.cy); c.lineTo(source.x, source.y); c.stroke(); } c.restore();
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
        c.fillStyle = '#ffffffee'; c.beginPath(); c.arc(p.x + 15, p.y - 15, 8, 0, Math.PI * 2); c.fill();
        text(c, String(w.n + 1), p.x + 15, p.y - 15, color, 'center', 11);
      }
      if ($('labels').checked && radius > 2) {
        const angle = params.mach >= 0 ? -2.05 : -.95;
        const label = '發波 t=' + fmt(w.emitted, 1).replace('.0', '') + 's';
        const tx = p.x + Math.cos(angle) * radius, ty = p.y + Math.sin(angle) * radius;
        c.fillStyle = '#f7fbfcee'; c.fillRect(tx - 42, ty - 9, 84, 18);
        text(c, label, tx, ty, '#08677f', 'center', 11);
      }
    });
    if (!manual && params.mach !== 0) arrow(c, { x: source.x, y: source.y - 30 }, { x: source.x + Math.sign(params.mach) * 42, y: source.y - 30 }, '#977008');
    if (!manual || pieces.at(-1).placed) {
      duck(c, source, '#e9b93a', params.mach < 0 ? -1 : 1, '波源', false);
      if (manual && selectedPiece === pieces.length - 1) { c.strokeStyle = '#a47700'; c.lineWidth = 2; c.beginPath(); c.arc(source.x, source.y, 22, 0, Math.PI * 2); c.stroke(); }
      if ($('labels').checked && (manual || Math.abs(waves.at(-1).emitted - time) < 1e-8)) text(c, (manual ? '當下 t=' : '剛發出 t=') + fmt(manual ? 5 : time, 1) + 's', source.x, source.y + 45, '#977008', 'center', 10);
    }
    if ($('observers').checked) observers.forEach((o, i) => {
      const received = manual ? previewReading(i) : P.received(params, o, time);
      const hit = manual ? Boolean(preview && performance.now() - preview.flashAt[i] < 260) : received.last !== null && time - received.last < .18;
      duck(c, xy(o, camera), i ? '#88bdc3' : '#32a0ac', i ? 1 : -1, i ? 'B 小鴨' : 'A 小鴨', hit);
    });
    if (manual && pieces[selectedPiece]?.placed) {
      const selected = pieces[selectedPiece], p = xy(selected, camera);
      const label = '(' + fmt(selected.x) + ', ' + fmt(selected.y) + ')';
      const x = Math.max(5, Math.min(width - 100, p.x + 14)), y = Math.max(12, Math.min(height - 15, p.y + 21));
      c.fillStyle = '#fff9e8'; c.fillRect(x - 3, y - 10, 97, 20); text(c, label, x, y, '#765400', 'left', 11);
    }
    if (ruler) {
      const a = xy(ruler.a, camera), b = xy(ruler.b, camera);
      c.save(); c.strokeStyle = '#a47700'; c.lineWidth = 2; c.setLineDash([5, 3]); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.restore();
      for (const p of [a, b]) { c.fillStyle = '#a47700'; c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill(); }
      const label = fmt(P.distance(ruler.a, ruler.b)) + ' m', x = Math.max(40, Math.min(width - 40, (a.x + b.x) / 2)), y = Math.max(16, Math.min(height - 16, (a.y + b.y) / 2 - 14));
      c.fillStyle = '#fff5d4'; c.fillRect(x - 37, y - 10, 74, 20); text(c, label, x, y, '#765400', 'center', 12);
    }
    c.restore(); return { camera, cell };
  }
  function draw() {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
    // Fill the whole backing bitmap, including any fractional CSS edge pixel.
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f7fbfc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const result = drawScene(ctx, rect.width, rect.height); view = result.camera;
    $('grid-caption').textContent = $('grid').checked ? '1 大格 = 1λ = ' + fmt(result.cell, 2).replace(/\.00$/, '') + ' m；每大格 4 小格' : '方格已隱藏';
    canvas.dataset.wavelength = result.cell; canvas.dataset.smallCell = result.cell / 4;
    canvas.dataset.placedCount = pieces.filter(p => p.placed).length;
    canvas.dataset.placedCircleCount = pieces.filter(p => p.radius > 0 && p.placed).length;
  }
  function readouts() {
    $('scene-time').textContent = manual ? preview ? '我的排列 · ＋' + fmt(preview.elapsed) + ' s' : '自己組合 · 5 s' : 't = ' + fmt(time) + ' s'; $('time-readout').textContent = fmt(time) + ' s'; $('time').value = time;
    $('manual-playback').hidden = !manual || !$('observers').checked;
    $('preview-play').disabled = !pieces.some(p => p.placed && p.radius > 0);
    $('preview-reset').disabled = !preview;
    $('preview-time').value = '經過 ' + fmt(preview?.elapsed || 0) + ' s';
    for (let i = 0; i < 2; i++) {
      const id = i ? 'b' : 'a', r = previewReading(i);
      $('duck-' + id + '-count').textContent = '收到 ' + r.count + ' 次';
      $('duck-' + id + '-interval').textContent = r.interval === null ? '尚未收到兩圈' : '最近間隔 ' + fmt(r.interval, 3) + ' s';
      $('duck-' + id + '-reading').dataset.flash = String(Boolean(preview && performance.now() - preview.flashAt[i] < 260));
    }
    $('scene-setting').textContent = manual ? '題目：' + (params.mach === 0 ? '靜止波源' : fmt(Math.abs(params.mach)) + ' 波速向' + (params.mach > 0 ? '右' : '左')) : configText();
    $('parameter-note').textContent = (manual ? '題目：' : '') + '每秒打水 ' + fmt(params.f, 1) + ' 下；波速 ' + fmt(params.c, 1) + ' m/s；波源移速 ' + fmt(Math.abs(params.mach * params.c)) + ' m/s。' + (manual ? '選速度不會自動排列。' : '');
    $('mach-value').textContent = fmt(Math.abs(params.mach));
    $('measurement').textContent = ruler ? '兩點距離：' + fmt(P.distance(ruler.a, ruler.b)) + ' m（直線距離）' : '拖出一段距離，比較前、後方的波間距。';
    $('clear-measure').disabled = !ruler;
    $('back').disabled = time <= 0; $('step').disabled = time >= 10;
    $('manual-toolbar').firstElementChild.textContent = '5 秒的透明片：' + (pieces.length - 1) + ' 個圓圈＋可拖曳的波源小鴨';
    $('arrival-readings').replaceChildren();
    if (manual) { refreshPieces(); return; }
    if (!$('observers').checked) { const p = document.createElement('p'); p.className = 'copy'; p.textContent = '先勾選「放置 A、B 兩隻小鴨」。'; $('arrival-readings').append(p); return; }
    observers.forEach((o, i) => {
      const r = P.received(params, o, time), card = document.createElement('div'); card.className = 'arrival-card';
      const h = document.createElement('h3'); h.textContent = (i ? 'B' : 'A') + ' 小鴨 · (' + fmt(o.x, 1) + ', ' + fmt(o.y, 1) + ') m'; card.append(h);
      for (const label of ['目前抵達 ' + r.count + ' 次', '最近兩圈間隔：' + (r.interval === null ? '尚未收到兩圈' : fmt(r.interval, 3) + ' s'), '此間隔對應頻率：' + (r.frequency === null ? '—' : fmt(r.frequency, 3) + ' 次/s')]) { const p = document.createElement('p'); p.textContent = label; card.append(p); }
      const p = document.createElement('p'); p.className = 'arrival-times'; p.textContent = r.events.length ? '抵達時刻：' + r.events.map(a => fmt(a.time, 2) + 's').join('、') : '還沒有波抵達。'; card.append(p);
      $('arrival-readings').append(card);
    });
  }
  function refresh() { draw(); readouts(); }
  function setTime(next) { setPlaying(false); time = Math.max(0, Math.min(10, next)); refresh(); }
  function changeMach(value) {
    setPlaying(false); clearPreview(); params.mach = value; $('mach').value = Math.abs(value); $('reverse').checked = value < 0;
    document.querySelectorAll('[data-mach]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.mach) === value)));
    refresh(); persist(); status(manual ? '已改變題目速度，你排列的圓心位置保留。' : '已切換速度，保留目前 ' + fmt(time) + ' 秒的觀察時刻。');
  }
  document.querySelectorAll('[data-mach]').forEach(button => button.addEventListener('click', () => changeMach(Number(button.dataset.mach))));
  $('play').addEventListener('click', () => { if (time >= 10 && !playing) time = 0; setPlaying(!playing); refresh(); });
  $('reset').addEventListener('click', () => { setTime(0); status('回到 0 秒：第一圈剛從原點發出。'); });
  $('time').addEventListener('input', () => setTime(Number($('time').value)));
  $('step').addEventListener('click', () => setTime((Math.floor(time * params.f + 1e-8) + 1) / params.f));
  $('back').addEventListener('click', () => setTime((Math.ceil(time * params.f - 1e-8) - 1) / params.f));
  ['labels', 'centers', 'grid'].forEach(id => $(id).addEventListener('change', refresh));
  $('observers').addEventListener('change', () => { clearPreview(); refresh(); });
  function setMeasure(next) {
    measureMode = next; $('measure').setAttribute('aria-pressed', String(next)); canvas.style.cursor = next ? 'crosshair' : 'grab';
    $('gesture-hint').textContent = next ? '按住、拖曳、放開，量測兩點距離' : manual ? ($('snap-grid').checked ? '拖入水面，圓心自動對齊小格' : '從圓片盤拖入水面，自由排列') : '拖曳 A、B 小鴨可改變位置';
  }
  $('measure').addEventListener('click', () => { setPlaying(false); setMeasure(!measureMode); refresh(); });
  $('clear-measure').addEventListener('click', () => { ruler = null; refresh(); });
  function basic() {
    params.c = 1; params.f = 1; $('wave-speed').value = 1; $('frequency').value = 1; $('play-rate').value = 1;
    rebuildPieces(); undo.length = 0;
    ruler = null; setMeasure(false); changeMach(0);
  }
  $('restore').addEventListener('click', () => { basic(); status('已恢復波速 1 m/s、每秒打水 1 下、波源靜止。'); });
  ['wave-speed', 'frequency'].forEach((id, i) => $(id).addEventListener('change', () => {
    const input = $(id), value = Number(input.value), key = i ? 'f' : 'c';
    if (!input.value || !Number.isFinite(value) || value < .5 || value > 2 || !input.checkValidity()) { input.value = params[key]; status('請輸入 0.5～2 範圍內符合步距的數值。'); return; }
    setPlaying(false); params[key] = value; rebuildPieces(); undo.length = 0; refresh(); persist();
    status(manual ? '已更新圓片半徑，保留你排好的圓心。' : '已重建圓圈；目前時刻與小鴨位置保留。');
  }));
  ['mach', 'reverse'].forEach(id => $(id).addEventListener('input', () => changeMach(Number($('mach').value) * ($('reverse').checked ? -1 : 1))));
  $('automatic').addEventListener('change', () => setManual(!$('automatic').checked));
  $('piece-select').addEventListener('change', () => { selectedPiece = Number($('piece-select').value); setMeasure(false); refresh(); });
  $('scatter').addEventListener('click', () => { const before = snapshot(), source = pieces.at(-1); rebuildPieces([source]); ruler = null; remember(before); refresh(); status('圓圈已收回圓片盤，小鴨保留在水面上。'); });
  $('undo-piece').addEventListener('click', () => { if (!undo.length) return; clearPreview(); pieces = undo.pop(); refresh(); persist(); status('已復原上一步排列。'); });
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
      $('position-note').textContent = '這個座標會讓圓圈超出水面，請選靠近中央的位置。'; return;
    }
    const before = snapshot(); Object.assign(p, { x, y, placed: true });
    clearPreview();
    $('piece-x').value = x; $('piece-y').value = y;
    $('position-note').textContent = '已放到 (' + fmt(x) + ', ' + fmt(y) + ') m，其他圓圈保留。';
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
  function eventPoint(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || pointer) return;
    const p = eventPoint(e); setPlaying(false); canvas.focus({ preventScroll: true });
    if (manual && preview && !measureMode) { clearPreview(); draw(); }
    if (measureMode) { pointer = { id: e.pointerId, mode: 'measure' }; const w = world(p.x, p.y); ruler = { a: w, b: { ...w } }; }
    else {
      const observerIndex = $('observers').checked ? observers.findIndex(o => { const s = xy(o, view); return Math.hypot(s.x - p.x, s.y - p.y) < 24; }) : -1;
      const piece = manual ? hitPiece(p) : null;
      if (manual && !pieces[selectedPiece].placed && !piece && observerIndex < 0) {
        const before = snapshot(), selected = pieces[selectedPiece], w = world(p.x, p.y);
        selected.placed = true; selected.x = w.x; selected.y = w.y; constrainPiece(selected, view, $('snap-grid').checked);
        pointer = { id: e.pointerId, mode: 'piece', i: selected.n, camera: { ...view }, dx: selected.x - w.x, dy: selected.y - w.y, before };
        canvas.setPointerCapture(e.pointerId); refresh(); return;
      }
      if (observerIndex >= 0 && (!piece || P.distance(piece, world(p.x, p.y)) * view.scale > 13)) {
        $('observer-select').value = observerIndex; pointer = { id: e.pointerId, mode: 'observer', i: observerIndex, camera: { ...view } };
      } else if (piece) {
        selectedPiece = piece.n; const w = world(p.x, p.y);
        pointer = { id: e.pointerId, mode: 'piece', i: piece.n, camera: { ...view }, dx: piece.x - w.x, dy: piece.y - w.y, before: snapshot() };
      } else { status(manual ? '抓住圓心或圓周就能移動；重疊時從選單挑選圓片。' : '請拖曳 A、B 小鴨；或選「量測兩點距離」再拖曳。'); return; }
    }
    canvas.setPointerCapture(e.pointerId); refresh();
  });
  canvas.addEventListener('pointermove', e => {
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
    else observers[pointer.i] = w;
    refresh();
  });
  function finish(e) {
    if (!pointer || pointer.id !== e.pointerId) return;
    const action = pointer; pointer = null; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (action.mode === 'piece') {
      if (e.type === 'pointercancel' || action.fromTray && !action.inside) pieces = action.before;
      else remember(action.before);
    }
    status(manual ? '已放好圓片。可以繼續排列、量測，或儲存這張圖。' : '畫面已暫停，可以繼續觀察或儲存截圖。'); refresh();
  }
  canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish);
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
  function loadQuestion() { $('question').textContent = tasks[task]; $('answer').value = answers[task]; }
  $('task').addEventListener('change', () => { task = Number($('task').value); loadQuestion(); });
  $('answer').addEventListener('input', () => { answers[task] = $('answer').value; persist(); });
  $('student').addEventListener('input', persist);
  $('load-task').addEventListener('click', () => {
    basic(); observers[0] = { x: 5, y: 0 }; observers[1] = { x: -5, y: 0 };
    setManual(true); time = 5;
    $('labels').checked = false; $('observers').checked = task >= 2; $('centers').checked = true; $('grid').checked = true;
    changeMach([0, .25, 0, .5][task]); refresh();
    status('已套用第 ' + (task + 1) + ' 題條件，你排好的圓心與回答保留。');
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
  function evidence(withAnswer) {
    setPlaying(false); refresh(); persist();
    const image = document.createElement('canvas'), c = image.getContext('2d'), width = 1200, inset = 40;
    const pondHeight = Math.round(1120 * canvas.getBoundingClientRect().height / canvas.getBoundingClientRect().width);
    c.font = '21px "Microsoft JhengHei",sans-serif';
    const question = wrap(c, tasks[task], 1120), answer = wrap(c, $('answer').value || '（尚未填寫回答）', 1120);
    const extra = withAnswer ? 190 + (question.length + answer.length) * 34 : 0;
    image.width = width; image.height = 204 + pondHeight + extra + (preview ? 32 : 0);
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, image.width, image.height);
    text(c, '都卜勒・水波實驗', inset, 39, '#153f4d', 'left', 30);
    text(c, (preview ? '從我的排列經過 ' + fmt(preview.elapsed) : 't = ' + fmt(manual ? 5 : time)) + ' s  |  ' + configText() + '  |  c=' + fmt(params.c) + ' m/s  |  f=' + fmt(params.f) + ' 次/s', inset, 81, '#5d7b86', 'left', 17);
    text(c, manual ? preview ? '學生排列的波前向外擴散，圓心固定；次數從開始播放時算起。' : '學生手動組合：每個圓心由學生設定，圓片半徑固定。' : '每圈從當時發波的位置擴大；第一圈在 t=0 發出。', inset, 113, '#5d7b86', 'left', 17);
    // Preserve the full work surface when exporting to a different pixel size.
    const fullCamera = projection(canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
    const exportCamera = { ...fullCamera, scale: fullCamera.scale * 1120 / canvas.getBoundingClientRect().width,
      cx: 560, cy: pondHeight / 2, width: 1120, height: pondHeight };
    c.save(); c.translate(inset, 140); const exportedView = drawScene(c, 1120, pondHeight, exportCamera); c.restore();
    const y = 140 + pondHeight;
    const notes = [];
    if ($('observers').checked) observers.forEach((o, i) => {
      const r = manual ? previewReading(i) : P.received(params, o, time);
      notes.push((i ? 'B' : 'A') + '=(' + fmt(o.x) + ',' + fmt(o.y) + ')m' + (preview || !manual && $('arrival-panel').open ? ' · ' + r.count + '次 · Δt=' + (r.interval === null ? '—' : fmt(r.interval, 3) + 's') : ''));
    });
    const measurement = ($('grid').checked ? '1大格=1λ=' + fmt(exportedView.cell) + 'm；4小格/大格 · ' : '') + (ruler ? '量測 ' + fmt(P.distance(ruler.a, ruler.b)) + 'm' : '未放置量測線');
    text(c, (notes.length ? notes.join('    ') + '    ' : '') + (preview ? '' : measurement), inset, y + 31, '#5d7b86', 'left', 16);
    if (preview) text(c, measurement, inset, y + 63, '#5d7b86', 'left', 16);
    if (withAnswer) {
      let cursor = y + 85 + (preview ? 32 : 0);
      text(c, '練習 ' + (task + 1) + '  |  ' + ($('student').value || '未填姓名／座號'), inset, cursor, '#087c91', 'left', 21); cursor += 40;
      question.forEach(line => { text(c, line, inset, cursor, '#153f4d', 'left', 21); cursor += 34; });
      cursor += 16; text(c, '我的回答', inset, cursor, '#087c91', 'left', 21); cursor += 36;
      answer.forEach(line => { text(c, line, inset, cursor, '#153f4d', 'left', 21); cursor += 34; });
    }
    const filename = 'doppler-' + (manual ? preview ? 'my-waves' : 'manual' : 'auto') + '-q' + (task + 1) + '-v' + fmt(params.mach) + '-t' + fmt(preview ? preview.elapsed : manual ? 5 : time) + (withAnswer ? '-answer' : '-pond') + '.png';
    const url = image.toDataURL('image/png'); download(url, filename);
    const figure = document.createElement('figure'); figure.className = 'record';
    const img = document.createElement('img'); img.src = url; img.alt = '第 ' + (task + 1) + ' 題，' + configText() + '，' + fmt(manual ? 5 : time) + ' 秒的實驗紀錄'; img.width = width; img.height = image.height;
    const caption = document.createElement('figcaption'), label = document.createElement('span'), link = document.createElement('a');
    label.textContent = '練習 ' + (task + 1) + ' · ' + configText() + ' · ' + fmt(manual ? 5 : time) + ' s';
    link.href = url; link.download = filename; link.textContent = '再次下載這張圖片';
    caption.append(label, link); figure.append(img, caption); $('records').prepend(figure); records.push(figure);
    if (records.length > 6) records.shift().remove();
    $('records-empty').hidden = true; $('clear-records').hidden = false;
    status(manual ? '已下載你親手排列的水波圖。' : '圖片已產生並下載，畫面停在 ' + fmt(time) + ' 秒。');
  }
  $('capture').addEventListener('click', () => evidence(true)); $('capture-only').addEventListener('click', () => evidence(false));
  $('clear-records').addEventListener('click', () => { records.length = 0; $('records').replaceChildren(); $('records-empty').hidden = false; $('clear-records').hidden = true; status('已清除本次圖片預覽，下載的圖片與文字回答仍保留。'); });
  function tick(now) {
    if (playing && manual && preview) {
      if (lastFrame !== null) preview.elapsed = Math.min(preview.end, preview.elapsed + Math.min(.1, (now - lastFrame) / 1000) * Number($('play-rate').value));
      detectHits(now); draw();
      if (now - lastReadout > 80 || preview.elapsed >= preview.end) { readouts(); lastReadout = now; }
      if (preview.elapsed >= preview.end) { setPlaying(false); status('已播放完放好的波前。可以重新播放，或回到原排列調整小鴨的位置。'); }
    } else if (playing) {
      if (lastFrame !== null) time = Math.min(10, time + Math.min(.1, (now - lastFrame) / 1000) * Number($('play-rate').value));
      draw();
      if (now - lastReadout > 100 || time >= 10) { readouts(); lastReadout = now; }
      if (time >= 10) { setPlaying(false); status('已到 10 秒。可以拖曳時間滑桿回看，或儲存這一刻。'); }
    } else if (flashDirty) {
      draw(); readouts(); flashDirty = Boolean(preview && preview.flashAt.some(t => now - t < 260));
    }
    lastFrame = now; requestAnimationFrame(tick);
  }
  new ResizeObserver(draw).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { setPlaying(false); readouts(); } });
  rebuildPieces(savedCenters || []);
  $('wave-speed').value = params.c; $('frequency').value = params.f; $('mach').value = Math.abs(params.mach); $('reverse').checked = params.mach < 0;
  document.querySelectorAll('[data-mach]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.mach) === params.mach)));
  loadQuestion(); setManual(true); persist(); refresh(); requestAnimationFrame(tick);
})();
