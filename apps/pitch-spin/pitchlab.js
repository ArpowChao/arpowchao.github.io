/* PitchLab helpers shared by the SPIN page: video data, clock text, glossary popover,
 * and the full-screen mode with small floating windows. */
(function () {
  'use strict';
  const DEG = Math.PI / 180;

  // PitchLab readings from the uploaded video (right-handed pitcher). v / h = 垂直 / 水平 (cm, pitcher's view, + = 3B side).
  const VIDEO = [
    ['伸卡球', 92.8, 1299, '12:45', 38.7, 29.7, 14.2],
    ['速球', 96.4, 1233, '12:30', 39.5, 27.1, 9.0],
    ['曲球', 75.6, 1352, '10:30', 66.2, 17.5, -16.9],
    ['曲球', 80.0, 1364, '10:15', 73.7, 19.8, -22.8],
    ['滑球', 77.2, 1290, '9:30', 61.0, 8.9, -26.7],
    ['滑球', 81.8, 1360, '9:45', 69.0, 13.0, -30.7],
    ['滑球', 76.0, 1366, '10:15', 70.7, 12.8, -15.4],
    ['滑球', 74.9, 1303, '10:00', 67.6, 15.8, -28.4],
    ['滑球', 76.6, 1298, '10:45', 71.2, 25.1, -18.6],
    ['曲球', 69.3, 1274, '10:15', 61.3, 14.5, -21.0],
    ['滑球', 78.1, 1361, '10:00', 72.3, 8.8, -14.8],
    ['滑球', 75.0, 1295, '10:45', 68.0, 27.2, -19.4],
    ['變速球', 79.8, 911, '12:30', 30.8, 27.4, 7.7],
    ['卡特球', 78.7, 965, '12:45', 45.3, 30.6, 10.4]
  ].map(([type, kph, rpm, clock, gyro, v, h], i) => ({ label: `影片第 ${i + 1} 球｜${type} ${kph} kph`, short: `#${i + 1} ${type}`, type, kph, rpm, clock, gyro, v, h }));
  VIDEO.push({ label: '簡報範例｜卡特球 91.9 kph', short: '簡報 卡特球', type: '卡特球', kph: 91.9, rpm: 1345, clock: '12:00', gyro: 26.5, v: 23.3, h: -0.7 });

  function parseClock(s) {
    const m = String(s).trim().replace('：', ':').match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2] || 0);
    if (h > 12 || mi > 59) return null;
    return (h % 12) + mi / 60;
  }
  function clockText(t) {
    t = ((t % 12) + 12) % 12;
    let h = Math.floor(t + 1e-9), m = Math.round((t - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
  }
  const effFromGyro = (g) => Math.cos(g * DEG);
  const gyroFromEff = (e) => Math.acos(Math.max(0, Math.min(1, e))) / DEG;

  /* ---------- glossary ---------- */
  const GLOSS = {
    kph: { t: '球速', en: 'Velocity', b: '球飛多快。kph 就是 km/h（每小時幾公里）。', eg: '96 kph ≈ 每秒 27 公尺，從投手丘到本壘大約 0.7 秒。' },
    rpm: { t: '轉速', en: 'Spin Rate', b: '球每分鐘轉幾圈（rpm），把所有方向的旋轉都算進去。', eg: '1300 rpm ≈ 每秒 22 圈；球飛到本壘只轉十幾圈。' },
    clock: { t: '轉軸（幾點鐘）', en: 'Spin Axis / Tilt', b: '從投手背後看，旋轉把球「推」向時針指的方向。12:00 往上（後旋，掉得少）、6:00 往下（前旋，掉得多）、3:00／9:00 往三壘側／一壘側（側旋）。', eg: '時針是「被推的方向」，真正的轉軸跟時針垂直。' },
    gyro: { t: '陀螺角', en: 'Gyro Degree', b: '轉軸偏向「前進方向」幾度。0°＝轉軸橫躺、全部旋轉都在推球；90°＝像子彈、美式足球螺旋前進，旋轉推不動球。', eg: '滑球常有 60–75° 的陀螺角：轉很快，但推球的力不大。' },
    active: { t: '啟用中（有效轉速）', en: 'Active Spin', b: '總轉速中，真正能產生馬格努斯力（把球推偏）的那一部分。', eg: '啟用中 = 轉速 × 效率。' },
    eff: { t: '效率', en: 'Spin Efficiency', b: '有效轉速占總轉速的比例，由陀螺角決定：效率 = cos(陀螺角)。', eg: '0° → 100%；45° → 71%；60° → 50%；90° → 0%。不是直線關係！' },
    vb: { t: '垂直位移', en: 'Vertical Break', b: '和一顆完全不轉的球比，旋轉讓球高了（＋）或低了（−）幾公分。正值不是球往上飛，而是比不轉的球掉得少。', eg: '本頁從出手量到本壘；各裝置量法不同，比較時看方向與量級。' },
    hb: { t: '水平位移', en: 'Horizontal Break', b: '和不轉的球比，左右多跑了幾公分。正值＝從投手看出去往右（三壘側，右投手的慣用手側）。', eg: '右投手的滑球、曲球往一壘側跑，所以是負值。' },
    vec: { t: '旋轉軸向量', en: 'Spin Axis Vector', b: '由「幾點鐘＋陀螺角」自動換算出的轉軸方向（長度 1）。X 朝本壘、Y 朝上、Z 朝三壘側。', eg: '球繞著這根軸轉（右手定則：四指沿旋轉方向，拇指指向軸）。' },
    stuff: { t: 'Stuff+', en: '球質評分', b: '平台用模型把球速、位移等特徵算成的綜合分數，不是直接量到的物理量，本頁不計算。', eg: '許多平台以 100 代表平均，但各平台的模型與基準不同。' }
  };
  const term = (k, text) => `<button type="button" class="term" data-term="${k}">${text || GLOSS[k].t}</button>`;
  let pop = null, popFor = null;
  function hidePop() { if (pop) pop.style.display = 'none'; popFor = null; }
  function showPop(btn) {
    const g = GLOSS[btn.dataset.term]; if (!g) return;
    if (popFor === btn) { hidePop(); return; }
    if (!pop) { pop = document.createElement('div'); pop.className = 'term-pop'; pop.setAttribute('role', 'tooltip'); document.body.appendChild(pop); }
    pop.innerHTML = `<h4>${g.t}（${g.en}）</h4><p>${g.b}</p><p class="eg">${g.eg}</p>`;
    pop.style.display = 'block';
    const r = btn.getBoundingClientRect(), w = Math.min(320, innerWidth - 20);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(10, Math.min(innerWidth - w - 10, r.left + r.width / 2 - w / 2)) + 'px';
    const below = r.bottom + 8, h = pop.offsetHeight;
    pop.style.top = (below + h < innerHeight - 8 ? below : Math.max(8, r.top - h - 8)) + 'px';
    popFor = btn;
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.term');
    if (t) { showPop(t); e.stopPropagation(); } else if (!e.target.closest('.term-pop')) hidePop();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePop(); });
  window.addEventListener('scroll', hidePop, { passive: true });

  /* ---------- full screen with floating windows ---------- */
  // root: the element that fills the screen. wins: [{ el, title, place: {left|right, top|bottom, width}, open }]
  function fullscreenLab(root, wins, opts) {
    opts = opts || {};
    const dock = document.createElement('div');
    dock.className = 'fs-dock';
    dock.innerHTML = `<span class="fs-dock-title">${opts.title || ''}</span>`;
    const narrow = () => innerWidth < 760;
    const items = wins.map((w, i) => {
      const bar = document.createElement('div');
      bar.className = 'win-bar';
      bar.innerHTML = `<span class="win-title">${w.title}</span><button type="button" class="win-min" aria-label="收合">—</button><button type="button" class="win-close" aria-label="關閉">✕</button>`;
      w.el.prepend(bar);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'fs-dock-btn'; btn.textContent = w.icon ? `${w.icon} ${w.title}` : w.title;
      dock.appendChild(btn);
      const it = { ...w, bar, btn, open: !!w.open, min: false, pos: null, z: 0 };
      btn.addEventListener('click', () => setOpen(it, !it.open || it.min));
      bar.querySelector('.win-close').addEventListener('click', () => setOpen(it, false));
      bar.querySelector('.win-min').addEventListener('click', () => { it.min = !it.min; layout(it); });
      // drag by the title bar
      let d = null;
      bar.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button') || narrow()) return;
        const r = w.el.getBoundingClientRect();
        d = { x: e.clientX, y: e.clientY, l: r.left, t: r.top }; bar.setPointerCapture(e.pointerId); front(it);
      });
      bar.addEventListener('pointermove', (e) => {
        if (!d) return;
        const r = w.el.getBoundingClientRect();
        it.pos = { left: Math.max(0, Math.min(innerWidth - 60, d.l + e.clientX - d.x)), top: Math.max(0, Math.min(innerHeight - 40, d.t + e.clientY - d.y)) };
        w.el.style.left = it.pos.left + 'px'; w.el.style.top = it.pos.top + 'px'; w.el.style.right = 'auto'; w.el.style.bottom = 'auto';
        void r;
      });
      ['pointerup', 'pointercancel'].forEach((t) => bar.addEventListener(t, () => { d = null; }));
      w.el.addEventListener('pointerdown', () => front(it));
      return it;
    });
    const exit = document.createElement('button');
    exit.type = 'button'; exit.className = 'fs-dock-btn fs-exit'; exit.textContent = '✕ 離開全螢幕';
    exit.addEventListener('click', () => toggle(false));
    dock.appendChild(exit);
    root.appendChild(dock);

    let on = false, zTop = 130;
    function front(it) { it.z = ++zTop; it.el.style.zIndex = it.z; }
    function layout(it) {
      const el = it.el;
      el.classList.toggle('win-open', on && it.open);
      el.classList.toggle('win-min', on && it.min);
      it.btn.classList.toggle('on', it.open && !it.min);
      it.bar.querySelector('.win-min').textContent = it.min ? '▢' : '—';
      if (!on) { el.style.cssText = ''; return; }
      if (narrow()) { el.style.left = '8px'; el.style.right = '8px'; el.style.top = 'auto'; el.style.bottom = '8px'; el.style.width = 'auto'; return; }
      const p = it.place || {};
      el.style.width = (p.width || 330) + 'px';
      if (it.pos) { el.style.left = it.pos.left + 'px'; el.style.top = it.pos.top + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; return; }
      el.style.left = p.left != null ? p.left + 'px' : 'auto';
      el.style.right = p.right != null ? p.right + 'px' : 'auto';
      el.style.top = p.top != null ? p.top + 'px' : 'auto';
      el.style.bottom = p.bottom != null ? p.bottom + 'px' : 'auto';
    }
    function setOpen(it, v) {
      it.open = v; if (v) it.min = false;
      if (v && narrow()) items.forEach((o) => { if (o !== it) { o.open = false; layout(o); } });
      if (v) front(it);
      layout(it); notify();
    }
    function notify() { requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); if (opts.onChange) opts.onChange(on); }); }
    function toggle(v) {
      on = v === undefined ? !on : v;
      root.classList.toggle('fs-active', on);
      document.body.classList.toggle('fs-on', on);
      if (on) {
        items.forEach((it) => { it.open = narrow() ? false : !!it.openDefault; it.min = false; it.pos = null; });
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el.webkitRequestFullscreen && !document.webkitFullscreenElement) try { el.webkitRequestFullscreen(); } catch (e) { /* not supported */ }
      } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
      items.forEach(layout); hidePop(); notify();
    }
    items.forEach((it, i) => { it.openDefault = wins[i].open; });
    const onFsChange = () => { if (on && !document.fullscreenElement && !document.webkitFullscreenElement) toggle(false); };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('keydown', (e) => { if (on && e.key === 'Escape' && !document.fullscreenElement) toggle(false); });
    window.addEventListener('resize', () => { if (on) items.forEach(layout); });
    return { toggle, isOn: () => on, open: (i) => setOpen(items[i], true) };
  }

  window.PitchLab = { VIDEO, parseClock, clockText, effFromGyro, gyroFromEff, GLOSS, term, hidePop, fullscreenLab, DEG };
})();
