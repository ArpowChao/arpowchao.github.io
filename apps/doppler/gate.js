// 老師控制開放哪些題目：定時向 Apps Script 詢問，題目選單只留下老師開放的題目。
// 老師沒設定（或連不到）時不限制；最後一次收到的狀態存在這台裝置，重新整理也不會閃出還沒開放的題目。
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const Lab = window.DopplerLab, sel = $('task');
  if (!Lab || !sel) return;
  const tasks = Lab.tasks, T = s => (window.T || String)(s);
  const KEY = 'doppler-gate-v1', EVERY = 10000;
  const read = (k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (_) { return f; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 只保留在這次 */ } };
  const url = () => (read('doppler-gas-url', '') || window.DOPPLER_GAS_URL || '').trim();
  const cls = () => (($('cls') && $('cls').value) || read('doppler-identity-v1', {}).cls || '').trim();

  let open = read(KEY, null), timer = null, toastEl = null;
  const isOpen = i => open === null || open.indexOf(tasks[i].id) >= 0;
  const openIdx = () => tasks.map((_, i) => i).filter(isOpen);

  function syncFs() { if (Lab.renderTaskSelect) Lab.renderTaskSelect(); }
  function go(i) {
    if (String(i) === sel.value && Lab.taskIndex === i) return;
    sel.value = String(i); sel.dispatchEvent(new Event('change')); syncFs();
  }
  function toast(msg, act) {
    if (toastEl) toastEl.remove();
    const el = document.createElement('div'); el.className = 'gate-toast'; el.setAttribute('role', 'status');
    const s = document.createElement('span'); s.textContent = msg; el.append(s);
    if (act) { const b = document.createElement('button'); b.type = 'button'; b.textContent = act.label; b.addEventListener('click', () => { act.run(); el.remove(); }); el.append(b); }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'gate-x'; x.setAttribute('aria-label', T('關閉')); x.textContent = '✕';
    x.addEventListener('click', () => el.remove()); el.append(x);
    (document.fullscreenElement || document.webkitFullscreenElement || document.body).append(el);
    toastEl = el;
    if (act) setTimeout(() => { if (toastEl === el) el.remove(); }, 20000);
  }
  const name = i => (tasks[i].n ? tasks[i].n + '　' : '') + T(tasks[i].title);

  function apply(prev) {
    const list = openIdx(), cur = Lab.taskIndex;
    Lab.setTaskFilter(isOpen);
    const waiting = !list.length;
    document.body.classList.toggle('gate-waiting', waiting);
    if ($('submit')) $('submit').disabled = waiting;
    let wait = $('gate-wait');
    if (waiting && !wait) {
      wait = document.createElement('p'); wait.id = 'gate-wait'; wait.className = 'gate-wait';
      wait.textContent = T('老師還沒開放題目，可以先自由操作水面。');
      sel.insertAdjacentElement('afterend', wait);
    }
    if (wait) wait.hidden = !waiting;
    if (!waiting) {
      if (list.indexOf(cur) < 0) go(list[list.length - 1]);   // 目前這題被關了：跳到最新開放的題目
      else sel.value = String(cur);
    }
    syncFs();
    // 新開放的題目：提示學生前往（之前完全沒有題目時直接跳過去）
    if (prev !== undefined) {
      const before = prev === null ? tasks.map(t => t.id) : prev;
      const fresh = list.filter(i => before.indexOf(tasks[i].id) < 0);
      if (fresh.length) {
        const i = fresh[fresh.length - 1];
        if (!before.length) { go(i); toast(T('老師開放了題目：') + name(i)); }
        else if (i !== Lab.taskIndex) toast(T('老師開放了新題目：') + name(i), { label: T('前往 ▸'), run: () => go(i) });
      }
    }
  }

  async function poll() {
    clearTimeout(timer);
    const u = url();
    if (u) {
      try {
        const r = await (await fetch(u + (u.includes('?') ? '&' : '?') + 'view=open&cls=' + encodeURIComponent(cls()), { cache: 'no-store' })).json();
        if (r && r.ok && JSON.stringify(r.open) !== JSON.stringify(open)) { const prev = open; open = r.open; write(KEY, open); apply(prev); }
      } catch (_) { /* 連不到時維持上一次的狀態 */ }
    }
    if (!document.hidden) timer = setTimeout(poll, EVERY + Math.random() * 3000);
  }

  apply();
  poll();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  if ($('cls')) $('cls').addEventListener('change', poll);
  document.addEventListener('doppler:lang', () => setTimeout(() => { syncFs(); const w = $('gate-wait'); if (w) w.textContent = T('老師還沒開放題目，可以先自由操作水面。'); }, 0));
  window.DopplerGate = { poll, get open() { return open; } };
})();
