'use strict';
(() => {
  const P = window.TossPhysics;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const snap = (v, s) => Math.round(v / s) * s;
  const fmt = (v, d = 2) => v.toFixed(d);

  const canvas = $('scene'), ctx = canvas.getContext('2d'), stage = $('stage');
  const LIMITS = { angle: [0, 85, 0.5], speed: [1, 15, 0.1], can: [2, 9, 0.05] };
  const SIZES = { small: { canW: 0.4, canH: 0.65 }, medium: { canW: 0.5, canH: 0.8 }, large: { canW: 0.62, canH: 0.95 } };
  const SHOT_COLORS = ['#7454ba', '#007f89', '#a85b15', '#ba4872', '#416bb8', '#3f8a52'];
  const MODE_TAG = { free: '自由挑戰', 'same-speed': '同速率挑戰', 'same-angle': '同仰角挑戰' };
  const GROUND_PAD = 26;

  const S = {
    cfg: P.makeConfig({ canX: 5 }),
    angle: 45, speed: 7.5,
    lid: null, stage: 0, shots: [], sim: null, shot: null,
    mode: 'free', lock: null,
    assist: 'short', grid: true, slow: false, autoThrow: true,
    view: { xMin: -1.4, xMax: 7.2 }, viewTarget: 7.2,
    face: { mood: 'idle', until: 0 }, kidMood: 'idle', fx: [],
    drag: null, throwAnim: 0, accum: 0, time: 0,
    seenLid: false, seenIn: false, seenWall: 0
  };
  S.lid = P.newLid(S.cfg, false);

  // ---------------- layout ----------------
  let W = 0, H = 0, dpr = 1;
  function resize() {
    W = stage.clientWidth;
    const maxH = Math.max(250, window.innerHeight * 0.72);
    H = Math.round(clamp(W * (W < 600 ? 0.82 : 0.6), 250, Math.min(600, maxH)));
    stage.style.height = H + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const viewTargetFor = canX => Math.max(6.4, canX + 1.9);
  function scale() { return Math.min(W / (S.view.xMax - S.view.xMin), (H - GROUND_PAD - 12) / 4.0); }
  const sx = x => (x - S.view.xMin) * scale();
  const sy = y => H - GROUND_PAD - y * scale();
  const wx = px => px / scale() + S.view.xMin;

  // ---------------- UI sync ----------------
  const angleText = a => (Number.isInteger(a) ? a.toFixed(0) : a.toFixed(1)) + '°';
  function syncControls() {
    $('angle').value = S.angle; $('speed').value = S.speed; $('can-x').value = S.cfg.canX;
    $('angle-out').textContent = angleText(S.angle);
    $('speed-out').textContent = fmt(S.speed, 1) + ' m/s';
    $('can-out').textContent = fmt(S.cfg.canX) + ' m';
    $('release-out').textContent = fmt(S.cfg.releaseH) + ' m';
    const th = S.angle * P.DEG;
    $('components').textContent = `vₓ = ${fmt(S.speed * Math.cos(th))} m/s ・ v_y = ${fmt(S.speed * Math.sin(th))} m/s`;
    $('aim-chip-angle').textContent = angleText(S.angle);
    $('aim-chip-speed').textContent = fmt(S.speed, 1) + ' m/s';
    const { front, back } = P.canEdges(S.cfg);
    $('can-info').textContent = `桶口 x = ${fmt(front)} – ${fmt(back)} m ・ 桶高 ${fmt(S.cfg.canH)} m ・ 出手高 ${fmt(S.cfg.releaseH)} m`;
    const lockA = S.lock && S.lock.key === 'angle', lockS = S.lock && S.lock.key === 'speed';
    $('angle').disabled = lockA; $('speed').disabled = lockS;
    document.querySelectorAll('[data-key=angle]').forEach(b => { b.disabled = lockA; });
    document.querySelectorAll('[data-key=speed]').forEach(b => { b.disabled = lockS; });
    $('angle-control').classList.toggle('locked', lockA);
    $('speed-control').classList.toggle('locked', lockS);
    $('lock-note').textContent = S.lock ? `🔒 ${lockA ? '仰角' : '速率'}已鎖定為第一球` : '';
    $('throw').disabled = !!S.sim;
    $('throw').textContent = S.sim ? '飛行中…' : '投出紙團';
    $('mode-tag').textContent = MODE_TAG[S.mode];
    $('step1').className = S.stage >= 1 ? 'done' : 'active';
    $('step2').className = S.stage >= 2 ? 'done' : S.stage === 1 ? 'active' : '';
    const n = S.shots.length;
    $('attempts').textContent = S.sim ? `第 ${n} 球飛行中` : S.stage >= 2 ? `完成・共 ${n} 球` : `準備第 ${n + 1} 球`;
  }
  function say(text, tone) {
    const m = $('message'); m.textContent = text; m.className = 'message' + (tone ? ' ' + tone : '');
  }

  function setValue(key, v) {
    if (key === 'angle') { if (S.lock && S.lock.key === 'angle') return; S.angle = +clamp(snap(v, 0.5), 0, 85).toFixed(1); }
    else if (key === 'speed') { if (S.lock && S.lock.key === 'speed') return; S.speed = +clamp(snap(v, 0.1), 1, 15).toFixed(1); }
    else if (key === 'can') { setCanX(v); return; }
    syncControls();
  }
  function setCanX(v, keepView) {
    const x = +clamp(snap(v, 0.05), LIMITS.can[0], LIMITS.can[1]).toFixed(2);
    if (x === S.cfg.canX) return;
    if (S.sim) return;
    S.cfg.canX = x;
    if (!keepView) S.viewTarget = viewTargetFor(x);
    if (S.shots.length || S.stage) resetMission('垃圾桶移動了，任務重新開始。先打中蓋子！');
    syncControls();
  }

  // ---------------- mission ----------------
  function resetMission(msg) {
    S.lid = P.newLid(S.cfg, false);
    S.stage = 0; S.shots = []; S.sim = null; S.shot = null; S.lock = null;
    S.face = { mood: 'idle', until: 0 }; S.kidMood = 'idle'; S.fx = [];
    $('complete').hidden = true;
    renderLog(); syncControls();
    say(msg || '先投第一球：打中垃圾桶的蓋子，讓它彈開。');
  }
  function applyLock(shot) {
    if (S.mode === 'same-speed') { S.lock = { key: 'speed', value: shot.speed }; S.speed = shot.speed; }
    else if (S.mode === 'same-angle') { S.lock = { key: 'angle', value: shot.angle }; S.angle = shot.angle; }
  }

  function throwBall() {
    if (S.sim) return;
    S.sim = P.createShot(S.cfg, S.lid, S.angle, S.speed);
    S.shot = { n: S.shots.length + 1, angle: S.angle, speed: S.speed, color: SHOT_COLORS[S.shots.length % SHOT_COLORS.length], stageAt: S.stage, path: null, result: null };
    S.shots.push(S.shot);
    S.throwAnim = 0.28; S.seenLid = false; S.seenIn = false; S.seenWall = 0;
    S.face = { mood: 'watch', until: 0 }; S.kidMood = 'idle';
    say(`第 ${S.shot.n} 球出手：θ = ${angleText(S.angle)}，v₀ = ${fmt(S.speed, 1)} m/s`);
    syncControls();
  }

  function mood(m, dur) { S.face = { mood: m, until: S.time + dur }; }
  function burst(x, y, kind) {
    const n = kind === 'in' ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const a = (kind === 'in' ? -Math.PI / 2 : 0) + (Math.random() - .5) * (kind === 'in' ? 2.4 : Math.PI * 2);
      const sp = 0.6 + Math.random() * (kind === 'in' ? 1.6 : 1.0);
      S.fx.push({ type: Math.random() < (kind === 'in' ? .35 : 0) ? 'note' : 'spark', x, y, vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp + (kind === 'in' ? 1.2 : 0), life: 0, max: 0.9 + Math.random() * .6, hue: kind === 'in' ? ['#e2a321', '#ba4872', '#007f89', '#7454ba'][i % 4] : '#e2a321' });
    }
  }
  function checkEvents() {
    const sim = S.sim, ev = sim.ev;
    if (ev.lidOpened && !S.seenLid) {
      S.seenLid = true; mood('surprised', 1.6);
      S.fx.push({ type: 'bang', x: ev.lidOpened.x, y: ev.lidOpened.y, life: 0, max: .7 });
      burst(ev.lidOpened.x, ev.lidOpened.y, 'lid');
    }
    if (sim.inside && !S.seenIn) {
      S.seenIn = true;
      if (S.stage >= 1 || ev.lidOpened) { mood('happy', 3); burst(S.cfg.canX, S.cfg.canH + 0.1, 'in'); }
    }
    if (ev.wall && ev.wallHits > S.seenWall && !sim.inside) { S.seenWall = ev.wallHits; if (!S.seenLid) mood('ouch', 1.1); }
  }

  function describe(res, shot) {
    const { front, back } = P.canEdges(S.cfg);
    const hf = res.heightAtFront;
    switch (res.kind) {
      case 'in': return { short: '進桶', detail: '', ok: true };
      case 'lidOpened': return { short: '打開蓋子', detail: `擊中點高 ${fmt(S.sim.ev.lidOpened.y)} m`, ok: true };
      case 'bounceOut': return { short: '彈出桶外', detail: '掉進去又彈出來' };
      case 'lid': return { short: '撞蓋彈開', detail: '撞到立起的蓋子' };
      case 'wall': return { short: '撞到桶身', detail: hf != null ? `過前緣時高 ${fmt(hf)} m` : '' };
      default: {
        if (res.landX == null) return { short: '出界', detail: '' };
        if (res.landX < front) return { short: `落在桶前 ${fmt(front - res.landX)} m`, detail: hf != null && hf > 0 ? `過前緣時高 ${fmt(hf)} m` : `落點 x = ${fmt(res.landX)} m` };
        return { short: `飛過頭 ${fmt(res.landX - back)} m`, detail: hf != null ? `過前緣時高 ${fmt(hf)} m` : '' };
      }
    }
  }

  function finishShot() {
    const sim = S.sim, res = P.outcome(sim), shot = S.shot;
    shot.path = sim.path; shot.result = res; shot.desc = describe(res, shot);
    S.sim = null;
    const H0 = fmt(S.cfg.canH);
    if (S.stage === 0) {
      if (res.lidOpened) {
        S.stage = 1; applyLock(shot);
        const extra = res.kind === 'in' ? '還順勢掉進桶裡！不過任務要「第二球」投進，再來一次。' : '';
        const lockText = S.lock ? (S.lock.key === 'speed' ? `第二球速率鎖定為 ${fmt(shot.speed, 1)} m/s，只能改仰角。` : `第二球仰角鎖定為 ${angleText(shot.angle)}，只能改速率。`) : '';
        say(`✓ 打中蓋子，蓋子彈開了！${extra}現在投第二球，把紙團投進桶子。${lockText}`, 'good');
      } else missMessage(res, shot, H0);
    } else if (S.stage === 1) {
      if (res.kind === 'in') {
        S.stage = 2; mood('happy', 4);
        say(`🎉 投進了！任務完成，共用了 ${S.shots.length} 球。`, 'good');
        setTimeout(showComplete, 900);
      } else missMessage(res, shot, H0);
    } else {
      say(res.kind === 'in' ? '又進了！自由練習中。' : `自由練習：${shot.desc.short}。`, res.kind === 'in' ? 'good' : '');
      if (res.kind === 'in') mood('happy', 2);
    }
    if (res.kind !== 'in' && !res.lidOpened && S.stage < 2) { mood('meh', 1.4); S.kidMood = 'oops'; }
    else S.kidMood = 'yay';
    renderLog(); syncControls();
  }
  function missMessage(res, shot, H0) {
    const d = shot.desc;
    const target = S.stage === 0 ? '蓋子' : '桶口';
    let t;
    switch (res.kind) {
      case 'wall': t = `撞到桶身彈開了。紙團經過桶子前緣時只有 ${fmt(res.heightAtFront)} m 高，桶高 ${H0} m。`; break;
      case 'lid': t = '撞到立起來的蓋子彈出去了。試試讓紙團在下降時越過桶子前緣。'; break;
      case 'bounceOut': t = '進去又彈出來了！落下速度太快，試著用小一點的速率。'; break;
      default:
        if (res.landX == null) t = '紙團飛出場外了。';
        else if (res.landX < P.canEdges(S.cfg).front) t = `${d.short}，距離不夠，還沒到${target}。`;
        else t = `${d.short}，飛過${target}了。`;
    }
    say(`第 ${shot.n} 球：${t}`, 'bad');
  }

  function showComplete() {
    if (S.stage < 2) return;
    const n = S.shots.length;
    const opener = S.shots.find(s => s.result && s.result.lidOpened);
    const scorer = [...S.shots].reverse().find(s => s.result && s.result.kind === 'in');
    $('stars').textContent = n <= 2 ? '★★★' : n <= 5 ? '★★☆' : '★☆☆';
    $('complete-title').textContent = n <= 2 ? '一次到位，完美！' : '任務完成！';
    $('complete-text').textContent = `打開蓋子：θ = ${angleText(opener.angle)}、v₀ = ${fmt(opener.speed, 1)} m/s；投進桶子：θ = ${angleText(scorer.angle)}、v₀ = ${fmt(scorer.speed, 1)} m/s。共 ${n} 球（d = ${fmt(S.cfg.canX)} m，${MODE_TAG[S.mode]}）。`;
    $('complete').hidden = false;
  }

  function renderLog() {
    const body = $('log-body'); body.textContent = '';
    $('log').hidden = !S.shots.length; $('log-empty').hidden = !!S.shots.length;
    $('log-count').textContent = S.shots.length + ' 球';
    for (const s of [...S.shots].reverse()) {
      const tr = document.createElement('tr');
      const d = s.desc || { short: '飛行中…', detail: '' };
      if (d.ok) tr.className = 'ok';
      tr.innerHTML = `<td><span class="dot" style="background:${s.color}"></span>${s.n}</td><td>${angleText(s.angle)}</td><td>${fmt(s.speed, 1)}</td><td><span class="res">${d.ok ? '✓ ' : ''}${d.short}${d.detail ? `<small>${d.detail}</small>` : ''}</span></td>`;
      body.appendChild(tr);
    }
  }

  // ---------------- drawing ----------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#e6f1f6'); g.addColorStop(1, '#f6faf7');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const k = scale(), gy = sy(0);
    if (S.grid) {
      ctx.lineWidth = 1; ctx.strokeStyle = '#20364a14';
      ctx.beginPath();
      for (let x = Math.ceil(S.view.xMin); x <= S.view.xMax + 3; x++) { const X = Math.round(sx(x)) + .5; ctx.moveTo(X, 0); ctx.lineTo(X, gy); }
      for (let y = 1; sy(y) > 0; y++) { const Y = Math.round(sy(y)) + .5; ctx.moveTo(0, Y); ctx.lineTo(W, Y); }
      ctx.stroke();
      ctx.fillStyle = '#5f738799'; ctx.font = `${W < 500 ? 9 : 10}px ${getComputedStyle(document.body).getPropertyValue('--mono')}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      for (let y = 1; sy(y) > 40; y++) ctx.fillText(y + ' m', 4, sy(y) - 2);
    }
    // ground
    ctx.fillStyle = '#dfe7df'; ctx.fillRect(0, gy, W, H - gy);
    ctx.strokeStyle = '#8fa39a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    ctx.fillStyle = '#5f7387'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `${W < 500 ? 9 : 10}px ${getComputedStyle(document.body).getPropertyValue('--mono')}`;
    const stepLbl = k < 32 ? 2 : 1;
    for (let x = 0; x <= S.view.xMax + 3; x++) {
      const X = sx(x); if (X > W) break;
      ctx.strokeStyle = '#8fa39a'; ctx.beginPath(); ctx.moveTo(X, gy); ctx.lineTo(X, gy + (x % 5 ? 4 : 7)); ctx.stroke();
      if (x % stepLbl === 0 && Math.abs(x - S.cfg.canX) > 0.45 * 50 / k) ctx.fillText(x === 0 ? '0' : x + '', X, gy + 7);
    }
    // can-centre marker
    const cx = sx(S.cfg.canX);
    ctx.fillStyle = '#007f89'; ctx.font = `600 ${W < 500 ? 9 : 10.5}px ${getComputedStyle(document.body).getPropertyValue('--mono')}`;
    const lbl = `d = ${fmt(S.cfg.canX)} m`, tw = ctx.measureText(lbl).width + 8;
    ctx.fillStyle = '#ffffff'; roundRect(cx - tw / 2, gy + 5, tw, 14, 4); ctx.fill();
    ctx.fillStyle = '#007f89'; ctx.fillText(lbl, cx, gy + 6);
  }

  function drawPrediction() {
    if (S.assist === 'off' || S.sim) return;
    const cfg = S.cfg, maxX = S.assist === 'short' ? cfg.releaseX + 0.38 * (cfg.canX - cfg.releaseX) : S.view.xMax + 2;
    ctx.save(); ctx.setLineDash([5, 6]); ctx.lineWidth = 2; ctx.strokeStyle = '#007f89aa'; ctx.beginPath();
    let first = true, last = null;
    for (let t = 0; t < 6; t += 0.01) {
      const p = P.pointAt(cfg, S.angle, S.speed, t);
      if (p.y < 0 || p.x > maxX) break;
      if (first) { ctx.moveTo(sx(p.x), sy(p.y)); first = false; } else ctx.lineTo(sx(p.x), sy(p.y));
      last = p;
    }
    ctx.stroke(); ctx.restore();
    if (S.assist === 'short' && last) { ctx.fillStyle = '#007f89aa'; ctx.beginPath(); ctx.arc(sx(last.x), sy(last.y), 3, 0, 7); ctx.fill(); }
  }

  function drawTraces() {
    const list = S.shots.filter(s => s.path || s === S.shot);
    const recent = list.slice(-6);
    recent.forEach((s, i) => {
      const path = s === S.shot && S.sim ? S.sim.path : s.path; if (!path || path.length < 2) return;
      const age = recent.length - 1 - i;
      ctx.save(); ctx.globalAlpha = S.sim && s === S.shot ? .9 : Math.max(.25, .8 - age * .12);
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash([2, 5]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx(path[0].x), sy(path[0].y));
      for (const p of path) ctx.lineTo(sx(p.x), sy(p.y));
      ctx.stroke();
      if (s.path) {
        const e = path[path.length - 1];
        ctx.setLineDash([]); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y) - 13, 7, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '600 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(s.n), sx(e.x), sy(e.y) - 13);
      }
      ctx.restore();
    });
  }

  function drawKid() {
    const k = scale(), h0 = S.cfg.releaseH;
    const size = clamp(h0, 0.6, 1.0), base = Math.max(0, h0 - 1.0);
    const X = x => sx(x), Y = y => sy(y);
    if (base > 0) { // step stool
      ctx.fillStyle = '#c9b18c'; ctx.strokeStyle = '#8e7550'; ctx.lineWidth = 1.5;
      roundRect(X(-0.8), Y(base), 0.75 * k, base * k, 3); ctx.fill(); ctx.stroke();
    }
    const fx = -0.4, by = base, u = size;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // legs
    ctx.strokeStyle = '#33506b'; ctx.lineWidth = Math.max(3, 0.08 * k * u);
    ctx.beginPath(); ctx.moveTo(X(fx - 0.06 * u), Y(by + 0.42 * u)); ctx.lineTo(X(fx - 0.09 * u), Y(by + 0.03));
    ctx.moveTo(X(fx + 0.06 * u), Y(by + 0.42 * u)); ctx.lineTo(X(fx + 0.1 * u), Y(by + 0.03)); ctx.stroke();
    // body
    ctx.fillStyle = '#f0a04b'; roundRect(X(fx - 0.15 * u), Y(by + 0.92 * u), 0.3 * u * k, 0.52 * u * k, 0.1 * u * k); ctx.fill();
    // throwing arm (shoulder -> hand at release point)
    const sh = { x: fx + 0.08 * u, y: by + 0.85 * u };
    let hx = 0, hy = h0;
    if (S.throwAnim > 0) { const p = S.throwAnim / 0.28, a = S.angle * P.DEG + p * 1.2; hx = sh.x + 0.42 * Math.cos(a); hy = sh.y + 0.42 * Math.sin(a); }
    ctx.strokeStyle = '#f2c29a'; ctx.lineWidth = Math.max(3, 0.07 * k * u);
    ctx.beginPath(); ctx.moveTo(X(sh.x), Y(sh.y)); ctx.lineTo(X(hx), Y(hy)); ctx.stroke();
    // other arm
    ctx.beginPath(); ctx.moveTo(X(fx - 0.12 * u), Y(by + 0.84 * u)); ctx.lineTo(X(fx - 0.24 * u), Y(by + 0.6 * u)); ctx.stroke();
    // head
    const hcx = X(fx), hcy = Y(by + 1.12 * u), hr = 0.22 * u * k;
    ctx.fillStyle = '#f7d2b0'; ctx.beginPath(); ctx.arc(hcx, hcy, hr, 0, 7); ctx.fill();
    ctx.fillStyle = '#3b2e2a'; ctx.beginPath(); ctx.arc(hcx, hcy - hr * .15, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    // eyes look at ball / can
    const target = S.sim ? S.sim.ball : { x: S.cfg.canX, y: S.cfg.canH };
    const ang = Math.atan2(-(target.y - (by + 1.12 * u)), target.x - fx);
    const ex = Math.cos(ang) * hr * .08, ey = Math.sin(ang) * hr * .08;
    ctx.fillStyle = '#20364a';
    if (S.kidMood === 'yay' && !S.sim) {
      ctx.strokeStyle = '#20364a'; ctx.lineWidth = Math.max(1.2, hr * .1);
      for (const dx of [-.32, .32]) { ctx.beginPath(); ctx.arc(hcx + dx * hr, hcy + hr * .05, hr * .14, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    } else for (const dx of [-.32, .32]) { ctx.beginPath(); ctx.ellipse(hcx + dx * hr + ex, hcy + hr * .05 + ey, hr * .1, hr * .14, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#a5523a'; ctx.lineWidth = Math.max(1, hr * .08);
    ctx.beginPath();
    if (S.kidMood === 'oops' && !S.sim) { ctx.moveTo(hcx - hr * .18, hcy + hr * .45); ctx.lineTo(hcx + hr * .18, hcy + hr * .42); }
    else ctx.arc(hcx, hcy + hr * .3, hr * .2, .2 * Math.PI, .8 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#f4a3a3aa'; for (const dx of [-.55, .55]) { ctx.beginPath(); ctx.ellipse(hcx + dx * hr, hcy + hr * .32, hr * .13, hr * .08, 0, 0, 7); ctx.fill(); }
    if (S.kidMood === 'oops' && !S.sim) drawSweat(hcx + hr * 1.05, hcy - hr * .3, hr * .32);
    // release point marker + h0 dimension
    if (!S.sim) {
      ctx.save(); ctx.strokeStyle = '#5f738766'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(0), Y(h0)); ctx.lineTo(X(0), Y(0)); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#5f7387'; ctx.font = `${W < 500 ? 9 : 10}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`h₀ ${fmt(h0)} m`, X(0) + 4, Y(h0 * 0.45));
    }
  }

  function drawSweat(x, y, r) {
    ctx.fillStyle = '#7cc6e6'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.6);
    ctx.quadraticCurveTo(x + r, y - r * .2, x, y + r * .4); ctx.quadraticCurveTo(x - r, y - r * .2, x, y - r * 1.6); ctx.fill();
    ctx.fillStyle = '#ffffffaa'; ctx.beginPath(); ctx.arc(x - r * .25, y - r * .2, r * .2, 0, 7); ctx.fill();
  }

  function drawCan() {
    const cfg = S.cfg, k = scale(), { front, back } = P.canEdges(cfg);
    const L = sx(front), R = sx(back), T = sy(cfg.canH), B = sy(0), w = R - L, wallPx = Math.max(2.5, cfg.wallR * 2 * k);
    // body
    const grad = ctx.createLinearGradient(L, 0, R, 0);
    grad.addColorStop(0, '#5fae9f'); grad.addColorStop(.55, '#7cc3b4'); grad.addColorStop(1, '#4b9a8b');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L + w * .03, B - 3); ctx.quadraticCurveTo(L + w * .04, B, L + w * .1, B);
    ctx.lineTo(R - w * .1, B); ctx.quadraticCurveTo(R - w * .04, B, R - w * .03, B - 3); ctx.lineTo(R, T); ctx.closePath(); ctx.fill();
    // inside darkness when open
    if (S.lid.state !== 'closed') { ctx.fillStyle = '#2c5f5788'; ctx.fillRect(L + wallPx / 2, T, w - wallPx, Math.min(6, (B - T) * .12)); }
    // ribs
    ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = Math.max(1, w * .03);
    ctx.beginPath(); for (const f of [.22, .78]) { ctx.moveTo(L + w * f, T + (B - T) * .12); ctx.lineTo(L + w * f, B - (B - T) * .1); } ctx.stroke();
    // rim
    ctx.strokeStyle = '#2f7f74'; ctx.lineWidth = wallPx; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L, B - 2); ctx.lineTo(L, T); ctx.moveTo(R, B - 2); ctx.lineTo(R, T); ctx.stroke();
    ctx.lineWidth = Math.max(3, wallPx * 1.4); ctx.beginPath(); ctx.moveTo(L - 1, T); ctx.lineTo(L + w * .12, T); ctx.moveTo(R - w * .12, T); ctx.lineTo(R + 1, T); ctx.stroke();
    drawFace(L, T, w, B - T);
    drawLid();
  }

  function drawLid() {
    const cfg = S.cfg, k = scale(), h = P.hinge(cfg), tip = P.lidTip(cfg, S.lid.phi);
    const hx = sx(h.x), hy = sy(h.y), tx = sx(tip.x), ty = sy(tip.y), th = Math.max(4, cfg.lidR * 2 * k);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2f7f74'; ctx.lineWidth = th; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = '#8fd3c4'; ctx.lineWidth = Math.max(1, th * .3); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    // knob on the outer face
    const dx = tx - hx, dy = ty - hy, len = Math.hypot(dx, dy) || 1, nx = dy / len, ny = -dx / len; // outward normal (up when closed)
    const mx = hx + dx * .55, my = hy + dy * .55, kb = Math.max(3, 0.035 * k);
    const sgn = S.lid.phi > Math.PI / 2 ? -1 : 1;
    ctx.strokeStyle = '#2f7f74'; ctx.lineWidth = Math.max(2, th * .7);
    ctx.beginPath(); ctx.moveTo(mx - dx / len * kb, my - dy / len * kb); ctx.lineTo(mx - dx / len * kb + nx * kb * sgn * -1, my - dy / len * kb + ny * kb * sgn * -1);
    ctx.lineTo(mx + dx / len * kb + nx * kb * sgn * -1, my + dy / len * kb + ny * kb * sgn * -1); ctx.lineTo(mx + dx / len * kb, my + dy / len * kb); ctx.stroke();
    ctx.fillStyle = '#20364a'; ctx.beginPath(); ctx.arc(hx, hy, Math.max(2.2, th * .45), 0, 7); ctx.fill();
  }

  function drawFace(L, T, w, h) {
    const f = S.face, m = f.until && S.time > f.until ? (S.sim ? 'watch' : 'idle') : f.mood;
    if (f.until && S.time > f.until) S.face = { mood: m, until: 0 };
    const cx = L + w / 2, cy = T + h * .45, u = w;
    const er = Math.max(1.6, u * .075), gap = u * .2;
    const target = S.sim ? S.sim.ball : { x: S.cfg.releaseX, y: S.cfg.releaseH };
    const a = Math.atan2(-(target.y - S.cfg.canH * .55), target.x - S.cfg.canX);
    const lx = Math.cos(a) * er * .35, ly = Math.sin(a) * er * .35;
    const blink = m === 'idle' && (S.time % 3.6) < .12;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const eye = (x, y) => {
      if (m === 'happy') { ctx.strokeStyle = '#1d3b36'; ctx.lineWidth = Math.max(1.4, er * .5); ctx.beginPath(); ctx.arc(x, y + er * .4, er * .9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); return; }
      if (m === 'ouch') { ctx.strokeStyle = '#1d3b36'; ctx.lineWidth = Math.max(1.4, er * .45); const s = x < cx ? 1 : -1; ctx.beginPath(); ctx.moveTo(x - er * .8 * s, y - er * .7); ctx.lineTo(x + er * .6 * s, y); ctx.lineTo(x - er * .8 * s, y + er * .7); ctx.stroke(); return; }
      if (m === 'meh') { ctx.strokeStyle = '#1d3b36'; ctx.lineWidth = Math.max(1.4, er * .45); ctx.beginPath(); ctx.moveTo(x - er * .8, y + er * .1); ctx.lineTo(x + er * .8, y + er * .1); ctx.stroke(); return; }
      if (blink) { ctx.strokeStyle = '#1d3b36'; ctx.lineWidth = Math.max(1.2, er * .4); ctx.beginPath(); ctx.moveTo(x - er * .7, y); ctx.lineTo(x + er * .7, y); ctx.stroke(); return; }
      const big = m === 'surprised' ? 1.45 : 1;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, er * big, er * 1.2 * big, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1d3b36'; ctx.beginPath(); ctx.ellipse(x + lx, y + ly, er * .62 * (m === 'surprised' ? .8 : 1), er * .78 * (m === 'surprised' ? .8 : 1), 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + lx - er * .2, y + ly - er * .3, er * .22, 0, 7); ctx.fill();
    };
    eye(cx - gap, cy); eye(cx + gap, cy);
    // cheeks
    ctx.fillStyle = m === 'happy' ? '#f19bb0cc' : '#f19bb066';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * gap * 1.65, cy + er * 1.6, er * .8, er * .45, 0, 0, 7); ctx.fill(); }
    // mouth
    const my = cy + er * 2.2;
    ctx.strokeStyle = '#1d3b36'; ctx.lineWidth = Math.max(1.2, er * .38);
    if (m === 'happy') {
      ctx.fillStyle = '#1d3b36'; ctx.beginPath(); ctx.moveTo(cx - er * 1.3, my - er * .3); ctx.quadraticCurveTo(cx, my + er * 2.2, cx + er * 1.3, my - er * .3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ef7d8f'; ctx.beginPath(); ctx.ellipse(cx, my + er * .65, er * .6, er * .35, 0, 0, 7); ctx.fill();
    } else if (m === 'surprised') {
      ctx.fillStyle = '#1d3b36'; ctx.beginPath(); ctx.ellipse(cx, my + er * .3, er * .55, er * .75, 0, 0, 7); ctx.fill();
    } else if (m === 'ouch' || m === 'meh') {
      ctx.beginPath(); ctx.moveTo(cx - er * 1.1, my + er * .3);
      ctx.quadraticCurveTo(cx - er * .55, my - er * .2, cx, my + er * .3); ctx.quadraticCurveTo(cx + er * .55, my + er * .8, cx + er * 1.1, my + er * .3); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(cx, my - er * .4, er * .8, .2 * Math.PI, .8 * Math.PI); ctx.stroke();
    }
    // effects next to the can
    if (m === 'surprised') {
      drawSweat(L + w + Math.max(5, w * .12), T + h * .25, Math.max(3, w * .07));
      ctx.fillStyle = '#d0452f'; ctx.font = `800 ${Math.max(13, w * .38)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('!', L - Math.max(8, w * .18), T + h * .2);
    }
    if (m === 'meh') drawSweat(L + w + Math.max(5, w * .12), T + h * .3, Math.max(2.5, w * .06));
  }

  function drawPaperBall(x, y, rot, r) {
    const X = sx(x), Y = sy(y), R = Math.max(3.5, r * scale());
    ctx.save(); ctx.translate(X, Y); ctx.rotate(rot);
    ctx.fillStyle = '#fbfaf4'; ctx.strokeStyle = '#8e9aa6'; ctx.lineWidth = Math.max(1, R * .12);
    ctx.beginPath();
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rr = R * (i % 2 ? .9 : 1.04); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = Math.max(.7, R * .08); ctx.strokeStyle = '#b3bcc5';
    ctx.beginPath(); ctx.moveTo(-R * .5, -R * .2); ctx.lineTo(R * .1, R * .1); ctx.lineTo(R * .45, -R * .35); ctx.moveTo(-R * .2, R * .5); ctx.lineTo(R * .05, R * .1); ctx.stroke();
    ctx.restore();
  }

  function drawAim() {
    if (S.sim) return;
    const k = scale(), ox = sx(S.cfg.releaseX), oy = sy(S.cfg.releaseH), th = S.angle * P.DEG;
    const len = (0.3 + S.speed * 0.075) * k, ex = ox + Math.cos(th) * len, ey = oy - Math.sin(th) * len;
    // angle arc
    const ar = Math.max(22, 0.42 * k);
    ctx.strokeStyle = '#a85b15aa'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + ar * 1.25, oy); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(ox, oy, ar, -th, 0); ctx.stroke();
    ctx.fillStyle = '#a85b15'; ctx.font = `600 ${W < 500 ? 10 : 11}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`θ ${angleText(S.angle)}`, ox + ar * 1.3 * Math.cos(th / 2) + 2, oy - ar * 1.3 * Math.sin(th / 2));
    // velocity arrow
    ctx.strokeStyle = '#007f89'; ctx.fillStyle = '#007f89'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
    const hs = 9; ctx.beginPath(); ctx.moveTo(ex + Math.cos(th) * 3, ey - Math.sin(th) * 3);
    ctx.lineTo(ex - Math.cos(th - .45) * hs, ey + Math.sin(th - .45) * hs); ctx.lineTo(ex - Math.cos(th + .45) * hs, ey + Math.sin(th + .45) * hs); ctx.closePath(); ctx.fill();
    ctx.font = `600 ${W < 500 ? 10 : 11}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(`${fmt(S.speed, 1)} m/s`, ex + Math.cos(th) * 18, ey - Math.sin(th) * 18 - 4);
    // drag rubber band
    if (S.drag && S.drag.type === 'aim' && S.drag.moved) {
      ctx.save(); ctx.strokeStyle = '#20364a55'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(S.drag.x0, S.drag.y0); ctx.lineTo(S.drag.x, S.drag.y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = '#20364a55'; ctx.beginPath(); ctx.arc(S.drag.x0, S.drag.y0, 5, 0, 7); ctx.fill(); ctx.restore();
    }
  }

  function drawBall() {
    const r = S.cfg.ballR;
    if (S.sim) {
      const b = S.sim.ball;
      drawPaperBall(b.x, b.y, S.sim.t * 9 + b.spin * .02, r);
      if (sy(b.y) < 2) { // off the top: indicator
        const X = clamp(sx(b.x), 14, W - 14);
        ctx.fillStyle = '#20364a'; ctx.beginPath(); ctx.moveTo(X, 46); ctx.lineTo(X - 7, 58); ctx.lineTo(X + 7, 58); ctx.closePath(); ctx.fill();
        ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`${fmt(b.y, 1)} m`, X, 60);
      }
    } else drawPaperBall(S.cfg.releaseX, S.cfg.releaseH, 0.4, r);
  }

  function drawFx(dt) {
    const k = scale();
    S.fx = S.fx.filter(p => (p.life += dt) < p.max);
    for (const p of S.fx) {
      const a = 1 - p.life / p.max;
      if (p.type === 'bang') {
        const R = (0.12 + p.life * .6) * k;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#e2a321'; ctx.lineWidth = 2.5;
        for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(sx(p.x) + Math.cos(an) * R * .55, sy(p.y) + Math.sin(an) * R * .55); ctx.lineTo(sx(p.x) + Math.cos(an) * R, sy(p.y) + Math.sin(an) * R); ctx.stroke(); }
        ctx.fillStyle = '#d0452f'; ctx.font = `800 ${Math.max(12, 0.22 * k)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('砰！', sx(p.x), sy(p.y) - R - 2); ctx.restore();
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 1.2 * dt;
      const X = sx(p.x), Y = sy(p.y);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = p.hue;
      if (p.type === 'note') { ctx.font = `700 ${Math.max(12, 0.2 * k)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♪', X, Y); }
      else { const s = Math.max(3, 0.06 * k) * (0.6 + a * .6); ctx.beginPath(); ctx.moveTo(X, Y - s); ctx.quadraticCurveTo(X, Y, X + s, Y); ctx.quadraticCurveTo(X, Y, X, Y + s); ctx.quadraticCurveTo(X, Y, X - s, Y); ctx.quadraticCurveTo(X, Y, X, Y - s); ctx.fill(); }
      ctx.restore();
    }
  }

  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(); drawTraces(); drawPrediction(); drawKid(); drawCan(); drawAim(); drawBall(); drawFx(dt);
  }

  // ---------------- loop ----------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; S.time += dt;
    S.accum += dt * (S.slow ? 0.3 : 1);
    const h = S.cfg.dt; let n = 0;
    while (S.accum >= h && n < 3000) { if (S.sim) P.stepWorld(S.sim, h); else P.updateLid(S.lid, S.cfg, h); S.accum -= h; n++; }
    if (S.sim) { checkEvents(); if (S.sim.done) finishShot(); }
    if (S.throwAnim > 0) S.throwAnim = Math.max(0, S.throwAnim - dt);
    if (!(S.drag && S.drag.type === 'can')) S.view.xMax += (S.viewTarget - S.view.xMax) * Math.min(1, dt * 6);
    draw(dt);
    requestAnimationFrame(frame);
  }

  // ---------------- input ----------------
  const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function hitCan(p) {
    const { front, back } = P.canEdges(S.cfg), tip = P.lidTip(S.cfg, S.lid.phi);
    const pad = W < 500 ? 16 : 10;
    const L = Math.min(sx(front), sx(tip.x)) - pad, R = Math.max(sx(back), sx(tip.x)) + pad;
    const T = Math.min(sy(S.cfg.canH), sy(tip.y)) - pad, B = sy(0) + 8;
    return p.x >= L && p.x <= R && p.y >= T && p.y <= B;
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    const p = pt(e);
    if (!S.sim && hitCan(p)) S.drag = { type: 'can', off: wx(p.x) - S.cfg.canX, moved: false };
    else S.drag = { type: 'aim', x0: p.x, y0: p.y, x: p.x, y: p.y, moved: false };
    canvas.setPointerCapture(e.pointerId); e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    const p = pt(e);
    if (!S.drag) { canvas.style.cursor = !S.sim && hitCan(p) ? 'ew-resize' : 'crosshair'; return; }
    if (S.drag.type === 'can') { S.drag.moved = true; setCanX(wx(p.x) - S.drag.off, true); return; }
    S.drag.x = p.x; S.drag.y = p.y;
    const dx = p.x - S.drag.x0, dy = S.drag.y0 - p.y, len = Math.hypot(dx, dy);
    if (len < 10 && !S.drag.moved) return;
    S.drag.moved = true;
    const ref = Math.min(W, H * 1.6) * 0.55;
    let a = Math.atan2(dy, dx) / P.DEG; if (a > 90 || a < -90) a = 85; else if (a < 0) a = 0;
    setValue('angle', Math.min(a, 85));
    setValue('speed', len / ref * 15);
    $('aim-chip').hidden = false;
    $('aim-chip-note').textContent = S.sim ? '等這球落地' : S.autoThrow ? (len < 16 ? '拖遠一點' : '放開投出') : '已設定';
  });
  function endDrag(e, cancel) {
    const d = S.drag; S.drag = null; $('aim-chip').hidden = true;
    if (!d) return;
    if (d.type === 'can') { S.viewTarget = viewTargetFor(S.cfg.canX); return; }
    if (cancel || !d.moved) return;
    const len = Math.hypot(d.x - d.x0, d.y - d.y0);
    if (S.autoThrow && len >= 16 && !S.sim) throwBall();
  }
  canvas.addEventListener('pointerup', e => endDrag(e, false));
  canvas.addEventListener('pointercancel', e => endDrag(e, true));
  canvas.addEventListener('keydown', e => {
    const big = e.shiftKey;
    if (e.key === 'ArrowUp') setValue('angle', S.angle + (big ? 5 : .5));
    else if (e.key === 'ArrowDown') setValue('angle', S.angle - (big ? 5 : .5));
    else if (e.key === 'ArrowRight') setValue('speed', S.speed + (big ? 1 : .1));
    else if (e.key === 'ArrowLeft') setValue('speed', S.speed - (big ? 1 : .1));
    else if (e.key === 'Enter' || e.key === ' ') throwBall();
    else return;
    e.preventDefault();
  });

  // steppers with press-and-hold
  document.querySelectorAll('.stepper button').forEach(btn => {
    let timer = null, rep = null;
    const key = btn.dataset.key, delta = +btn.dataset.delta;
    const once = () => { const cur = key === 'angle' ? S.angle : key === 'speed' ? S.speed : S.cfg.canX; setValue(key, cur + delta); };
    const stop = () => { clearTimeout(timer); clearInterval(rep); timer = rep = null; };
    btn.addEventListener('pointerdown', e => { if (btn.disabled) return; e.preventDefault(); once(); timer = setTimeout(() => { rep = setInterval(once, 55); }, 380); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => btn.addEventListener(t, stop));
    btn.addEventListener('click', e => { if (e.detail === 0) once(); }); // keyboard activation
  });
  $('angle').addEventListener('input', e => setValue('angle', +e.target.value));
  $('speed').addEventListener('input', e => setValue('speed', +e.target.value));
  $('can-x').addEventListener('input', e => setCanX(+e.target.value));
  $('throw').addEventListener('click', throwBall);
  $('random').addEventListener('click', () => {
    if (S.sim) return;
    let x; do { x = snap(3 + Math.random() * 5, 0.05); } while (Math.abs(x - S.cfg.canX) < 0.6);
    S.cfg.canX = +x.toFixed(2); S.viewTarget = viewTargetFor(S.cfg.canX);
    resetMission(`新位置：d = ${fmt(S.cfg.canX)} m。先打中蓋子！`);
  });
  $('reset').addEventListener('click', () => { if (!S.sim) resetMission(); });
  $('mode').addEventListener('change', e => { S.mode = e.target.value; if (!S.sim) resetMission(`${MODE_TAG[S.mode]}：先打中蓋子！`); });
  $('assist').addEventListener('change', e => { S.assist = e.target.value; });
  $('grid').addEventListener('change', e => { S.grid = e.target.checked; });
  $('slow').addEventListener('change', e => { S.slow = e.target.checked; });
  $('auto-throw').addEventListener('change', e => { S.autoThrow = e.target.checked; });
  $('release-h').addEventListener('input', e => { if (S.sim) { e.target.value = S.cfg.releaseH; return; } S.cfg.releaseH = +e.target.value; resetMission(`出手高度改為 ${fmt(S.cfg.releaseH)} m，任務重新開始。`); });
  $('can-size').addEventListener('change', e => { if (S.sim) return; Object.assign(S.cfg, SIZES[e.target.value]); resetMission('換了垃圾桶，任務重新開始。'); });
  $('again').addEventListener('click', () => resetMission('同一個位置再挑戰一次！'));
  $('new-spot').addEventListener('click', () => $('random').click());
  $('close-complete').addEventListener('click', () => { $('complete').hidden = true; say('自由練習中，可以繼續投。按「重新挑戰」再開始任務。'); });

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage.parentElement);
  resize(); S.view.xMax = S.viewTarget = viewTargetFor(S.cfg.canX);
  renderLog(); syncControls();
  requestAnimationFrame(frame);

  // test hook
  window.__toss = { S, throwBall, setValue, setCanX, resetMission };
})();
