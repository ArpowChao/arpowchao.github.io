// 第 1 題：直接在照片上圈（藍筆圈原地、紅筆圈移動、螢光筆圈最快），圈好的照片隨作答送出
(function () {
  'use strict';
  const KEY = 'doppler-photo-v1', SRC = 'swans.jpg?v=1';
  const PENS = {
    blue: { label: '藍筆：原地', color: '#1f6fd1', w: 0.006 },
    red: { label: '紅筆：移動', color: '#d93a3a', w: 0.006 },
    hi: { label: '螢光筆：最快', color: 'rgba(255,205,0,.5)', w: 0.028 }
  };
  const img = new Image(); img.src = SRC;
  let strokes = [], pen = 'blue', modal = null, current = null;
  try { strokes = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { strokes = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(strokes)); } catch (_) { /* 只保留在這次 */ } };
  const views = new Set();

  function paint(c) {
    const g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (img.complete && img.naturalWidth) g.drawImage(img, 0, 0, W, H);
    for (const s of strokes) {
      const p = PENS[s.pen]; if (!p || !s.pts.length) continue;
      g.strokeStyle = p.color; g.lineWidth = Math.max(2, p.w * W); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(s.pts[0][0] * W, s.pts[0][1] * H);
      for (const [x, y] of s.pts.slice(1)) g.lineTo(x * W, y * H);
      if (s.pts.length === 1) g.lineTo(s.pts[0][0] * W + 0.5, s.pts[0][1] * H);
      g.stroke();
    }
  }
  const repaint = () => views.forEach(paint);
  img.addEventListener('load', repaint);

  // 讓一個 canvas 可以畫
  function drawable(c) {
    c.style.touchAction = 'none';
    const pos = e => { const r = c.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
    c.addEventListener('pointerdown', e => { e.preventDefault(); c.setPointerCapture(e.pointerId); current = { pen, pts: [pos(e)] }; strokes.push(current); repaint(); });
    c.addEventListener('pointermove', e => { if (!current) return; e.preventDefault(); current.pts.push(pos(e)); repaint(); });
    const end = () => { if (!current) return; current = null; save(); repaint(); changed(); };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  }
  function changed() { document.dispatchEvent(new CustomEvent('doppler:photo', { detail: strokes.length })); }

  function tools(onDone) {
    const bar = document.createElement('div'); bar.className = 'ph-tools';
    for (const [k, p] of Object.entries(PENS)) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.pen = k; b.className = 'ph-pen ph-' + k;
      b.innerHTML = '<i></i><span>' + p.label + '</span>'; b.setAttribute('aria-pressed', String(pen === k));
      b.addEventListener('click', () => { pen = k; document.querySelectorAll('.ph-pen').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.pen === pen))); });
      bar.append(b);
    }
    const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = '↶ 復原';
    undo.addEventListener('click', () => { strokes.pop(); save(); repaint(); changed(); });
    const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = '清除';
    clear.addEventListener('click', () => { strokes = []; save(); repaint(); changed(); });
    bar.append(undo, clear);
    if (onDone) { const done = document.createElement('button'); done.type = 'button'; done.className = 'ph-done'; done.textContent = '✓ 完成'; done.addEventListener('click', onDone); bar.append(done); }
    return bar;
  }

  function closeModal() { if (!modal) return; views.delete(modal.canvas); modal.el.remove(); modal = null; window.removeEventListener('resize', fitModal); }
  function fitModal() {
    if (!modal) return;
    const box = modal.stage.getBoundingClientRect(), ar = 1500 / 998;
    let w = box.width, h = w / ar; if (h > box.height) { h = box.height; w = h * ar; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    modal.canvas.style.width = w + 'px'; modal.canvas.style.height = h + 'px';
    modal.canvas.width = Math.round(w * dpr); modal.canvas.height = Math.round(h * dpr); paint(modal.canvas);
  }
  function open() {
    if (modal) return;
    const el = document.createElement('div'); el.className = 'ph-modal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '在照片上圈');
    const head = document.createElement('div'); head.className = 'ph-head';
    head.innerHTML = '<strong>在照片上圈出來</strong>';
    const stage = document.createElement('div'); stage.className = 'ph-stage';
    const canvas = document.createElement('canvas'); stage.append(canvas);
    el.append(head, tools(closeModal), stage);
    (document.fullscreenElement || document.webkitFullscreenElement || document.body).append(el);
    modal = { el, stage, canvas }; views.add(canvas); drawable(canvas);
    window.addEventListener('resize', fitModal); requestAnimationFrame(fitModal);
  }

  // 作答區裡的預覽（也可以直接畫）
  function mount(container) {
    container.replaceChildren();
    const wrap = document.createElement('div'); wrap.className = 'ph-inline';
    const c = document.createElement('canvas'); c.width = 900; c.height = Math.round(900 * 998 / 1500); c.className = 'ph-preview';
    const big = document.createElement('button'); big.type = 'button'; big.className = 'ph-open fs-primary'; big.textContent = '🖍 放大來圈';
    big.addEventListener('click', open);
    wrap.append(big, tools(null), c); container.append(wrap);
    for (const v of [...views]) if (!v.isConnected) views.delete(v);
    views.add(c); drawable(c); paint(c);
  }
  // 送出用：原尺寸的圈選照片；沒有畫任何東西時回傳 null
  function canvas() {
    if (!strokes.length) return null;
    const c = document.createElement('canvas'); c.width = 1500; c.height = 998; paint(c); return c;
  }
  // 生活體驗（1-1、1-2）：水面換成這張鴨子划水的照片（含自己圈的筆跡）；1-1 直接在上面畫
  let back = null;
  function backdrop(on, drawTask) {
    const host = document.getElementById('pond-area');
    if (!on || !host) { if (back) { views.delete(back.c); back.el.remove(); back = null; } return; }
    if (back && back.draw !== !!drawTask) backdrop(false);
    if (!back) {
      const el = document.createElement('div'); el.className = 'ph-back';
      const c = document.createElement('canvas'); c.width = 1500; c.height = 998;
      if (drawTask) { el.append(tools(null)); drawable(c); }   // 1-1：直接在照片上畫
      el.append(c); host.append(el);
      back = { el, c, draw: !!drawTask }; views.add(c);
    }
    paint(back.c);
  }
  const sync = t => backdrop(!window.DOPPLER_FREE && !!t && t.group === 'photo', !!(t && t.draw));
  document.addEventListener('doppler:task', e => sync(e.detail.task));
  if (window.DopplerLab) sync(window.DopplerLab.tasks[window.DopplerLab.taskIndex]);
  window.DopplerPhoto = { mount, open, canvas, count: () => strokes.length };
})();
