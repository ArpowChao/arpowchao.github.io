/* DIODE 二極體單行道實驗室 — 不用空乏區，用「電洞、電子被推近／拉開」說明二極體單向導電 */
(() => {
'use strict';

/* ---------- 畫布與虛擬座標（1200 × 700） ---------- */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const VW = 1200, VH = 700;
let S = 1, OX = 0, OY = 0, DPR = 1;
const FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",system-ui,sans-serif';
const C = {
  ink: '#1d2b3a', muted: '#5b6b7c', hole: '#ec2a1f', elec: '#12a0f5', accent: '#b2372d',
  wire: '#222', grid: '#d9dee5', blockFill: '#a6d3fb', blockEdge: '#8a8f96',
  cur: '#e5231b', blue: '#1f3fd1', good: '#1f6fd1', bad: '#c8231b',
};

function resize() {
  const r = cv.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * DPR));
  cv.height = Math.max(1, Math.round(r.height * DPR));
  S = Math.min(r.width / VW, r.height / VH);
  OX = (r.width - VW * S) / 2;
  OY = (r.height - VH * S) / 2;
  dirtyC = true;
}
window.addEventListener('resize', resize);

function begin() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(S * DPR, 0, 0, S * DPR, OX * DPR, OY * DPR);
}
function font(px, w = '') { ctx.font = `${w} ${px}px ${FONT}`; }
function text(t, x, y, px, color = C.ink, align = 'left', w = '', base = 'middle') {
  font(px, w); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(t, x, y);
}
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function line(x1, y1, x2, y2, color = C.wire, w = 3, dash = null) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function poly(pts, color = C.wire, w = 3) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
}
function arrow(x1, y1, x2, y2, color, w = 6, head = 22) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * head * 0.6, y2 - Math.sin(a) * head * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
  ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
  ctx.closePath(); ctx.fill(); ctx.restore();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* ---------- 二極體模型（用課堂數據擬合） ----------
   順向：I = Is (e^{V/nVt} − 1)，課堂數據 0.5 V → 0.09 mA、0.6 V → 1.02 mA
   逆向：漏電流約 1.5 μA，超過 40 V 崩潰 */
const IS = 4.9e-7, NVT = 0.0412;           // mA, V
const VBR = 40;
function iDiode(v) {                        // 回傳 mA
  if (v >= 0) return IS * (Math.exp(Math.min(v, 1.3) / NVT) - 1);
  let i = -0.0015 * (1 - Math.exp(v / 0.03));
  if (v < -VBR) i -= 0.02 * (Math.exp(Math.min(-v - VBR, 12) / 0.6) - 1);
  return i;
}
function ledCurrent(v, von) {               // 含小內阻 (3 Ω) 避免無限制指數暴衝，回傳 mA
  if (v <= 0) return iDiode(v);
  const rInt = 3.0;
  let lo = 0, hi = v;
  for (let k = 0; k < 40; k++) {
    const m = 0.5 * (lo + hi);
    const iEst = 2 * (Math.exp(Math.min(m - von, 12) / 0.08) - Math.exp(-von / 0.08));
    if (m + (iEst / 1000) * rInt > v) hi = m;
    else lo = m;
  }
  const vj = 0.5 * (lo + hi);
  return Math.max(0, 2 * (Math.exp(Math.min(vj - von, 12) / 0.08) - Math.exp(-von / 0.08)));
}
function fmtI(mA) {
  const a = Math.abs(mA);
  if (a >= 1000) return (mA / 1000).toFixed(2) + ' A';
  if (a >= 100) return mA.toFixed(0) + ' mA';
  if (a >= 1) return mA.toFixed(2) + ' mA';
  if (a >= 0.01) return mA.toFixed(3) + ' mA';
  if (a >= 0.0005) return (mA * 1000).toFixed(1) + ' μA';
  return '≈ 0';
}
function fmtR(ohm) {
  if (!isFinite(ohm) || ohm > 5e8) return '非常大';
  if (ohm >= 1e6) return (ohm / 1e6).toFixed(ohm >= 1e7 ? 0 : 1) + ' MΩ';
  if (ohm >= 1e3) return (ohm / 1e3).toFixed(ohm >= 1e4 ? 0 : 1) + ' kΩ';
  return ohm.toFixed(0) + ' Ω';
}
const meterMA = (mA) => (Math.abs(mA) < 0.005 ? '0.00' : mA.toFixed(2)) + ' mA';

/* ---------- 共用：流動的電流箭頭 ---------- */
function pathInfo(pts) {
  const seg = []; let tot = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], L = Math.hypot(x2 - x1, y2 - y1);
    seg.push({ x1, y1, x2, y2, L, s: tot }); tot += L;
  }
  return { seg, tot };
}
function pathAt(pi, u) {
  for (const s of pi.seg) if (u <= s.s + s.L) {
    const t = (u - s.s) / s.L;
    return { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t, a: Math.atan2(s.y2 - s.y1, s.x2 - s.x1) };
  }
  const s = pi.seg[pi.seg.length - 1]; return { x: s.x2, y: s.y2, a: Math.atan2(s.y2 - s.y1, s.x2 - s.x1) };
}
function inBoxes(x, y, boxes) { return boxes.some(b => x > b[0] && x < b[2] && y > b[1] && y < b[3]); }
// kind: 'chev' 紅色箭頭（電流方向）、'e' 藍色電子
function drawFlow(pi, phase, gap, kind, skip = [], alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha = alpha;
  let u = ((phase % gap) + gap) % gap;
  for (; u < pi.tot; u += gap) {
    const p = pathAt(pi, u);
    if (inBoxes(p.x, p.y, skip)) continue;
    if (kind === 'chev') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.strokeStyle = C.cur; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(4, 0); ctx.lineTo(-6, 9); ctx.stroke(); ctx.restore();
    } else {
      ctx.fillStyle = C.elec; ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, 7); ctx.fill();
      text('−', p.x, p.y - 1, 12, '#fff', 'center', '700');
    }
  }
  ctx.restore();
}
const flowSpeed = (mA) => (Math.abs(mA) < 0.002 ? 0 : 230 * (1 - Math.exp(-Math.abs(mA) / 2.5)) + 6);

/* ---------- 共用：電路元件 ---------- */
function battery(x, y, plusLeft, label, dim = false) {
  ctx.save(); if (dim) ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 22, y - 36, 44, 72);
  const lx = plusLeft ? x - 9 : x + 9, sx = plusLeft ? x + 9 : x - 9;
  line(lx, y - 32, lx, y + 32, C.wire, 4);
  line(sx, y - 16, sx, y + 16, C.wire, 9);
  text('+', plusLeft ? x - 30 : x + 30, y - 46, 30, C.hole, 'center', '700');
  text('−', plusLeft ? x + 30 : x - 30, y - 46, 32, C.elec, 'center', '700');
  if (label) text(label, x, y + 58, 22, C.ink, 'center', '700');
  ctx.restore();
}
function meter(x, y, letter) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = C.wire; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.fill(); ctx.stroke();
  text(letter, x, y + 1, 24, C.ink, 'center', '700');
}
function readout(x, y, w, str, color = C.ink, px = 24) {
  ctx.fillStyle = '#10221c'; rrect(x, y - 20, w, 40, 8); ctx.fill();
  text(str, x + w - 10, y + 1, px, color === C.ink ? '#7dffb0' : color, 'right', '700');
}
function resistor(cx, y) {
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 54, y - 20, 108, 40);
  ctx.strokeStyle = C.wire; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 56, y);
  const n = 6, w = 90;
  for (let i = 0; i <= n; i++) ctx.lineTo(cx - w / 2 + (w / n) * i, y + (i === 0 || i === n ? 0 : (i % 2 ? -14 : 14)));
  ctx.lineTo(cx + 56, y); ctx.stroke();
}
function diodeSym(cx, y, pointRight = true, glow = null) {
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 34, y - 30, 68, 60);
  const d = pointRight ? 1 : -1;
  ctx.fillStyle = glow || C.wire; ctx.strokeStyle = C.wire; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 20 * d, y - 22); ctx.lineTo(cx - 20 * d, y + 22); ctx.lineTo(cx + 18 * d, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  line(cx + 18 * d, y - 22, cx + 18 * d, y + 22, C.wire, 5);
}

/* ---------- 共用：圖表 ---------- */
function chart(b, xr, yr, xt, yt, xl, yl, title, fx = (v) => v.toFixed(1), fy = (v) => v.toFixed(1)) {
  ctx.fillStyle = '#fff'; rrect(b.x - 70, b.y - 60, b.w + 95, b.h + 120, 6); ctx.fill();
  const mx = (v) => b.x + ((v - xr[0]) / (xr[1] - xr[0])) * b.w;
  const my = (v) => b.y + b.h - ((v - yr[0]) / (yr[1] - yr[0])) * b.h;
  for (let v = xt[0]; v <= xr[1] + 1e-9; v += xt[1]) { line(mx(v), b.y, mx(v), b.y + b.h, C.grid, 1.5); text(fx(v), mx(v), b.y + b.h + 18, 17, C.muted, 'center'); }
  for (let v = yt[0]; v <= yr[1] + 1e-9; v += yt[1]) { line(b.x, my(v), b.x + b.w, my(v), C.grid, 1.5); text(fy(v), b.x - 10, my(v), 17, C.muted, 'right'); }
  line(b.x, b.y + b.h, b.x + b.w, b.y + b.h, '#444', 2);
  text(title, b.x - 55, b.y - 35, 22, '#666', 'left');
  text(xl, b.x + b.w / 2, b.y + b.h + 45, 18, C.ink, 'center');
  ctx.save(); ctx.translate(b.x - 52, b.y + b.h / 2); ctx.rotate(-Math.PI / 2); text(yl, 0, 0, 18, C.ink, 'center'); ctx.restore();
  return { mx, my };
}
function dot(x, y, r, color, ring = false) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
  if (ring) { ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
}
function infoBox(x, y, rows, w = 250) {
  const h = rows.length * 38 + 20;
  ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.strokeStyle = '#c9d6e3'; ctx.lineWidth = 2;
  rrect(x, y, w, h, 10); ctx.fill(); ctx.stroke();
  rows.forEach(([k, v, col], i) => {
    text(k, x + 14, y + 29 + i * 38, 20, C.muted);
    text(v, x + w - 14, y + 29 + i * 38, 24, col || C.ink, 'right', '700');
  });
}

/* ---------- 迴路電路（場景①②） ---------- */
const LOOP = { L: 70, R: 500, T: 190, B: 560, bx: 285 };
const loopPath = pathInfo([[LOOP.bx - 22, LOOP.B], [LOOP.L, LOOP.B], [LOOP.L, LOOP.T], [LOOP.R, LOOP.T], [LOOP.R, LOOP.B], [LOOP.bx + 22, LOOP.B]]);
function drawLoop(state, comp) {
  const { L, R, T, B, bx } = LOOP, cx = (L + R) / 2;
  poly([[bx, B], [L, B], [L, T], [R, T], [R, B], [bx, B]]);
  // 電壓計（並聯在元件兩端）
  poly([[cx - 80, T], [cx - 80, T - 70], [cx - 24, T - 70]], C.wire, 2.5);
  poly([[cx + 80, T], [cx + 80, T - 70], [cx + 24, T - 70]], C.wire, 2.5);
  dot(cx - 80, T, 6, C.wire); dot(cx + 80, T, 6, C.wire);
  drawFlow(loopPath, state.phase, 46, 'chev', [[cx - 90, T - 30, cx + 90, T + 30], [R - 30, 350, R + 30, 410], [bx - 30, B - 40, bx + 30, B + 40]]);
  if (comp === 'R') resistor(cx, T); else diodeSym(cx, T, true);
  meter(cx, T - 70, 'V');
  readout(cx + 36, T - 118, 150, state.V.toFixed(2) + ' V');
  ctx.fillStyle = '#fff'; ctx.fillRect(R - 28, 350, 56, 60);
  meter(R, 380, 'A');
  readout(R - 200, 380, 160, meterMA(state.I));
  battery(bx, B, true, '電源');
  text(comp === 'R' ? '電阻 R' : '二極體', cx, T + 48, 22, C.ink, 'center', '700');
  if (comp === 'D') text('P → N（順向）', cx, T + 76, 17, C.muted, 'center');
}

/* =====================================================================
   場景① 電阻 V–I
   ===================================================================== */
const sR = { V: 2, R: 330, I: 0, phase: 0, pts: {}, auto: null };
const R_COLORS = { 220: '#e5322d', 330: '#2f7de1', 470: '#20a05a', 1000: '#9b4bd1' };
function sceneR(dt) {
  sR.I = (sR.V / sR.R) * 1000;
  sR.phase += flowSpeed(sR.I) * dt;
  if (sR.auto) {
    sR.auto.t += dt;
    if (sR.auto.t > 0.35) {
      sR.auto.t = 0; sR.auto.k++;
      const v = sR.auto.k * 0.5;
      if (v > 4.001) sR.auto = null; else { setVal('r_v', v); recR(); }
    }
  }
  begin();
  drawLoop(sR, 'R');
  text('R = ' + sR.R + ' Ω', (LOOP.L + LOOP.R) / 2, LOOP.T + 80, 20, C.muted, 'center');
  const b = { x: 660, y: 90, w: 500, h: 480 };
  const g = chart(b, [0, 4], [0, 20], [0, 0.5], [0, 4], '電阻兩端電壓 (V)', '電流 (mA)', '縱軸：電流(mA)，橫軸：電阻兩端電壓(V)', v => v.toFixed(1), v => v.toFixed(0));
  ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
  for (const R in sR.pts) {
    const pts = sR.pts[R]; if (!pts.length) continue;
    if (pts.length >= 2) line(g.mx(0), g.my(0), g.mx(4), g.my(4000 / R), R_COLORS[R], 2.5, [6, 6]);
    pts.forEach(([v, i]) => dot(g.mx(v), g.my(i), 8, R_COLORS[R]));
  }
  line(g.mx(sR.V), g.my(0), g.mx(sR.V), g.my(sR.I), '#999', 1.5, [4, 4]);
  line(g.mx(0), g.my(sR.I), g.mx(sR.V), g.my(sR.I), '#999', 1.5, [4, 4]);
  dot(g.mx(sR.V), g.my(sR.I), 11, R_COLORS[sR.R], true);
  ctx.restore();
  // 圖例
  let ly = b.y + 10;
  for (const R in sR.pts) if (sR.pts[R].length) {
    dot(b.x + 22, ly + 12, 8, R_COLORS[R]); text(R + ' Ω　斜率 = ' + (1000 / R).toFixed(1) + ' mA/V', b.x + 38, ly + 12, 18, C.ink); ly += 30;
  }
}
function recR() {
  const arr = (sR.pts[sR.R] = sR.pts[sR.R] || []);
  const I = (sR.V / sR.R) * 1000;
  if (!arr.some(p => Math.abs(p[0] - sR.V) < 1e-6)) arr.push([sR.V, I]);
}

/* =====================================================================
   場景② 二極體 V–I
   ===================================================================== */
const CLASS_DATA = [[0.2, 0], [0.4, 0], [0.5, 0.09], [0.54, 0.25], [0.56, 0.44], [0.58, 0.61], [0.59, 0.8], [0.6, 1.02], [0.61, 1.2], [0.61, 1.41]];
const D_SWEEP = [0, 0.2, 0.4, 0.5, 0.54, 0.57, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7];
const sD = { V: 0.3, I: 0, phase: 0, pts: [], cmp: false, auto: null };
function recD() {
  if (!sD.pts.some(p => Math.abs(p[0] - sD.V) < 1e-6)) sD.pts.push([sD.V, +iDiode(sD.V).toFixed(3)]);
}
function sceneD(dt) {
  if (sD.auto) {
    sD.auto.t += dt;
    if (sD.auto.t > 0.32) {
      sD.auto.t = 0; sD.auto.k++;
      if (sD.auto.k >= D_SWEEP.length) sD.auto = null;
      else { setVal('d_v', D_SWEEP[sD.auto.k]); recD(); }
    }
  }
  sD.I = iDiode(sD.V);
  sD.phase += flowSpeed(sD.I) * dt;
  begin();
  drawLoop(sD, 'D');
  const b = { x: 660, y: 90, w: 500, h: 480 };
  // 縱軸隨最大電流自動放大（0.63 V 以上電流超過 2 mA）
  const maxI = Math.max(sD.I, ...sD.pts.map(p => p[1]), 0);
  const yMax = maxI <= 2 ? 2 : Math.ceil(maxI * 2) / 2, yStep = yMax <= 3 ? 0.5 : (yMax <= 8 ? 1 : 2);
  const g = chart(b, [0, 0.7], [0, yMax], [0, 0.1], [0, yStep], '二極體兩端電壓 (V)', '電流 (mA)', '縱軸：電流(mA)，橫軸：二極體兩端電壓(V)', v => v.toFixed(1), v => v.toFixed(1));
  ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y - 2, b.w, b.h + 4); ctx.clip();
  if (sD.cmp) {
    line(g.mx(0), g.my(0), g.mx(0.7), g.my(0.7 / 0.33), '#888', 2.5, [8, 6]);
    text('電阻（330 Ω）：直線', g.mx(0.36), g.my(0.72), 18, '#777', 'left');
  }
  sD.pts.forEach(([v, i]) => dot(g.mx(v), g.my(i), 8, '#3b7ff0'));
  line(g.mx(sD.V), g.my(0), g.mx(sD.V), g.my(sD.I), '#999', 1.5, [4, 4]);
  dot(g.mx(sD.V), g.my(sD.I), 11, C.accent, true);
  ctx.restore();
  const R = sD.I > 1e-9 ? sD.V / (sD.I / 1000) : Infinity;
  infoBox(b.x + 14, b.y + 12, [['電壓', sD.V.toFixed(2) + ' V'], ['電流', fmtI(sD.I)], ['電阻 = V／I', fmtR(R), sD.I > 0.3 ? C.good : C.bad]], 270);
}

/* =====================================================================
   場景③ 工作曲線
   ===================================================================== */
const sC = { s: 0.75 };
let dirtyC = true;
const cV = (s) => (s < 0 ? s * 45 : s * 0.8);
function sceneC() {
  const V = cV(sC.s), I = iDiode(V);
  begin();
  const b = { x: 80, y: 70, w: 1080, h: 570 };
  ctx.fillStyle = '#fff'; rrect(b.x - 50, b.y - 50, b.w + 80, b.h + 85, 8); ctx.fill();
  const xz = b.x + 0.6 * b.w, yz = b.y + 0.7 * b.h;
  const mx = (v) => (v < 0 ? xz + (v / 45) * (xz - b.x) : xz + (v / 0.8) * (b.x + b.w - xz));
  const my = (mA) => (mA >= 0 ? yz - (mA / 20) * (yz - b.y) : yz + ((-mA * 1000) / 5) * (b.y + b.h - yz));
  // 區域底色
  ctx.fillStyle = 'rgba(200,35,27,0.08)'; ctx.fillRect(b.x, b.y, mx(-VBR) - b.x, b.h);
  ctx.fillStyle = 'rgba(31,111,209,0.08)'; ctx.fillRect(mx(0.6), b.y, b.x + b.w - mx(0.6), b.h);
  // 格線
  for (let v = -40; v < 0; v += 10) { line(mx(v), b.y, mx(v), b.y + b.h, C.grid, 1.2); text(String(v), mx(v), yz + 18, 17, C.muted, 'center'); }
  for (let v = 0.1; v <= 0.8; v += 0.1) { line(mx(v), b.y, mx(v), b.y + b.h, C.grid, 1.2); if ([0.3, 0.5, 0.7].some(t => Math.abs(t - v) < 1e-6)) text(v.toFixed(1), mx(v), yz + 18, 17, C.muted, 'center'); }
  for (let m = 2; m <= 20; m += 2) { line(b.x, my(m), b.x + b.w, my(m), C.grid, 1.2); text(String(m), xz - 8, my(m), 16, C.muted, 'right'); }
  for (let u = 1; u <= 5; u++) { line(b.x, my(-u / 1000), b.x + b.w, my(-u / 1000), C.grid, 1.2); text('−' + u + ' μA', xz - 8, my(-u / 1000), 16, C.muted, 'right'); }
  line(b.x, yz, b.x + b.w, yz, '#111', 2.5); line(xz, b.y, xz, b.y + b.h, '#111', 2.5);
  line(mx(-VBR), b.y, mx(-VBR), b.y + b.h, C.bad, 2, [5, 5]);
  line(mx(0.7), b.y, mx(0.7), b.y + b.h, C.blue, 2, [5, 5]);
  text('電流', xz + 12, b.y + 18, 24, C.ink, 'left', '700');
  text('電壓 V (V)', b.x + b.w - 4, yz + 44, 22, C.ink, 'right', '700');
  text('順向偏壓', b.x + b.w - 20, yz + 100, 28, C.ink, 'right');
  text('逆向偏壓', b.x + 30, yz - 60, 28, C.ink, 'left');
  text('導電', mx(0.7) + 18, b.y + 130, 32, C.blue, 'left', '700');
  text('不導電', mx(-20), b.y + 130, 32, C.bad, 'center', '700');
  text('崩潰壞掉', b.x + 6, b.y + b.h - 40, 26, '#8b1a14', 'left', '700');
  text('※ 左右、上下刻度不同：逆向用 V／μA，順向用 0.1 V／mA（可直接點擊或拖曳圖表調電壓）', b.x + 6, b.y + b.h + 22, 16, C.muted);
  // 曲線
  ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
  ctx.strokeStyle = C.accent; ctx.lineWidth = 4; ctx.beginPath();
  for (let k = 0; k <= 600; k++) { const v = -45 + (45 * k) / 600; const p = [mx(v), my(iDiode(v))]; k ? ctx.lineTo(...p) : ctx.moveTo(...p); }
  for (let k = 0; k <= 400; k++) { const v = (0.8 * k) / 400; ctx.lineTo(mx(v), my(iDiode(v))); }
  ctx.stroke();
  const rawPy = my(I);
  const px = mx(V), py = clamp(rawPy, b.y + 12, b.y + b.h - 12);
  line(px, yz, px, py, '#666', 1.5, [4, 4]);
  dot(px, py, 13, '#111'); dot(px, py, 8, '#ffd23f');
  if (rawPy < b.y + 12) text('↑ 超過 20 mA', Math.min(b.x + b.w - 135, px + 18), py + 2, 16, C.blue, 'left', '700');
  else if (rawPy > b.y + b.h - 12) text('↓ 崩潰電流暴衝', Math.max(b.x + 12, px + 18), py - 2, 16, '#8b1a14', 'left', '700');
  ctx.restore();
  const R = Math.abs(I) > 1e-12 ? V / (I / 1000) : Infinity;
  let st, col;
  if (V < -VBR) { st = '崩潰！會燒壞'; col = '#8b1a14'; } else if (V <= 0.45) { st = '不導電'; col = C.bad; } else if (V < 0.6) { st = '開始導電'; col = '#c47a00'; } else { st = '導電'; col = C.blue; }
  infoBox(b.x + 20, b.y + 10, [['電壓', V.toFixed(V < -1 ? 1 : 2) + ' V'], ['電流', fmtI(I)], ['電阻 = V／I', fmtR(Math.abs(R))], ['狀態', st, col]], 280);
  dirtyC = false;
}

/* =====================================================================
   PN 粒子動畫引擎（場景④⑤）
   ===================================================================== */
const G = { P0: 230, J: 590, N1: 950, Y0: 150, Y1: 390, r: 15, yc: 270, wl: 70, wr: 1110, wb: 600, bx: 590, ay: 505 };
const wirePathFwd = pathInfo([[G.bx - 24, G.wb], [G.wl, G.wb], [G.wl, G.yc], [G.P0, G.yc], [G.N1, G.yc], [G.wr, G.yc], [G.wr, G.wb], [G.bx + 24, G.wb]]);
const wirePathRev = pathInfo([...[[G.bx - 24, G.wb], [G.wl, G.wb], [G.wl, G.yc], [G.P0, G.yc], [G.N1, G.yc], [G.wr, G.yc], [G.wr, G.wb], [G.bx + 24, G.wb]]].reverse());
const WIRE_SKIP = [[G.P0 - 2, G.Y0 - 10, G.N1 + 2, G.Y1 + 10], [G.wr - 30, G.ay - 30, G.wr + 30, G.ay + 30], [G.bx - 30, G.wb - 40, G.bx + 30, G.wb + 40]];
const LED_COLORS = { red: ['#ff3b30', 1.8], yellow: ['#ffc400', 2.0], green: ['#2fd05c', 2.2], blue: ['#2f6bff', 2.8] };

// 固定不動的離子：P 型是負離子、N 型是正離子，數量和電洞／電子一樣多 → 原本電中性
const LAT = (() => {
  const cols = 4, rows = 4, cw = (G.J - G.P0) / cols, ch = (G.Y1 - G.Y0) / rows, P = [], N = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const y = G.Y0 + ch * (i + 0.5);
    P.push([G.P0 + cw * (j + 0.5), y]); N.push([G.J + cw * (j + 0.5), y]);
  }
  return { P, N, cw, ch };
})();
const CONTACT_N = 4;                        // 接觸時越過交界結合的對數（＝交界旁那一排離子）
function makePN() {
  const o = { holes: [], elecs: [], flashes: [], photons: [], acc: 0, avAcc: 0, phase: 0, t: 0, glow: 0, paused: false,
    w: 0, gap: 0, done: 0, ionsP: LAT.P, ionsN: LAT.N };
  o.reset = () => {
    o.holes = []; o.elecs = []; o.flashes = []; o.photons = []; o.done = 0; o.acc = 0; o.avAcc = 0;
    const dx = LAT.cw * 0.24, dy = LAT.ch * 0.26;
    LAT.P.forEach(([x, y]) => o.holes.push(mk('h', x - dx, y - dy)));
    LAT.N.forEach(([x, y]) => o.elecs.push(mk('e', x + dx, y - dy)));
  };
  o.cancelCross = () => {
    for (const arr of [o.holes, o.elecs]) for (const p of arr) { p.st = 'free'; p.partner = null; p.dead = false; }
    o.acc = 0;
  };
  // 接上電池時，電池從兩端補足電洞、電子
  o.topUp = () => {
    while (o.holes.length < LAT.P.length) { const p = mk('h', G.P0 + G.r + 4, G.Y0 + 30 + Math.random() * (G.Y1 - G.Y0 - 60)); p.a = 0; o.holes.push(p); }
    while (o.elecs.length < LAT.N.length) { const p = mk('e', G.N1 - G.r - 4, G.Y0 + 30 + Math.random() * (G.Y1 - G.Y0 - 60)); p.a = 0; o.elecs.push(p); }
  };
  function mk(k, x, y) { return { k, x, y, vx: 0, vy: 0, st: 'free', a: 1, partner: null, dead: false, av: false }; }
  o.mk = mk;
  o.reset();
  return o;
}

function stepPN(o, dt, cfg) {
  o.t += dt;
  const { r } = G, gam = 2.2;
  const sig = cfg.breakdown ? 380 : 140;
  let vd = 0;                               // 正值：往交界推；負值：往兩端拉
  if (cfg.mode === 'fwd') vd = 40 + 90 * clamp(cfg.push, 0, 1.2);
  else if (cfg.mode === 'rev') vd = -(35 + 55 * clamp(cfg.V / 20, 0, 1));
  o.w += ((cfg.w || 0) - o.w) * Math.min(1, dt * 3);
  o.gap += ((cfg.gap || 0) - o.gap) * Math.min(1, dt * 4);
  const all = [o.holes, o.elecs];
  for (const arr of all) for (const p of arr) {
    if (p.dead) continue;
    if (p.a < 1) p.a = Math.min(1, p.a + dt * 3);
    if (p.st === 'cross') {
      const q = p.partner;
      if (!q || q.dead) { p.st = 'free'; p.partner = null; continue; }
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      const sp = 260;
      if (d < r * 1.1) { recombine(o, p, q, cfg); continue; }
      p.x += (dx / d) * sp * dt; p.y += (dy / d) * sp * dt;
      continue;
    }
    const dir = p.k === 'h' ? 1 : -1;     // 電洞往 +x 是往交界
    const drift = p.st === 'wait' ? 0 : (p.av ? -220 : vd) * dir;
    p.vx += (drift * gam - gam * p.vx) * dt + randn() * sig * Math.sqrt(dt);
    p.vy += (-gam * p.vy) * dt + randn() * sig * Math.sqrt(dt);
    if (p.st === 'wait') { p.vx *= 0.9; p.vy *= 0.9; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const xmin = p.k === 'h' ? G.P0 + r + 3 : (cfg.breakdown ? G.J - 10 : G.J + o.w + r + 3);
    const xmax = p.k === 'h' ? (cfg.breakdown ? G.J + 10 : G.J - o.w - r - 3) : G.N1 - r - 3;
    if (p.av && ((p.k === 'h' && p.x <= G.P0 + r + 5) || (p.k === 'e' && p.x >= G.N1 - r - 5))) {
      p.dead = true; continue;
    }
    if (p.x < xmin) { p.x = xmin; p.vx = Math.abs(p.vx); }
    if (p.x > xmax) { p.x = xmax; p.vx = -Math.abs(p.vx); }
    if (p.y < G.Y0 + r + 3) { p.y = G.Y0 + r + 3; p.vy = Math.abs(p.vy); }
    if (p.y > G.Y1 - r - 3) { p.y = G.Y1 - r - 3; p.vy = -Math.abs(p.vy); }
  }
  o.holes = o.holes.filter(p => !p.dead);
  o.elecs = o.elecs.filter(p => !p.dead);
  // 同種粒子互相推開（排列整齊、不重疊）
  for (const arr of [o.holes, o.elecs]) {
    const free = arr.filter(p => p.st !== 'cross');
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, m = 2 * r + 5;
      if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = ((m - d) / d) * 0.25; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }
  }
  // 越過交界、相遇／雪崩崩潰
  if (cfg.mode === 'fwd') {
    o.acc += cfg.rate * dt;
    let guard = 0;
    while (o.acc >= 1 && guard++ < 5) { o.acc -= 1; startCross(o); }
    o.acc = Math.min(o.acc, 2);
    o.avAcc = 0;
  } else if (cfg.mode === 'rev' && cfg.breakdown) {
    o.avAcc += 10 * dt;
    while (o.avAcc >= 1) {
      o.avAcc -= 1;
      if (o.holes.length < 26 && o.elecs.length < 26) {
        const y0 = G.Y0 + 30 + Math.random() * (G.Y1 - G.Y0 - 60);
        const h = o.mk('h', G.J - 12, y0); h.vx = -220; h.av = true;
        const e = o.mk('e', G.J + 12, y0); e.vx = 220; e.av = true;
        o.holes.push(h); o.elecs.push(e);
        o.flashes.push({ x: G.J, y: y0, t: 0 });
      }
    }
  } else if (cfg.mode === 'contact') {
    const pending = o.holes.filter(p => p.st === 'cross').length + o.elecs.filter(p => p.st === 'cross').length;
    if (o.gap < 3 && o.done + pending < CONTACT_N) { o.acc += 1.5 * dt; if (o.acc >= 1) { o.acc -= 1; startCross(o); } }
    o.avAcc = 0;
  } else { o.acc = 0; o.avAcc = 0; }
  // 特效
  o.flashes = o.flashes.filter(f => (f.t += dt) < 0.5);
  o.photons = o.photons.filter(ph => { ph.t += dt; ph.x += ph.vx * dt; ph.y += ph.vy * dt; return ph.t < 1.6; });
  const targetGlow = cfg.led && cfg.mode === 'fwd' ? clamp(cfg.rate / 11, 0, 1) : 0;
  o.glow += (targetGlow - o.glow) * Math.min(1, dt * 4);
  // 外部導線中的流動
  o.phase += cfg.flow * dt;
}
function startCross(o) {
  const busy = o.holes.filter(p => p.st !== 'free').length + o.elecs.filter(p => p.st !== 'free').length;
  if (busy > 10) return;
  const hFree = o.holes.filter(p => p.st === 'free'), eFree = o.elecs.filter(p => p.st === 'free');
  if (!hFree.length || !eFree.length) return;
  const h = hFree.reduce((a, b) => (b.x > a.x ? b : a));
  const e = eFree.reduce((a, b) => (b.x < a.x ? b : a));
  if (Math.random() < 0.5) { h.st = 'cross'; h.partner = e; e.st = 'wait'; }
  else { e.st = 'cross'; e.partner = h; h.st = 'wait'; }
}
function recombine(o, p, q, cfg) {
  const x = (p.x + q.x) / 2, y = (p.y + q.y) / 2;
  o.flashes.push({ x, y, t: 0 });
  if (cfg.led) for (let k = 0; k < 2; k++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    o.photons.push({ x, y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, t: 0, col: cfg.led });
  }
  p.dead = true; q.dead = true;
  o.holes = o.holes.filter(z => z !== p && z !== q);
  o.elecs = o.elecs.filter(z => z !== p && z !== q);
  o.done++;
  if (cfg.spawn === false) return;
  // 電池從兩端補進新的電洞和電子
  const nh = o.mk('h', G.P0 + G.r + 4, G.Y0 + 30 + Math.random() * (G.Y1 - G.Y0 - 60)); nh.vx = 80; nh.a = 0;
  const ne = o.mk('e', G.N1 - G.r - 4, G.Y0 + 30 + Math.random() * (G.Y1 - G.Y0 - 60)); ne.vx = -80; ne.a = 0;
  o.holes.push(nh); o.elecs.push(ne);
}

function drawPN(o, cfg, opt) {
  const { P0, J, N1, Y0, Y1, r } = G;
  // 導線
  const connected = cfg.mode === 'fwd' || cfg.mode === 'rev';
  const gP = -o.gap, gN = o.gap;
  if (connected) {
  poly([[G.P0, G.yc], [G.wl, G.yc], [G.wl, G.wb], [G.bx - 22, G.wb]]);
  poly([[G.N1, G.yc], [G.wr, G.yc], [G.wr, G.wb], [G.bx + 22, G.wb]]);
    const pi = cfg.flowDir >= 0 ? wirePathFwd : wirePathRev;
    if (opt.cur) drawFlow(pi, o.phase, 48, 'chev', WIRE_SKIP, cfg.flow > 0 ? 1 : 0);
    if (opt.wire) {
      const pe = cfg.flowDir >= 0 ? wirePathRev : wirePathFwd;
      drawFlow(pe, o.phase + 24, 48, 'e', WIRE_SKIP, cfg.flow > 0 ? 1 : 0);
    }
  // 電池
  battery(G.bx, G.wb, cfg.mode === 'fwd', cfg.V.toFixed(cfg.V >= 10 ? 1 : 2) + ' V');
  // 電流計
  ctx.fillStyle = '#fff'; ctx.fillRect(G.wr - 28, G.ay - 30, 56, 60);
  meter(G.wr, G.ay, 'A');
  readout(G.wr - 205, G.ay, 165, fmtI(cfg.I).replace('≈ 0', '0.00 mA'), C.ink, 22);
  // 兩端外加電壓文字
    const leftPlus = cfg.mode === 'fwd';
    text('外加', G.wl + 14, G.yc - 26, 20, C.ink); text(leftPlus ? '正' : '負', G.wl + 56, G.yc - 26, 22, leftPlus ? C.hole : C.elec, 'left', '700'); text('電壓', G.wl + 80, G.yc - 26, 20, C.ink);
    text('外加', G.N1 + 8, G.yc - 26, 20, C.ink); text(leftPlus ? '負' : '正', G.N1 + 50, G.yc - 26, 22, leftPlus ? C.elec : C.hole, 'left', '700'); text('電壓', G.N1 + 74, G.yc - 26, 20, C.ink);
  }
  // 兩塊半導體
  if (cfg.breakdown) { ctx.save(); ctx.shadowColor = 'rgba(255,60,0,0.9)'; ctx.shadowBlur = 40 + 20 * Math.sin(o.t * 20); }
  for (const [x0, x1, g] of [[P0, J, gP], [J, N1, gN]]) {
    ctx.fillStyle = cfg.breakdown ? '#f7b9a3' : C.blockFill; ctx.strokeStyle = C.blockEdge; ctx.lineWidth = 5; ctx.setLineDash([3, 3]);
    rrect(x0 + 2 + g, Y0, x1 - x0 - 4, Y1 - Y0, 26); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  }
  if (cfg.breakdown) ctx.restore();
  // LED 發光
  if (o.glow > 0.01 && cfg.led) {
    const g = ctx.createRadialGradient(J, (Y0 + Y1) / 2, 10, J, (Y0 + Y1) / 2, 330);
    g.addColorStop(0, hexA(cfg.led, 0.75 * o.glow)); g.addColorStop(1, hexA(cfg.led, 0));
    ctx.fillStyle = g; ctx.fillRect(P0 - 60, Y0 - 120, N1 - P0 + 120, Y1 - Y0 + 200);
  }
  text('P型半導體（較多', P0 + 40 + gP, Y0 - 30, 24, C.ink, 'left', '700');
  font(24, '700'); let w1 = ctx.measureText('P型半導體（較多').width; text('電洞', P0 + 40 + w1 + gP, Y0 - 30, 24, C.hole, 'left', '700');
  text('）', P0 + 40 + w1 + 48 + gP, Y0 - 30, 24, C.ink, 'left', '700');
  text('N型半導體（較多', J + 30 + gN, Y0 - 30, 24, C.ink, 'left', '700');
  text('電子', J + 30 + w1 + gN, Y0 - 30, 24, C.elec, 'left', '700');
  text('）', J + 30 + w1 + 48 + gN, Y0 - 30, 24, C.ink, 'left', '700');
  // 固定離子（方塊）
  if (opt.ions) {
    for (const [list, kind] of [[o.ionsP, 'P'], [o.ionsN, 'N']]) for (const [x0, y] of list) {
      const x = x0 + (kind === 'P' ? gP : gN);
      const hot = o.w > 8 && Math.abs(x0 - J) < o.w + 2, sz = hot ? 12 : 10;
      ctx.fillStyle = hot ? (kind === 'P' ? '#1456b8' : '#c0261d') : 'rgba(70,85,100,0.32)';
      ctx.fillRect(x - sz, y - sz, 2 * sz, 2 * sz);
      text(kind === 'P' ? '−' : '+', x, y + 1, hot ? 22 : 18, '#fff', 'center', '700');
    }
  }
  // 粒子
  for (const arr of [o.holes, o.elecs]) for (const p of arr) {
    ctx.globalAlpha = p.a;
    const px = p.x + (p.k === 'h' ? gP : gN);
    ctx.fillStyle = p.k === 'h' ? C.hole : C.elec;
    ctx.beginPath(); ctx.arc(px, p.y, r, 0, 7); ctx.fill();
    if (opt.sign) text(p.k === 'h' ? '+' : '−', px, p.y + 1, 20, '#fff', 'center', '700');
    ctx.globalAlpha = 1;
  }
  // 相遇閃光
  for (const f of o.flashes) {
    const k = f.t / 0.5;
    ctx.strokeStyle = `rgba(255,190,0,${1 - k})`; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(f.x, f.y, 8 + 34 * k, 0, 7); ctx.stroke();
    ctx.fillStyle = `rgba(255,255,220,${0.9 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, 14 * (1 - k) + 4, 0, 7); ctx.fill();
  }
  // 光子
  for (const ph of o.photons) {
    const a = Math.atan2(ph.vy, ph.vx), al = clamp(1.6 - ph.t, 0, 1);
    ctx.save(); ctx.translate(ph.x, ph.y); ctx.rotate(a); ctx.globalAlpha = al;
    ctx.strokeStyle = ph.col; ctx.lineWidth = 4; ctx.beginPath();
    for (let s = -46; s <= 0; s += 2) { const yy = Math.sin(s * 0.42 + ph.t * 30) * 7; s === -46 ? ctx.moveTo(s, yy) : ctx.lineTo(s, yy); }
    ctx.stroke(); ctx.fillStyle = ph.col; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-2, -7); ctx.lineTo(-2, 7); ctx.fill(); ctx.restore();
  }
  // 逆向：中間打叉
  if (cfg.mode === 'rev' && !cfg.breakdown) {
    const k = clamp(o.tRev / 1.2, 0, 1);
    text('✕', J, (Y0 + Y1) / 2, 72, `rgba(20,20,20,${0.85 * k})`, 'center', '700');
  }
  if (cfg.breakdown) {
    ctx.strokeStyle = '#fff36b'; ctx.lineWidth = 5; ctx.shadowColor = '#ffae00'; ctx.shadowBlur = 18;
    for (let n = 0; n < 3; n++) {
      ctx.beginPath(); let x = J - 120 + Math.random() * 40, y = Y0 + 20 + Math.random() * (Y1 - Y0 - 40); ctx.moveTo(x, y);
      while (x < J + 120) { x += 18 + Math.random() * 20; y += (Math.random() - 0.5) * 50; ctx.lineTo(x, clamp(y, Y0 + 8, Y1 - 8)); }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  // 電性（沒接電池時）
  if (!connected) {
    const netP = o.holes.length - LAT.P.length, netN = LAT.N.length - o.elecs.length;
    const cxP = (P0 + J) / 2 + gP, cxN = (J + N1) / 2 + gN, yy = Y1 + 40;
    const lab = (cx, net, word, col) => {
      if (net === 0) { text('電性：電中性', cx, yy, 26, C.ink, 'center', '700'); return; }
      if (!opt.charge) { text('電性：帶 ＿＿ 電', cx, yy, 26, C.ink, 'center', '700'); return; }
      font(26, '700'); const w0 = ctx.measureText('電性：帶').width, w2 = ctx.measureText('負').width, w3 = ctx.measureText('電').width, x0 = cx - (w0 + w2 + w3) / 2;
      text('電性：帶', x0, yy, 26, C.ink, 'left', '700'); text(word, x0 + w0, yy, 26, col, 'left', '700'); text('電', x0 + w0 + w2, yy, 26, C.ink, 'left', '700');
    };
    lab(cxP, netP, '負', C.elec); lab(cxN, netN, '正', C.hole);
    text(`電洞 ${o.holes.length} 個（＋）　負離子 ${LAT.P.length} 個（－）`, cxP, yy + 34, 18, C.muted, 'center');
    text(`電子 ${o.elecs.length} 個（－）　正離子 ${LAT.N.length} 個（＋）`, cxN, yy + 34, 18, C.muted, 'center');
    if (cfg.mode === 'contact' && o.gap < 3 && o.done < CONTACT_N) {
      arrow(J - 150, yy + 92, J + 60, yy + 92, C.hole, 7, 24); text('電洞往 N 型跑', J - 160, yy + 92, 22, C.hole, 'right', '700');
      arrow(J + 150, yy + 132, J - 60, yy + 132, C.elec, 7, 24); text('電子往 P 型跑', J + 160, yy + 132, 22, C.elec, 'left', '700');
    } else if (cfg.mode === 'contact' && o.done >= CONTACT_N && opt.charge) {
      text('交界的 －、＋ 離子把後面的電洞、電子推回去 → 停住了', J, yy + 100, 22, C.ink, 'center', '700');
    }
  }
  // 電流方向大箭頭（塊體下方）
  if (opt.cur && cfg.mode === 'fwd' && cfg.flow > 20) {
    ctx.save(); ctx.globalAlpha = clamp(cfg.flow / 120, 0.3, 1);
    arrow(P0 + 20, Y1 + 50, N1 - 120, Y1 + 50, C.cur, 9, 30);
    text('電流方向，導通方向！', N1 - 100, Y1 + 50, 22, C.ink, 'left', '700');
    ctx.restore();
  }
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function banner(t, col, sub) {
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; rrect(16, 14, 560, sub ? 76 : 52, 12); ctx.fill();
  text(t, 32, 40, 30, col, 'left', '700');
  if (sub) text(sub, 32, 74, 19, C.muted);
}

/* ---------- 場景④ PN 動畫 ---------- */
const sP = { pn: makePN(), mode: 'apart', Vf: 0.7, Vr: 5, sp: 1, opt: { cur: true, wire: false, sign: true, ions: true, charge: true } };
sP.pn.tRev = 0;
function pnCfg() {
  const V = sP.mode === 'fwd' ? sP.Vf : sP.mode === 'rev' ? sP.Vr : 0;
  let I = 0, rate = 0, flowDir = 1, breakdown = false;
  if (sP.mode === 'fwd') { I = iDiode(V); rate = 3.5 * (1 - Math.exp(-I / 1.2)); }
  if (sP.mode === 'rev') { I = iDiode(-V); breakdown = V > VBR; flowDir = -1; }
  let w = 0, gap = 0;
  if (sP.mode === 'apart') gap = 45;
  else if (sP.mode === 'contact') w = 55 * Math.min(sP.pn.done, CONTACT_N) / CONTACT_N;
  else if (sP.mode === 'fwd') w = 55 * (1 - clamp((V - 0.2) / 0.45, 0, 1));
  else w = Math.min(55 + 5 * V, 190);
  const conn = sP.mode === 'fwd' || sP.mode === 'rev';
  return { mode: sP.mode, V, I, rate, push: V / 0.7, breakdown, flowDir, flow: conn ? flowSpeed(I) : 0, led: null, w, gap, spawn: conn };
}
function scenePN(dt) {
  const cfg = pnCfg(), o = sP.pn;
  o.tRev = cfg.mode === 'rev' ? o.tRev + dt * sP.sp : 0;
  if (!o.paused) { const n = Math.ceil((dt * sP.sp) / (1 / 60)); for (let i = 0; i < n; i++) stepPN(o, (dt * sP.sp) / n, cfg); }
  begin();
  drawPN(o, cfg, sP.opt);
  if (o.done !== o.lastDone) { o.lastDone = o.done; pnExplain(); }
  if (cfg.mode === 'apart') banner('接觸前：P 型、N 型各自電中性', C.ink, '電洞(＋)和負離子(－)一樣多；電子(－)和正離子(＋)一樣多');
  else if (cfg.mode === 'contact') {
    if (o.done < CONTACT_N) banner('剛接觸：電洞、電子跑向對面相遇', '#c47a00', '相遇後結合、一起消失');
    else if (sP.opt.charge) banner('接觸後：P 型帶負電、N 型帶正電', C.accent, '交界留下沒被抵消的離子 → 把後面的電洞、電子推回去');
    else banner('接觸後：P 型、N 型各帶什麼電？', C.accent, '數一數：電洞、電子少了幾個？離子還是一樣多');
  } else if (cfg.mode === 'fwd') {
    if (cfg.V < 0.45) banner('順向，但電壓太小', '#c47a00', '交界的 －、＋ 電荷把它們推回去 → 電流很小');
    else if (cfg.V < 0.6) banner('開始導通…', '#c47a00', '有一些電洞、電子越過交界相遇');
    else banner('順向偏壓：阻礙小、電阻小', C.good, '電洞、電子越過交界相遇，電池不斷補充 → 電流一直流');
  } else if (cfg.breakdown) banner('崩潰！電流暴增，會燒壞', '#8b1a14', '逆向電壓超過約 40 V');
  else banner('逆向偏壓：阻礙大、電阻大', C.bad, '電洞、電子被拉向兩端，中間空了 → 電流幾乎 0');
  const R = Math.abs(cfg.I) > 1e-12 ? cfg.V / (Math.abs(cfg.I) / 1000) : Infinity;
  if (cfg.mode === 'apart' || cfg.mode === 'contact') {
    const netP = o.holes.length - LAT.P.length, netN = LAT.N.length - o.elecs.length, show = sP.opt.charge || (netP === 0);
    infoBox(960, 14, [['P 型淨電荷', show ? (netP ? '−' + (-netP) : '0') : '?', netP && show ? C.elec : C.ink], ['N 型淨電荷', show ? (netN ? '+' + netN : '0') : '?', netN && show ? C.hole : C.ink], ['電流', '0']], 226);
  } else infoBox(960, 14, [['電壓', (cfg.mode === 'rev' ? '−' : '') + cfg.V.toFixed(cfg.V >= 10 ? 1 : 2) + ' V'], ['電流', fmtI(cfg.I)], ['電阻', fmtR(R)]], 226);
  if (sP.pn.paused) text('⏸ 暫停中', 600, 680, 22, C.muted, 'center', '700');
}
function pnExplain() {
  const c = pnCfg(); let t;
  const done = sP.pn.done >= CONTACT_N;
  if (c.mode === 'apart') t = 'P 型裡有可以移動的<b style="color:#ec2a1f">電洞（＋）</b>，也有同樣多個<b>固定不動的負離子</b>（灰色方塊 －），正負抵消 → <b>電中性</b>。<br>N 型裡是可以移動的<b style="color:#12a0f5">電子（－）</b>和同樣多的<b>正離子</b>（＋）→ 也是<b>電中性</b>。<br>按「接觸後」把兩塊接在一起。';
  else if (c.mode === 'contact' && !done) t = 'P、N 一接觸：交界附近的電洞跑到 N 型、電子跑到 P 型，兩個相遇就<b>結合消失</b>（黃色閃光）。<br>注意灰色的離子固定不動，不會跟著跑。';
  else if (c.mode === 'contact' && !sP.opt.charge) t = '數一數：P 型少了幾個電洞？N 型少了幾個電子？固定的離子有沒有變少？<br>想一想：現在 P 型、N 型各帶什麼電？';
  else if (c.mode === 'contact') t = 'P 型少了電洞，交界旁留下沒被抵消的<b style="color:#1456b8">負離子</b> → <b>P 型帶負電</b>；N 型少了電子，留下<b style="color:#c0261d">正離子</b> → <b>N 型帶正電</b>。<br>這些電荷會把後面的電洞、電子<b>推回去</b>，所以只過去幾個就停了。<br><span style="color:#5b6b7c">（整顆二極體加起來還是電中性，多出來的電荷集中在交界兩側。）</span>';
  else if (c.mode === 'fwd') {
    if (c.V < 0.45) t = '接觸後交界旁 P 型帶負電、N 型帶正電，會把電洞、電子<b>推回去</b>。電池電壓太小推不過去，電流非常小；要大到約 0.6 V 以上才推得過。';
    else t = '電池<b style="color:#ec2a1f">正極</b>把電洞往右推、<b style="color:#12a0f5">負極</b>把電子往左推，蓋過了交界電荷的推回力，它們越過交界、相遇結合（黃色閃光）。電池又從兩端不斷補充新的電洞和電子，所以電流一直流。<br><b>電壓越大 → 相遇越多 → 電流越大 → 電阻越小。</b>';
  } else if (c.breakdown) t = '逆向電壓太大（超過約 40 V）：二極體「崩潰」，電流突然暴增，會發熱壞掉。實際使用不能超過額定的逆向電壓。';
  else t = '電池<b style="color:#12a0f5">負極</b>把電洞拉到左邊、<b style="color:#ec2a1f">正極</b>把電子拉到右邊，交界旁露出更多離子（P 型更負、N 型更正），中間空了，沒有可以移動的電荷越過交界，電流幾乎是 0。<br><b>阻礙大 → 電阻大，電流過不去。</b>';
  document.getElementById('pn_explain').innerHTML = t;
}

/* ---------- 場景⑤ LED ---------- */
const sL = { pn: makePN(), mode: 'fwd', V: 1.8, col: 'red', sp: 1 };
sL.pn.tRev = 0;
function ledCfg() {
  const [col, von] = LED_COLORS[sL.col];
  let I = 0, rate = 0, flowDir = 1;
  if (sL.mode === 'fwd') { I = ledCurrent(sL.V, von); rate = 12 * (1 - Math.exp(-I / 3)); }
  else { I = iDiode(-sL.V); flowDir = -1; }
  const w = sL.mode === 'fwd' ? 55 * (1 - clamp((sL.V - (von - 0.6)) / 0.5, 0, 1)) : Math.min(55 + 5 * sL.V, 190);
  return { mode: sL.mode, V: sL.V, I, rate, push: sL.V / von, breakdown: false, flowDir, flow: flowSpeed(I), led: col, von, w, gap: 0, spawn: true };
}
function sceneLED(dt) {
  const cfg = ledCfg(), o = sL.pn;
  o.tRev = cfg.mode === 'rev' ? o.tRev + dt * sL.sp : 0;
  if (!o.paused) {
    const n = Math.ceil((dt * sL.sp) / (1 / 60)); for (let i = 0; i < n; i++) stepPN(o, (dt * sL.sp) / n, cfg);
  }
  begin();
  drawPN(o, cfg, { cur: true, wire: false, sign: true, ions: true });
  // LED 小圖示（往左微移使光暈不被右邊界裁切）
  const lx = 1135, ly = 190;
  if (o.glow > 0.02) { const g = ctx.createRadialGradient(lx, ly, 5, lx, ly, 64); g.addColorStop(0, hexA(cfg.led, 0.9 * o.glow)); g.addColorStop(1, hexA(cfg.led, 0)); ctx.fillStyle = g; ctx.fillRect(lx - 65, ly - 65, 130, 130); }
  ctx.fillStyle = o.glow > 0.05 ? cfg.led : hexA(cfg.led, 0.35); ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lx - 22, ly + 22); ctx.lineTo(lx - 22, ly - 4); ctx.arc(lx, ly - 4, 22, Math.PI, 0); ctx.lineTo(lx + 22, ly + 22); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(lx - 28, ly + 20, 56, 8);
  line(lx - 8, ly + 28, lx - 8, ly + 62, '#888', 3); line(lx + 8, ly + 28, lx + 8, ly + 52, '#888', 3);
  const on = cfg.mode === 'fwd' && cfg.rate > 3;
  if (cfg.mode === 'fwd' && cfg.I > 40) banner('電流太大，LED 會燒壞！', '#8b1a14', '實際使用要串聯一個電阻來限制電流');
  else if (cfg.mode === 'rev') banner('接反了：不亮', C.bad, '電洞、電子被拉開，不會相遇');
  else if (on) banner('相遇 → 放出光 → LED 亮！', C.good, '電壓越大，每秒相遇越多，越亮');
  else banner('電壓不夠：還不亮', '#c47a00', '這顆 LED 約要 ' + cfg.von.toFixed(1) + ' V 才會亮');
  infoBox(960, 14, [['電壓', (cfg.mode === 'rev' ? '−' : '') + cfg.V.toFixed(2) + ' V'], ['電流', fmtI(cfg.I)]], 226);
  if (o.paused) text('⏸ 暫停中', 600, 680, 22, C.muted, 'center', '700');
}
function ledExplain() {
  const c = ledCfg(); let t;
  if (c.mode === 'rev') t = 'LED 接反了：電洞、電子被拉向兩端，不會在交界相遇，所以<b>不會發光</b>，電流也幾乎是 0。';
  else if (c.rate <= 3) t = '電壓還不到這顆 LED 的發光電壓（約 ' + c.von.toFixed(1) + ' V），電洞和電子很少相遇，所以不亮。<br><span style="color:#5b6b7c">（藍光光子能量 E=hf 比紅光高，所以需要的啟動電壓也比較高。）</span>';
  else if (c.I > 40) t = '電壓再加上去，電流會暴增（LED 的電流跟二極體一樣，超過發光電壓後急速上升），LED 會過熱燒壞。所以實際電路中 LED 一定要<b>串聯電阻</b>（可到場景⑥實測）。';
  else t = '電洞和電子在 P、N 交界<b>相遇結合</b>時，把多出來的能量變成<b>光</b>放出來（彎彎的箭頭）。<br>電壓越大 → 每秒相遇越多 → 越亮。不同材料放出不同顏色的光（藍光光子能量 E=hf 最高，所需電壓也最高）。';
  document.getElementById('led_explain').innerHTML = t;
}

/* =====================================================================
   場景⑥ 電路中的 0.7 V
   ===================================================================== */
const K_TYPES = {
  si: { name: '二極體', note: '二極體（約 0.7 V）', fn: iDiode, col: null },
  red: { name: '紅光 LED', note: '紅光 LED（約 1.8 V）', fn: v => ledCurrent(v, 1.8), col: '#ff3b30' },
  blue: { name: '藍光 LED', note: '藍光 LED（約 2.8 V）', fn: v => ledCurrent(v, 2.8), col: '#2f6bff' }
};
const sK = { Vs: 5, dir: 'fwd', R: 470, type: 'si', phase: 0 };
const KL = { L: 150, R: 1050, T: 300, B: 590, bx: 600, dx: 410, rx: 790, ay: 445 };
const kPathF = pathInfo([[KL.bx - 22, KL.B], [KL.L, KL.B], [KL.L, KL.T], [KL.R, KL.T], [KL.R, KL.B], [KL.bx + 22, KL.B]]);
function solveK() {
  const Vs = sK.Vs, R = sK.R, fn = K_TYPES[sK.type].fn;
  if (sK.dir === 'fwd') {
    let lo = 0, hi = Vs;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; (m + (fn(m) / 1000) * R > Vs) ? (hi = m) : (lo = m); }
    const Vd = (lo + hi) / 2, I = fn(Vd); return { Vd, I, Vr: Math.max(0, Vs - Vd) };
  }
  const I = -fn(-Vs); return { Vd: Vs - (I / 1000) * R, I, Vr: (I / 1000) * R };
}
function sceneK(dt) {
  const s = solveK(), kt = K_TYPES[sK.type];
  sK.phase += flowSpeed(s.I) * dt;
  begin();
  const { L, R, T, B, bx, dx, rx } = KL;
  poly([[bx, B], [L, B], [L, T], [R, T], [R, B], [bx, B]]);
  for (const [cx, y] of [[dx, T], [rx, T]]) {
    poly([[cx - 70, T], [cx - 70, T - 80], [cx - 24, T - 80]], C.wire, 2.5);
    poly([[cx + 70, T], [cx + 70, T - 80], [cx + 24, T - 80]], C.wire, 2.5);
    dot(cx - 70, y, 6, C.wire); dot(cx + 70, y, 6, C.wire);
  }
  drawFlow(kPathF, sK.phase, 50, 'chev', [[dx - 80, T - 35, dx + 80, T + 35], [rx - 80, T - 35, rx + 80, T + 35], [R - 30, KL.ay - 30, R + 30, KL.ay + 30], [bx - 30, B - 40, bx + 30, B + 40]], s.I > 0.005 ? 1 : 0);
  const ledLit = kt.col && sK.dir === 'fwd' && s.I > 0.5;
  if (ledLit) {
    const gg = ctx.createRadialGradient(dx, T, 4, dx, T, 64);
    gg.addColorStop(0, hexA(kt.col, clamp(s.I / 18, 0.25, 0.85)));
    gg.addColorStop(1, hexA(kt.col, 0));
    ctx.fillStyle = gg; ctx.fillRect(dx - 65, T - 65, 130, 130);
  }
  diodeSym(dx, T, sK.dir === 'fwd', ledLit ? kt.col : null);
  resistor(rx, T);
  meter(dx, T - 80, 'V'); meter(rx, T - 80, 'V');
  readout(dx - 85, T - 135, 170, s.Vd.toFixed(2) + ' V', '#ffd23f', 28);
  readout(rx - 85, T - 135, 170, Math.abs(s.Vr) < 0.005 ? '0.00 V' : s.Vr.toFixed(2) + ' V', '#7dffb0', 28);
  text(kt.name, dx, T + 50, 24, C.ink, 'center', '700');
  text(sK.dir === 'fwd' ? '順接 P→N' : '反接 N←P', dx, T + 80, 18, C.muted, 'center');
  text('電阻 ' + sK.R + ' Ω', rx, T + 50, 24, C.ink, 'center', '700');
  ctx.fillStyle = '#fff'; ctx.fillRect(R - 28, KL.ay - 30, 56, 60); meter(R, KL.ay, 'A'); readout(R - 210, KL.ay, 170, meterMA(s.I), '#7dffb0', 24);
  battery(bx, B, true, '電源 ' + sK.Vs.toFixed(1) + ' V');
  // 等式
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; rrect(150, 18, 900, 104, 14); ctx.fill();
  if (sK.dir === 'fwd' && s.I > 0.5) {
    text(`${sK.Vs.toFixed(1)} V  −  ${s.Vd.toFixed(2)} V  =  ${s.Vr.toFixed(2)} V`, 600, 58, 42, C.ink, 'center', '700');
    text('電源', 400, 100, 19, C.muted, 'center'); text(kt.note, 600, 100, 19, '#b58900', 'center'); text('電阻', 800, 100, 19, C.muted, 'center');
    if (sK.type !== 'si' && s.I > 35) text('⚠ 電流過大，LED 可能燒壞！', 900, 58, 17, '#c8231b', 'left', '700');
  } else if (sK.dir === 'fwd') {
    text(`電源太小：${kt.name}還沒導通，電流很小`, 600, 70, 32, '#c47a00', 'center', '700');
  } else {
    text(`反接：${sK.Vs.toFixed(1)} V 幾乎全部落在${kt.name}上，電流 ≈ 0`, 600, 70, 32, C.bad, 'center', '700');
  }
}

/* =====================================================================
   介面與切換
   ===================================================================== */
const scenes = [sceneR, sceneD, sceneC, scenePN, sceneLED, sceneK];
let cur = 0;
const $ = (id) => document.getElementById(id);
function setVal(id, v) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input')); }
function show(i) {
  cur = clamp(i, 0, scenes.length - 1);
  sR.auto = null; sD.auto = null;
  dirtyC = true;
  document.querySelectorAll('#tabs button').forEach((b, k) => b.classList.toggle('on', k === cur));
  document.querySelectorAll('.ctrl').forEach(s => s.classList.toggle('on', +s.dataset.for === cur));
  $('pName').textContent = NAMES[cur];
  try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) { /* 本機檔案 */ }
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => show(+b.dataset.scene)));
document.querySelectorAll('.reveal').forEach(b => {
  b.dataset.q = b.textContent;
  b.addEventListener('click', () => { const on = b.classList.toggle('shown'); b.textContent = on ? b.dataset.ans : b.dataset.q; });
});
/* 上課全螢幕：畫面填滿整個螢幕，控制面板收成可開關的浮動小視窗 */
const NAMES = ['① 電阻 V–I', '② 二極體 V–I', '③ 工作曲線', '④ PN 動畫', '⑤ 發光二極體', '⑥ 電路中的 0.7 V'];
function setPresent(on) {
  document.body.classList.toggle('present', on);
  document.querySelector('.panel').classList.toggle('hide', on);
  $('pPanel').classList.remove('on');
  requestAnimationFrame(resize);
}
function toggleFS() {
  if (document.body.classList.contains('present')) {
    if (document.fullscreenElement) document.exitFullscreen?.(); else setPresent(false);
  } else {
    setPresent(true);
    const p = document.documentElement.requestFullscreen?.();
    if (p && p.catch) p.catch(() => {});
  }
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setPresent(false); else resize(); });
function togglePanel() {
  if (!document.body.classList.contains('present')) return;
  const hid = document.querySelector('.panel').classList.toggle('hide');
  $('pPanel').classList.toggle('on', !hid);
}
$('fsBtn').addEventListener('click', toggleFS);
$('pExit').addEventListener('click', toggleFS);
$('pPanel').addEventListener('click', togglePanel);
$('pPrev').addEventListener('click', () => show(cur - 1));
$('pNext').addEventListener('click', () => show(cur + 1));
let idleT = 0;
document.addEventListener('mousemove', () => { document.body.classList.add('active'); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.remove('active'), 2000); });
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowRight' && e.target.type !== 'range') show(cur + 1);
  else if (e.key === 'ArrowLeft' && e.target.type !== 'range') show(cur - 1);
  else if (e.key === 'f' || e.key === 'F') toggleFS();
  else if (e.key === 'c' || e.key === 'C') togglePanel();
  else if (e.key === 'Escape' && !document.fullscreenElement) setPresent(false);
  else if (e.key >= '1' && e.key <= '6') show(+e.key - 1);
  else if (e.key === ' ' && cur === 3) { e.preventDefault(); $('pn_pause').click(); }
  else if (e.key === ' ' && cur === 4) { e.preventDefault(); $('led_pause').click(); }
});

// ①
$('r_v').addEventListener('input', e => { sR.V = +e.target.value; $('r_vLbl').textContent = sR.V.toFixed(2) + ' V'; });
$('r_R').addEventListener('change', e => { sR.R = +e.target.value; });
$('r_rec').addEventListener('click', recR);
$('r_auto').addEventListener('click', () => { sR.auto = { t: 0, k: 0 }; setVal('r_v', 0); recR(); });
$('r_clr').addEventListener('click', () => { sR.pts = {}; sR.auto = null; });
// ②
$('d_v').addEventListener('input', e => { sD.V = +e.target.value; $('d_vLbl').textContent = sD.V.toFixed(2) + ' V'; });
$('d_rec').addEventListener('click', recD);
$('d_auto').addEventListener('click', () => { sD.pts = []; sD.auto = { t: 0, k: 0 }; setVal('d_v', D_SWEEP[0]); recD(); });
$('d_class').addEventListener('click', () => { sD.pts = CLASS_DATA.map(p => p.slice()); sD.auto = null; });
$('d_clr').addEventListener('click', () => { sD.pts = []; sD.auto = null; });
$('d_cmp').addEventListener('change', e => { sD.cmp = e.target.checked; });
// ③（滑桿 + 直接點擊／拖曳圖表取點）
$('c_s').addEventListener('input', e => { sC.s = +e.target.value; const V = cV(sC.s); $('c_vLbl').textContent = V.toFixed(V < -1 ? 1 : 2) + ' V'; dirtyC = true; });
document.querySelectorAll('[data-cv]').forEach(b => b.addEventListener('click', () => setVal('c_s', b.dataset.cv)));
let cDrag = false;
function scrubC(e) {
  const r = cv.getBoundingClientRect(), vx = (e.clientX - r.left - OX) / S, vy = (e.clientY - r.top - OY) / S;
  const bx = 80, by = 70, bw = 1080, bh = 570, xz = bx + 0.6 * bw;
  if (vx < bx - 20 || vx > bx + bw + 20 || vy < by - 20 || vy > by + bh + 20) return false;
  const s = vx < xz ? clamp((vx - xz) / (xz - bx), -1, 0) : clamp((vx - xz) / (bx + bw - xz), 0, 1);
  setVal('c_s', s.toFixed(3));
  return true;
}
cv.addEventListener('pointerdown', e => { if (cur === 2 && scrubC(e)) { cDrag = true; cv.setPointerCapture?.(e.pointerId); } });
cv.addEventListener('pointermove', e => { if (cur === 2 && cDrag) scrubC(e); });
['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { cDrag = false; }));
// ④
function pnMode(m) {
  const prev = sP.mode, o = sP.pn;
  sP.mode = m;
  o.cancelCross();
  if (m === 'apart') o.reset();
  else if (m === 'contact') { if (prev !== 'apart') o.topUp(); o.done = 0; o.acc = 0; }
  else o.topUp();
  document.querySelectorAll('#pn_mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  const sl = $('pn_v');
  if (m === 'rev') { sl.disabled = false; sl.min = 0; sl.max = 50; sl.step = 0.5; sl.value = sP.Vr; }
  else if (m === 'fwd') { sl.disabled = false; sl.min = 0; sl.max = 0.8; sl.step = 0.01; sl.value = sP.Vf; }
  else sl.disabled = true;
  updPnLbl(); pnExplain();
}
function updPnLbl() { $('pn_vLbl').textContent = sP.mode === 'rev' ? sP.Vr.toFixed(1) + ' V' : sP.mode === 'fwd' ? sP.Vf.toFixed(2) + ' V' : '—'; }
document.querySelectorAll('#pn_mode button').forEach(b => b.addEventListener('click', () => pnMode(b.dataset.m)));
$('pn_v').addEventListener('input', e => { if (sP.mode === 'rev') sP.Vr = +e.target.value; else sP.Vf = +e.target.value; updPnLbl(); pnExplain(); });
$('pn_sp').addEventListener('input', e => { sP.sp = +e.target.value; $('pn_spLbl').textContent = sP.sp.toFixed(1) + '×'; });
$('pn_cur').addEventListener('change', e => { sP.opt.cur = e.target.checked; });
$('pn_wire').addEventListener('change', e => { sP.opt.wire = e.target.checked; });
$('pn_sign').addEventListener('change', e => { sP.opt.sign = e.target.checked; });
$('pn_ions').addEventListener('change', e => { sP.opt.ions = e.target.checked; });
$('pn_charge').addEventListener('change', e => { sP.opt.charge = e.target.checked; pnExplain(); });
$('pn_pause').addEventListener('click', () => { sP.pn.paused = !sP.pn.paused; $('pn_pause').textContent = sP.pn.paused ? '繼續' : '暫停'; });
$('pn_reset').addEventListener('click', () => sP.pn.reset());
// ⑤
function ledMode(m) {
  sL.mode = m;
  sL.pn.cancelCross();
  document.querySelectorAll('#led_mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  ledExplain();
}
document.querySelectorAll('#led_mode button').forEach(b => b.addEventListener('click', () => ledMode(b.dataset.m)));
$('led_col').addEventListener('change', e => { sL.col = e.target.value; setVal('led_v', LED_COLORS[sL.col][1]); });
$('led_v').addEventListener('input', e => { sL.V = +e.target.value; $('led_vLbl').textContent = sL.V.toFixed(2) + ' V'; ledExplain(); });
$('led_sp').addEventListener('input', e => { sL.sp = +e.target.value; $('led_spLbl').textContent = sL.sp.toFixed(1) + '×'; });
$('led_pause').addEventListener('click', () => { sL.pn.paused = !sL.pn.paused; $('led_pause').textContent = sL.pn.paused ? '繼續' : '暫停'; });
// ⑥
$('k_v').addEventListener('input', e => { sK.Vs = +e.target.value; $('k_vLbl').textContent = sK.Vs.toFixed(1) + ' V'; });
$('k_type').addEventListener('change', e => { sK.type = e.target.value; });
$('k_R').addEventListener('change', e => { sK.R = +e.target.value; });
document.querySelectorAll('#k_dir button').forEach(b => b.addEventListener('click', () => {
  sK.dir = b.dataset.d; document.querySelectorAll('#k_dir button').forEach(x => x.classList.toggle('on', x === b));
}));
document.querySelector('#k_dir button[data-d=fwd]').classList.add('on');

pnMode('apart'); ledMode('fwd');
resize();
const h = parseInt(location.hash.slice(1), 10);
show(h >= 1 && h <= 6 ? h - 1 : 0);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (cv.width < 2) resize();
  if (cur !== 2 || dirtyC) scenes[cur](dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.__diode = { iDiode, ledCurrent, fmtI, show, sP, sL, sK, solveK };
})();
