// 把學生作答（欄位、回答、水波截圖）送到老師的 Google Apps Script。
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const Lab = window.DopplerLab;
  if (!Lab) return;
  const tasks = Lab.tasks;
  const KEY_URL = 'doppler-gas-url', KEY_ID = 'doppler-identity-v1', KEY_FIELDS = 'doppler-fields-v1';
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (_) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* 瀏覽器不允許保存時仍可送出 */ } }
  };

  // ---------- Apps Script 網址 ----------
  const fromQuery = new URLSearchParams(location.search).get('gas');
  if (fromQuery && /^https:\/\/script\.google(usercontent)?\.com\//.test(fromQuery)) store.set(KEY_URL, fromQuery);
  const gasUrl = () => (store.get(KEY_URL, '') || window.DOPPLER_GAS_URL || '').trim();

  // ---------- 身分 ----------
  const idFields = ['cls', 'seat', 'group', 'student'];
  const savedId = store.get(KEY_ID, {});
  idFields.forEach(id => {
    if ($(id) && savedId[id] && !$(id).value) $(id).value = savedId[id];
    $(id)?.addEventListener('input', () => store.set(KEY_ID, Object.fromEntries(idFields.map(k => [k, $(k)?.value || '']))));
    $(id)?.addEventListener('change', () => store.set(KEY_ID, Object.fromEntries(idFields.map(k => [k, $(k)?.value || '']))));
  });
  if (!$('cls').value) $('cls').value = '105';

  // ---------- 每題欄位 ----------
  const values = store.get(KEY_FIELDS, {});
  const machLabel = m => ({ 0.25: '¼ 波速', 0.5: '½ 波速', 0.75: '¾ 波速' })[Math.abs(m)] || '';
  const labelMach = l => ({ '¼ 波速': 0.25, '½ 波速': 0.5, '¾ 波速': 0.75 })[l];

  function abcdFigure() {
    const sets = [['A', 0], ['B', 0.25], ['C', 0.6], ['D', -0.5]];
    const ring = (m, n) => '<circle cx="' + (60 + m * n * 11) + '" cy="60" r="' + (44 - n * 11) + '" fill="none" stroke="#153f4d" stroke-width="1.6"/>';
    return '<div class="abcd">' + sets.map(([k, m]) => '<figure><svg viewBox="0 0 120 120" role="img" aria-label="波源 ' + k + ' 的水波">' + [0, 1, 2, 3].map(n => ring(m, n)).join('') +
      '<circle cx="' + (60 + m * 4 * 11) + '" cy="60" r="2.5" fill="#153f4d"/></svg><figcaption>' + k + '</figcaption></figure>').join('') + '</div>';
  }

  function render(index) {
    const t = tasks[index], box = $('task-fields'), saved = values[t.id] || {};
    box.replaceChildren();
    $('answer-label').textContent = t.reasonLabel || '我的回答';
    $('task-figure').hidden = t.figure !== 'abcd';
    $('task-figure').innerHTML = t.figure === 'abcd' ? abcdFigure() : '';
    $('task-link').hidden = !t.link;
    if (t.link) { $('task-link').href = t.link.href; $('task-link').textContent = t.link.label; }
    for (const f of t.fields) {
      const wrap = document.createElement('label'); wrap.className = 'task-field';
      const caption = document.createElement('span'); caption.textContent = f.label; wrap.append(caption);
      let input;
      if (f.type === 'choice') {
        input = document.createElement('select');
        input.add(new Option('—', ''));
        f.options.forEach(o => input.add(new Option(o, o)));
        let v = saved[f.key] || '';
        if (!v && f.fromMach) v = machLabel(Lab.params().mach);
        input.value = v;
      } else {
        input = document.createElement('input');
        input.type = f.type === 'number' ? 'number' : 'text';
        if (f.type === 'number') { input.step = 'any'; input.inputMode = 'decimal'; }
        input.placeholder = f.placeholder || '';
        input.value = saved[f.key] ?? '';
      }
      input.dataset.key = f.key;
      input.addEventListener('input', () => remember(t.id));
      input.addEventListener('change', () => remember(t.id));
      if (f.fill) {
        const row = document.createElement('span'); row.className = 'fill-row';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fill-btn';
        btn.textContent = '帶入';
        btn.addEventListener('click', () => {
          let v = null;
          if (f.fill === 'ruler') v = Lab.ruler();
          if (f.fill === 'duckA') v = Lab.ducks()[0].interval;
          if (f.fill === 'duckB') v = Lab.ducks()[1].interval;
          if (v === null || v === undefined) { setStatus(f.fill === 'ruler' ? '請先量距離' : '請先播放，等收到兩圈', 'warn'); return; }
          input.value = v; remember(t.id); setStatus('已帶入 ' + v, 'ok');
        });
        row.append(input, btn); wrap.append(row);
      } else wrap.append(input);
      box.append(wrap);
    }
  }
  function remember(id) {
    values[id] = Object.fromEntries([...$('task-fields').querySelectorAll('[data-key]')].map(el => [el.dataset.key, el.value]));
    store.set(KEY_FIELDS, values);
  }
  document.addEventListener('doppler:task', e => render(e.detail.index));
  // 選速度按鈕時，同步「我負責的波源速度」
  document.querySelectorAll('[data-mach]').forEach(b => b.addEventListener('click', () => {
    const sel = $('task-fields').querySelector('[data-key="speed"]'), label = machLabel(Number(b.dataset.mach));
    if (sel && label) { sel.value = label; remember(tasks[Lab.taskIndex].id); }
  }));
  render(Lab.taskIndex);

  // ---------- 送出 ----------
  function setStatus(text, kind = '') { $('submit-status').textContent = text; $('submit-status').dataset.kind = kind; }
  function shrink(src, width, quality) {
    const scale = Math.min(1, width / src.width), c = document.createElement('canvas');
    c.width = Math.round(src.width * scale); c.height = Math.round(src.height * scale);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }
  function payload() {
    const index = Lab.taskIndex, t = tasks[index], p = Lab.params();
    const fields = Object.fromEntries([...$('task-fields').querySelectorAll('[data-key]')].map(el => [el.dataset.key, el.value.trim()]));
    const data = {
      v: 1, sentAt: new Date().toISOString(),
      cls: $('cls').value.trim(), seat: $('seat').value.trim(), group: $('group').value, name: $('student').value.trim(),
      taskId: t.id, taskNo: index + 1, taskTitle: t.title, fields, answer: Lab.answer().trim(),
      mach: p.mach, c: p.c, f: p.f, mode: Lab.manual() ? 'manual' : 'auto', ruler: Lab.ruler(), ducks: Lab.ducks(),
      image: '', thumb: ''
    };
    if (t.check) data.arrangement = Lab.arrangement(t.id === 'moving' && labelMach(fields.speed) !== undefined ? labelMach(fields.speed) : p.mach);
    const shot = t.image ? Lab.snapshot(false) : null;
    const card = makeCard(t, data, shot);
    data.image = shrink(card, 1000, 0.8);          // 存進雲端資料夾的作答卡
    if (shot) {
      data.thumb = shrink(shot, 300, 0.6);         // 投影頁縮圖
      if (data.thumb.length > 45000) data.thumb = shrink(shot, 220, 0.45);
    }
    return data;
  }

  // ---------- 作答卡：一張圖看完一份作答 ----------
  function wrapText(g, str, maxWidth) {
    const lines = [];
    for (const para of String(str || '').split('\n')) {
      let line = '';
      for (const ch of para) { if (line && g.measureText(line + ch).width > maxWidth) { lines.push(line); line = ch; } else line += ch; }
      lines.push(line);
    }
    return lines;
  }
  function makeCard(t, data, shot) {
    const W = 1100, pad = 44, inner = W - pad * 2, font = s => s + 'px "Microsoft JhengHei","Noto Sans TC",sans-serif';
    const probe = document.createElement('canvas').getContext('2d');
    const blocks = [];  // [kind, text/size]
    const add = (kind, text, size, color) => { probe.font = font(size); wrapText(probe, text, inner).forEach(l => blocks.push({ kind, text: l, size, color })); };
    add('q', t.q, 20, '#5d7b86');
    blocks.push({ kind: 'gap', h: 14 });
    t.fields.forEach(f => add('f', f.label + '：' + (data.fields[f.key] || '（未填）'), 24, data.fields[f.key] ? '#153f4d' : '#a25a00'));
    if (data.arrangement) add('f', '排列檢查：' + data.arrangement.label, 24, data.arrangement.label === '正確' ? '#0a7d4f' : '#a25a00');
    blocks.push({ kind: 'gap', h: 14 });
    add('h', t.reasonLabel || '我的回答', 22, '#087c91');
    add('a', data.answer || '（未填寫）', 24, '#153f4d');
    const lineH = b => b.kind === 'gap' ? b.h : Math.round(b.size * 1.6);
    const figH = t.figure === 'abcd' ? 230 : 0;
    const shotH = shot ? Math.round(shot.height * inner / shot.width) : 0;
    const headH = 128, textH = blocks.reduce((s, b) => s + lineH(b), 0);
    const c = document.createElement('canvas'); c.width = W; c.height = headH + figH + textH + (shot ? shotH + 30 : 0) + pad;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, c.height);
    g.fillStyle = '#087c91'; g.fillRect(0, 0, W, 62);
    g.fillStyle = '#fff'; g.font = font(26); g.textBaseline = 'middle'; g.fillText('第 ' + data.taskNo + ' 題　' + t.title, pad, 32);
    g.fillStyle = '#153f4d'; g.font = font(26);
    const who = data.cls + ' 班　' + data.seat + ' 號' + (data.group ? '　第 ' + data.group + ' 組' : '') + (data.name ? '　' + data.name : '');
    g.fillText(who, pad, 96);
    g.fillStyle = '#5d7b86'; g.font = font(18); g.textAlign = 'right';
    g.fillText(new Date().toLocaleString('zh-TW', { hour12: false }), W - pad, 96); g.textAlign = 'left';
    let y = headH;
    if (figH) {
      const sets = [['A', 0], ['B', 0.25], ['C', 0.6], ['D', -0.5]], cw = inner / 4;
      sets.forEach(([k, m], i) => {
        const cx = pad + cw * i + cw / 2, cy = y + 85, u = 17;
        g.strokeStyle = '#153f4d'; g.lineWidth = 2;
        for (let n = 0; n < 4; n++) { g.beginPath(); g.arc(cx + m * n * u, cy, (4 - n) * u, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = '#153f4d'; g.beginPath(); g.arc(cx + m * 4 * u, cy, 3, 0, Math.PI * 2); g.fill();
        g.font = font(22); g.textAlign = 'center'; g.fillText(k + '：' + (data.fields[k] || '—'), cx, cy + 105); g.textAlign = 'left';
      });
      y += figH;
    }
    for (const b of blocks) {
      if (b.kind !== 'gap') { g.font = font(b.size); g.fillStyle = b.color; g.fillText(b.text, pad, y + lineH(b) / 2); }
      y += lineH(b);
    }
    if (shot) { y += 30; g.drawImage(shot, pad, y, inner, shotH); g.strokeStyle = '#cddfe3'; g.lineWidth = 1; g.strokeRect(pad, y, inner, shotH); }
    return c;
  }
  async function send(data) {
    const url = gasUrl(), body = JSON.stringify(data);
    let reply = null;
    try {
      const res = await fetch(url, { method: 'POST', body, redirect: 'follow' });
      reply = JSON.parse(await res.text());
    } catch (_) {
      // 讀不到回覆（跨網域被擋或回覆不是 JSON）：改用不讀回覆的方式再送一次
      await fetch(url, { method: 'POST', body, mode: 'no-cors' });
      return { confirmed: false };
    }
    if (!reply || !reply.ok) throw new Error((reply && reply.error) || '老師端回覆錯誤');
    return { confirmed: true, reply };
  }
  $('submit').addEventListener('click', async () => {
    if (!gasUrl()) { setStatus('尚未設定收集網址，請用下載', 'warn'); return; }
    if (!$('cls').value.trim() || !$('seat').value.trim()) { setStatus('請填班級、座號', 'warn'); ($('seat').value ? $('cls') : $('seat')).focus(); return; }
    const t = tasks[Lab.taskIndex], data = payload();
    const filled = Object.values(data.fields).filter(Boolean).length;
    if (!filled && !data.answer) { setStatus('還沒作答', 'warn'); return; }
    if (t.check && data.arrangement && data.arrangement.label === '未完成' && !confirm('水波還沒排完（' + data.arrangement.placed + '/' + data.arrangement.total + '），仍要送出？')) return;
    $('submit').disabled = true; setStatus('傳送中…');
    try {
      const r = await send(data);
      const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
      setStatus('✓ 已送出（' + time + '）', 'ok');
      Lab.status('已送出第 ' + data.taskNo + ' 題');
    } catch (err) {
      setStatus('沒送出，請再按一次', 'warn');
    } finally { $('submit').disabled = false; }
  });

  // ---------- 教師設定 ----------
  if ($('gas-url')) {
    $('gas-url').value = gasUrl();
    const note = t => { $('gas-note').textContent = t; };
    note(gasUrl() ? '目前會送到：' + gasUrl().slice(0, 60) + '…' : '尚未設定，學生按「送出給老師」會提示改用下載。');
    $('gas-save').addEventListener('click', () => {
      const v = $('gas-url').value.trim();
      if (v && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(v)) { note('網址格式應為 https://script.google.com/macros/s/…/exec'); return; }
      store.set(KEY_URL, v); note(v ? '已儲存在這台裝置。發給學生的連結：' + location.origin + location.pathname + '?gas=' + encodeURIComponent(v) : '已清除。');
    });
    $('gas-test').addEventListener('click', async () => {
      const v = $('gas-url').value.trim() || gasUrl();
      if (!v) { note('請先貼上網址。'); return; }
      note('測試中…');
      try { const r = await (await fetch(v + (v.includes('?') ? '&' : '?') + 'ping=1')).json(); note(r.ok ? '✓ 連線成功：' + (r.sheet || r.service) : '連線有回應，但內容不正確。'); }
      catch (_) { note('無法讀取回覆。請確認部署時「誰可以存取」選「任何人」，網址是 /exec 結尾。'); }
    });
  }
})();
