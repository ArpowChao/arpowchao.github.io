'use strict';
/* 轉軸與陀螺角 互動說明：時鐘方向、陀螺角、效率 = cos(陀螺角)。
 * Screen frame used here (seen from behind the pitcher): x → 3B side (pitcher's right), y ↑, z → toward the viewer/pitcher.
 * Home plate is −z. Push direction m = (sinθ, cosθ, 0); transverse axis a⊥ = v̂ × m = (cosθ, −sinθ, 0);
 * spin axis a = cosφ·a⊥ + sinφ·(−z) (right-handed pitcher). Surface velocity = a × p. */
(() => {
  const PL = window.PitchLab, DEG = Math.PI / 180, $ = (id) => document.getElementById(id);
  if (!$('axis-gyro')) return;
  const ex = { tilt: 0, gyro: 0, rpm: 1300 };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const f = (v) => v.toFixed(1);

  function axisVec() {
    const th = ex.tilt * 30 * DEG, ph = ex.gyro * DEG;
    const m = [Math.sin(th), Math.cos(th), 0], aT = [Math.cos(th), -Math.sin(th), 0];
    const a = add(aT.map((x) => x * Math.cos(ph)), [0, 0, -1], Math.sin(ph));
    return { m, aT, a };
  }

  /* ---------- 1. clock ---------- */
  const svgClock = $('ex-clock');
  const ballDeco = (R) => `<circle r="${R}" fill="#fbf8f1" stroke="#d6cdbb" stroke-width="2"/>`;
  function ticks(r0, r1, nums) {
    let s = '';
    for (let i = 0; i < 48; i++) {
      const a = i * 7.5 * DEG, big = i % 4 === 0, ri = big ? r0 - 3 : r0;
      s += `<line x1="${(Math.sin(a) * ri).toFixed(1)}" y1="${(-Math.cos(a) * ri).toFixed(1)}" x2="${(Math.sin(a) * r1).toFixed(1)}" y2="${(-Math.cos(a) * r1).toFixed(1)}" stroke="#b3bec3" stroke-width="${big ? 1.6 : .7}"/>`;
    }
    if (nums) for (let h = 1; h <= 12; h++) { const a = h * 30 * DEG; s += `<text x="${(Math.sin(a) * nums).toFixed(1)}" y="${(-Math.cos(a) * nums + 4).toFixed(1)}" text-anchor="middle" font-size="${h % 3 ? 9 : 12}" fill="#5d7080" font-weight="${h % 3 ? 400 : 700}">${h}</text>`; }
    return s;
  }
  const chevron = (x, y, dx, dy, s, op) => { // ⌃ pointing along (dx, dy) in SVG coordinates
    const px = -dy, py = dx;
    return `<polyline points="${(x - dx * s + px * s).toFixed(1)},${(y - dy * s + py * s).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)} ${(x - dx * s - px * s).toFixed(1)},${(y - dy * s - py * s).toFixed(1)}" fill="none" stroke="#c0392b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="${op.toFixed(2)}"/>`;
  };
  let phase = 0;
  function drawClock() {
    const th = ex.tilt * 30 * DEG, mx = Math.sin(th), my = -Math.cos(th); // SVG: y down
    let s = ticks(96, 104, 86) + ballDeco(66);
    s += '<path d="M-40 -52 Q-18 0 -40 52 M40 -52 Q18 0 40 52" fill="none" stroke="#e2b8b0" stroke-width="2"/>';
    // spin axis (perpendicular to the push)
    s += `<line x1="${(my * 98).toFixed(1)}" y1="${(-mx * 98).toFixed(1)}" x2="${(-my * 98).toFixed(1)}" y2="${(mx * 98).toFixed(1)}" stroke="#41505a" stroke-width="2.2" stroke-dasharray="7 5"/>`;
    // surface motion: chevrons travel opposite to the push
    for (let k = -2; k <= 2; k++) {
      const u = ((k * 26 - phase * 26) % 130 + 195) % 130 - 65; // −65 … 65 along the push line, moving toward −m
      const op = Math.max(0, 1 - Math.abs(u) / 70);
      s += chevron(mx * u, my * u, -mx, -my, 9, op);
    }
    s += `<line x1="0" y1="0" x2="${(mx * 74).toFixed(1)}" y2="${(my * 74).toFixed(1)}" stroke="#d9480f" stroke-width="7" stroke-linecap="round"/>`;
    s += `<polygon points="${(mx * 96).toFixed(1)},${(my * 96).toFixed(1)} ${(mx * 72 - my * 12).toFixed(1)},${(my * 72 + mx * 12).toFixed(1)} ${(mx * 72 + my * 12).toFixed(1)},${(my * 72 - mx * 12).toFixed(1)}" fill="#d9480f"/>`;
    s += '<circle r="5" fill="#17201c"/>';
    svgClock.innerHTML = s;
  }
  function clockDesc() {
    const th = ex.tilt * 30, c = Math.cos(th * DEG), sn = Math.sin(th * DEG);
    const vert = c > 0.38 ? '後旋（往上推，球掉得少）' : c < -0.38 ? '前旋（往下推，球掉得多）' : '';
    const side = sn > 0.38 ? '往三壘側推（右投手的手臂側）' : sn < -0.38 ? '往一壘側推（右投手的手套側）' : '';
    const kind = [vert, side].filter(Boolean).join('＋') || '—';
    let eg = '';
    const t = ex.tilt;
    if (t >= 11.5 || t < 0.5) eg = '像四縫線速球的純後旋。';
    else if (t < 1.75) eg = '右投速球最常見（12:30–1:30）。';
    else if (t < 2.75) eg = '右投伸卡球、變速球常在 2:00 附近。';
    else if (t < 3.5) eg = '純側旋：只往三壘側跑。';
    else if (t < 5.5) eg = '少見：往下又往三壘側。';
    else if (t < 6.5) eg = '純前旋，像 12-6 曲球。';
    else if (t < 8.25) eg = '右投曲球常在 7:00–8:00。';
    else if (t < 9.5) eg = '右投滑球、橫掃球常在 8:30–9:30。';
    else eg = '影片中這位右投手的滑球、曲球多在 9:30–11:00：側旋帶一點後旋。';
    $('ex-clock-text').textContent = PL.clockText(ex.tilt);
    $('ex-clock-desc').innerHTML = `<b>${kind}</b><br>後旋成分 cos θ = ${c.toFixed(2)}，側旋成分 sin θ = ${sn.toFixed(2)}。${eg}`;
  }
  $('ex-clock-chips').innerHTML = [['12:00', '後旋'], ['1:00', '速球'], ['3:00', '側旋'], ['6:00', '前旋'], ['7:30', '曲球'], ['9:30', '滑球']]
    .map(([c, n]) => `<button type="button" data-c="${c}">${c}<small>${n}</small></button>`).join('');
  $('ex-clock-chips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTilt(PL.parseClock(b.dataset.c)); });
  function setTilt(t) { ex.tilt = ((t % 12) + 12) % 12; refresh(); }
  const fromPointer = (e) => {
    const r = svgClock.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    let a = Math.atan2(x, -y) / DEG; if (a < 0) a += 360;
    setTilt(Math.round(a / 7.5) / 4);
  };
  let drag = false;
  svgClock.addEventListener('pointerdown', (e) => { drag = true; svgClock.setPointerCapture(e.pointerId); fromPointer(e); });
  svgClock.addEventListener('pointermove', (e) => { if (drag) fromPointer(e); });
  ['pointerup', 'pointercancel'].forEach((t) => svgClock.addEventListener(t, () => { drag = false; }));
  svgClock.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setTilt(ex.tilt + .25);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setTilt(ex.tilt - .25);
    else return; e.preventDefault();
  });

  /* ---------- 2. gyro: top view + pitcher's view ---------- */
  const svgTop = $('ex-top'), svgFront = $('ex-front');
  function drawTop() {
    const ph = ex.gyro * DEG;
    let s = '<rect x="-110" y="-110" width="220" height="220" rx="16" fill="#f7f9f9"/>';
    s += '<line x1="-92" y1="0" x2="92" y2="0" stroke="#41505a" stroke-width="1.4"/><line x1="0" y1="92" x2="0" y2="-80" stroke="#3d79c8" stroke-width="2.4"/><polygon points="0,-94 -7,-80 7,-80" fill="#3d79c8"/>';
    s += '<text x="0" y="-98" text-anchor="middle" font-size="11" font-weight="700" fill="#3d79c8">本壘方向（前進）</text><text x="0" y="106" text-anchor="middle" font-size="10" fill="#5d7080">投手方向</text>';
    s += '<text x="-104" y="16" font-size="10" fill="#5d7080">一壘</text><text x="104" y="16" text-anchor="end" font-size="10" fill="#5d7080">三壘</text>';
    s += '<circle r="34" fill="#fbf8f1" stroke="#d6cdbb" stroke-width="2"/>';
    const ex1 = Math.cos(ph) * 86, ey1 = -Math.sin(ph) * 86;
    s += `<line x1="${(-ex1).toFixed(1)}" y1="${(-ey1).toFixed(1)}" x2="${ex1.toFixed(1)}" y2="${ey1.toFixed(1)}" stroke="#d9480f" stroke-width="5" stroke-linecap="round"/>`;
    const R = 52;
    if (ex.gyro > .5) s += `<path d="M${R} 0 A${R} ${R} 0 0 0 ${(Math.cos(ph) * R).toFixed(1)} ${(-Math.sin(ph) * R).toFixed(1)}" fill="none" stroke="#c4472f" stroke-width="2.2"/>`;
    const lx = Math.cos(ph / 2) * (R + 16), ly = -Math.sin(ph / 2) * (R + 16);
    s += `<text x="${(ex.gyro < 12 ? R + 22 : lx).toFixed(1)}" y="${(ex.gyro < 12 ? -10 : ly + 4).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="#c4472f">${f(ex.gyro)}°</text>`;
    s += '<text x="-104" y="-80" font-size="9.5" fill="#5d7080">俯視（以 12:00 為例）</text>';
    svgTop.innerHTML = s;
  }
  function drawFront() {
    const { a, m } = axisVec(), R = 70;
    let s = '<rect x="-110" y="-110" width="220" height="220" rx="16" fill="#f7f9f9"/>';
    s += `<circle r="${R}" fill="#fbf8f1" stroke="#d6cdbb" stroke-width="2"/>`;
    const P = (p, k) => [p[0] * k, -p[1] * k]; // to SVG
    // axis: back half (pointing away from the viewer, z < 0) first
    const tip = P(a, 96), flat = Math.abs(a[2]) < 0.06, back = a[2] < 0;
    if (!flat) s += `<line x1="0" y1="0" x2="${back ? tip[0].toFixed(1) : (-tip[0]).toFixed(1)}" y2="${back ? tip[1].toFixed(1) : (-tip[1]).toFixed(1)}" stroke="#41505a" stroke-width="2" stroke-dasharray="5 5" opacity=".55"/>`;
    // spin "equator" (great circle ⟂ axis) and moving dots: visible where z > 0
    const e1 = m, e2 = cross(a, e1);
    let pathF = '', pathB = '';
    for (let i = 0; i <= 96; i++) {
      const t = i / 96 * 2 * Math.PI, p = add(e1.map((x) => x * Math.cos(t)), e2, Math.sin(t)), q = P(p, R);
      const seg = `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
      if (p[2] >= 0) { pathF += seg; pathB += `M${q[0].toFixed(1)} ${q[1].toFixed(1)}`; } else { pathB += seg; pathF += `M${q[0].toFixed(1)} ${q[1].toFixed(1)}`; }
    }
    s += `<path d="${pathB}" fill="none" stroke="#e2b8b0" stroke-width="2" stroke-dasharray="3 4"/><path d="${pathF}" fill="none" stroke="#c0392b" stroke-width="3"/>`;
    for (let k = 0; k < 8; k++) {
      const t = k / 8 * 2 * Math.PI + phase * 0.9, p = add(e1.map((x) => x * Math.cos(t)), e2, Math.sin(t)), q = P(p, R);
      if (p[2] < -1e-6) continue;
      const v = cross(a, p), vv = [v[0], -v[1]], n = Math.hypot(vv[0], vv[1]);
      if (n > .12) s += chevron(q[0], q[1], vv[0] / n, vv[1] / n, 7, .95);
      else s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="4" fill="#c0392b"/>`;
    }
    // axis: front half
    s += flat ? `<line x1="${(-tip[0]).toFixed(1)}" y1="${(-tip[1]).toFixed(1)}" x2="${tip[0].toFixed(1)}" y2="${tip[1].toFixed(1)}" stroke="#41505a" stroke-width="3" stroke-linecap="round"/>`
      : `<line x1="0" y1="0" x2="${back ? (-tip[0]).toFixed(1) : tip[0].toFixed(1)}" y2="${back ? (-tip[1]).toFixed(1) : tip[1].toFixed(1)}" stroke="#41505a" stroke-width="3" stroke-linecap="round"/>`;
    s += '<circle r="5" fill="#41505a"/>';
    s += `<text x="0" y="104" text-anchor="middle" font-size="10" fill="#5d7080">投手背後看（${PL.clockText(ex.tilt)}、陀螺 ${f(ex.gyro)}°）</text>`;
    svgFront.innerHTML = s;
  }
  $('ex-gyro-chips').innerHTML = [[0, '純推球'], [26.5, '簡報卡特球'], [45, ''], [60, ''], [66.2, '影片曲球'], [90, '子彈旋轉']]
    .map(([g, n]) => `<button type="button" data-g="${g}">${g}°<small>${n || `效率 ${Math.round(Math.cos(g * DEG) * 100)}%`}</small></button>`).join('');
  $('ex-gyro-chips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { ex.gyro = Number(b.dataset.g); $('ex-gyro').value = ex.gyro; refresh(); } });
  $('ex-gyro').addEventListener('input', (e) => { ex.gyro = Number(e.target.value); refresh(); });
  $('ex-rpm').addEventListener('input', (e) => { const v = Number(e.target.value); if (v >= 0 && v <= 3500) { ex.rpm = v; refresh(); } });

  /* ---------- 3. efficiency curve ---------- */
  const cv = $('ex-cos');
  function drawCos() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const L = 44, Rr = 14, T = 16, B = 34, X = (g) => L + (w - L - Rr) * g / 90, Y = (e) => T + (h - T - B) * (1 - e);
    c.font = '11px sans-serif'; c.strokeStyle = '#e3e9ec'; c.fillStyle = '#7d8d96'; c.lineWidth = 1;
    for (let e = 0; e <= 1.001; e += .25) { c.beginPath(); c.moveTo(L, Y(e)); c.lineTo(w - Rr, Y(e)); c.stroke(); c.textAlign = 'right'; c.fillText(`${Math.round(e * 100)}%`, L - 6, Y(e) + 4); }
    for (let g = 0; g <= 90; g += 15) { c.beginPath(); c.moveTo(X(g), T); c.lineTo(X(g), h - B); c.stroke(); c.textAlign = 'center'; c.fillText(`${g}°`, X(g), h - B + 15); }
    c.fillStyle = '#5d7080'; c.fillText('陀螺角', (L + w - Rr) / 2, h - 4);
    c.strokeStyle = '#9fb0b8'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(0), Y(1)); c.lineTo(X(90), Y(0)); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#9fb0b8'; c.textAlign = 'left'; c.fillText('若是直線（錯誤想法）', X(52), Y(.35) + 22);
    c.strokeStyle = '#ef7a2c'; c.lineWidth = 3; c.beginPath();
    for (let g = 0; g <= 90; g += 1) { const y = Y(Math.cos(g * DEG)); g ? c.lineTo(X(g), y) : c.moveTo(X(g), y); }
    c.stroke();
    c.fillStyle = '#c4472f'; c.font = '600 12px sans-serif'; c.fillText('效率 = cos(陀螺角)', X(4), Y(.12));
    const e = Math.cos(ex.gyro * DEG);
    c.strokeStyle = '#c4472f'; c.lineWidth = 1.2; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(X(ex.gyro), h - B); c.lineTo(X(ex.gyro), Y(e)); c.lineTo(L, Y(e)); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#c4472f'; c.beginPath(); c.arc(X(ex.gyro), Y(e), 6, 0, 2 * Math.PI); c.fill();
    c.font = '700 12px sans-serif'; c.textAlign = ex.gyro > 60 ? 'right' : 'left';
    c.fillText(`${f(ex.gyro)}° → ${Math.round(e * 100)}%`, X(ex.gyro) + (ex.gyro > 60 ? -10 : 10), Y(e) - 8);
  }
  function bars() {
    const e = Math.cos(ex.gyro * DEG), g = Math.sin(ex.gyro * DEG);
    $('ex-bar-total').style.width = '100%'; $('ex-bar-active').style.width = `${e * 100}%`; $('ex-bar-gyro').style.width = `${g * 100}%`;
    $('ex-total').textContent = `${Math.round(ex.rpm)} rpm`;
    $('ex-active').textContent = `${Math.round(ex.rpm * e)} rpm`;
    $('ex-gyrorpm').textContent = `${Math.round(ex.rpm * g)} rpm`;
    $('ex-eff-text').innerHTML = `陀螺角 <b>${f(ex.gyro)}°</b> → 效率 cos ${f(ex.gyro)}° = <b>${Math.round(e * 100)}%</b>：${Math.round(ex.rpm)} rpm 裡只有 <b>${Math.round(ex.rpm * e)} rpm</b> 在推球，其餘 ${Math.round(ex.rpm * g)} rpm 繞著前進方向「空轉」。<br><small>（三者關係：總轉速² = 啟用中² + 陀螺旋轉²）</small>`;
    $('ex-gyro-text').textContent = `${f(ex.gyro)}°`;
  }

  /* ---------- 4. PitchLab fields table ---------- */
  const rows = [['kph', '球速', 'in', '直接量'], ['vb', '垂直', 'out', '球路結果'], ['hb', '水平', 'out', '球路結果'], ['clock', '轉軸', 'in', '直接量'],
    ['rpm', '轉速', 'in', '直接量'], ['active', '啟用中', 'auto', '轉速 × 效率'], ['eff', '效率', 'auto', 'cos(陀螺角)'], ['gyro', '陀螺', 'in', '直接量'], ['stuff', 'Stuff+', 'other', '平台模型評分']];
  $('ex-table').innerHTML = rows.map(([k, n, kind, how]) => `<div class="ex-tr ${kind}"><span class="ex-name">${PL.term(k, n)}</span><span class="ex-how">${how}</span><span class="ex-what">${PL.GLOSS[k].b}</span></div>`).join('');

  $('ex-apply').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('spin-apply', { detail: { tilt: ex.tilt, gyro: ex.gyro, rpm: ex.rpm } }));
    document.getElementById('lab').scrollIntoView({ behavior: 'smooth' });
  });
  document.querySelectorAll('#axis-gyro .term-wrap[data-k]').forEach((el) => { el.innerHTML = PL.term(el.dataset.k); });

  function refresh() { clockDesc(); drawTop(); drawCos(); bars(); drawClock(); drawFront(); }
  let visible = true, last = performance.now();
  if (window.IntersectionObserver) new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); }).observe($('axis-gyro'));
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (!visible) return;
    phase += dt * 0.9;
    drawClock(); drawFront();
  }
  window.addEventListener('resize', drawCos);
  refresh();
  requestAnimationFrame(loop);
  window.__explain = { ex, refresh };
})();
