'use strict';

const $ = id => document.getElementById(id);
const seedClasses = JSON.parse($('initial-classes')?.textContent ?? '[]');
const presetClasses = JSON.parse($('preset-class-seats')?.textContent ?? '[]').map(({ id, label, seats }) => ({
  id, label, roster: seats.map(seat => ({ seat, name: '' })), history: [],
}));
const storageSuffix = seedClasses.length ? '-offline' : '';
const dataKey = 'lucky-lab-data-v2' + storageSuffix;
const legacyDataKey = 'lucky-lab-data-v1';
const settingsKey = 'lucky-lab-settings-v1' + storageSuffix;
const modes = {
  wheel: { title: '好運轉盤' },
  quick: { title: '快速揭曉', symbol: '⚡︎' },
  rule: { title: '數學任務', symbol: '×' },
};
const policyHelp = {
  exclude: '每位同學在清空紀錄前只會中籤一次。',
  keep: '抽過的同學和其他人一樣，每輪都有相同的中籤機會。',
  lower: '每次中籤後，下一輪的權重會乘以下面的保留比例。',
};
const defaultSettings = {
  mode: 'wheel', policy: 'exclude', count: 1, weight: 50, classId: '',
  ruleType: 'arithmetic', ruleSource: 'day', ruleBSource: 'custom', ruleDate: '', ruleA: 1, ruleB: 2,
};
const starterClass = {
  id: 'custom', label: '自訂名單',
  roster: Array.from({ length: 30 }, (_, index) => ({ seat: index + 1, name: '' })), history: [],
};
const legacy = seedClasses.length ? null : readStored(legacyDataKey, null);
const initialData = { classes: seedClasses.length ? seedClasses : [...presetClasses, { ...starterClass, ...legacy }] };
const taipeiDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', dateStyle: 'short' });
const taipeiTime = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'medium', timeStyle: 'short' });
const taipeiClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pages = [...document.querySelectorAll('.page')];
const navLinks = [...document.querySelectorAll('nav [data-page]')];
const modeRadios = [...document.querySelectorAll('input[name="mode"]')];
const stageSettings = $('stage-settings');
const settingsToggle = $('settings-toggle');
const settingsHome = stageSettings.parentElement;
const fullscreenControls = $('fullscreen-controls');
const fullscreenOperations = $('fullscreen-operations');
const classPicker = $('class-picker');
const drawActions = $('stage-actions');
const drawActionsHome = drawActions.parentElement;
const visualStage = $('visual-stage');
const stageTrigger = $('stage-trigger');
const stageExit = $('stage-exit');
const settingsInputs = {
  policy: $('policy'), count: $('count'), weight: $('weight'), ruleType: $('rule-type'), ruleSource: $('rule-source'),
  ruleBSource: $('rule-b-source'), ruleDate: $('rule-date'), ruleA: $('rule-a'), ruleB: $('rule-b'),
};
const colors = [
  ['#6438c8', '#fff'], ['#b894ff', '#2c155a'], ['#f4a8c5', '#461b44'],
  ['#7848df', '#fff'], ['#ffe092', '#48301c'], ['#88d9b9', '#194b3a'],
];
const canvas = $('wheel');
const spinDuration = 1750;
let data = readClassData();
let settings = { ...defaultSettings, ...readStored(settingsKey, {}) };
let drawing = false;
let importing = false;
let currentPage = '';
let currentPool = [];
let wheelPoolKey = '';
let wheelRotation = 0;
let confettiTimer;

function activeClass(snapshot = data) {
  return snapshot.classes.find(entry => entry.id === settings.classId) ?? snapshot.classes[0];
}

function updateClass(snapshot, changed) {
  return { ...snapshot, classes: snapshot.classes.map(entry => entry.id === changed.id ? changed : entry) };
}

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) ?? fallback : fallback;
  } catch {
    $('storage-warning').hidden = false;
    return fallback;
  }
}

function saveStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    $('storage-warning').hidden = false;
  }
}

function readClassData(fallback = initialData) {
  const saved = readStored(dataKey, fallback);
  const missing = presetClasses.filter(preset => !saved.classes.some(entry => entry.id === preset.id));
  return missing.length ? { ...saved, classes: [...saved.classes, ...missing] } : saved;
}

function changeData(update) {
  const apply = () => {
    const previous = $('storage-warning').hidden ? readClassData(data) : data;
    const next = update(previous);
    if (next !== previous) saveStored(dataKey, next);
    data = next;
  };
  return navigator.locks?.request ? navigator.locks.request(dataKey, apply) : Promise.resolve().then(apply);
}

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content) element.textContent = content;
  return element;
}

function studentLabel(student) {
  return `${student.seat} 號${student.name ? ` ${student.name}` : ''}`;
}

function studentItem(student, className) {
  const item = node('li', className);
  item.append(node('span', 'seat', `${student.seat} 號`));
  if (student.name) item.append(node('span', '', student.name));
  return item;
}

function route() {
  const requested = location.hash.slice(1);
  const page = pages.some(section => section.id === requested) ? requested : 'stage';
  const previous = currentPage;
  currentPage = page;
  for (const section of pages) section.hidden = section.id !== page;
  $('fullscreen-button').hidden = page !== 'stage';
  for (const link of navLinks) {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (page !== 'stage') {
    stageSettings.open = false;
    if (document.documentElement.dataset.display) void toggleFullscreen();
  }
  if (previous && previous !== page) window.scrollTo(0, 0);
}

function rosterText(roster) {
  return roster.map(student => [student.seat, student.name].filter(Boolean).join(' ')).join('\n');
}

function syncRosterEditor() {
  $('roster-input').value = rosterText(activeClass().roster);
}

function renderRoster() {
  const { id, label, roster } = activeClass();
  classPicker.hidden = data.classes.length < 2;
  $('active-class').replaceChildren(...data.classes.map(entry => new Option(entry.label, entry.id)));
  $('active-class').value = id;
  $('roster-summary').textContent = `${label} · 共 ${roster.length} 位同學`;
  $('student-list').replaceChildren(...roster.map(student => studentItem(student, 'student')));
}

function renderHistory() {
  const { history } = activeClass();
  $('clear-history').disabled = drawing || !history.length;
  const panel = $('history-panel');
  if (!history.length) {
    panel.replaceChildren(node('p', '', '第一輪抽籤結果會出現在這裡。'));
    return;
  }
  const list = node('ol', 'history-list');
  list.reversed = true;
  const entries = history.slice().reverse().map((round, index) => {
    const item = node('li', 'history-entry');
    const heading = node('h2', '', `第 ${history.length - index} 輪 · ${modes[round.mode].title}`);
    const time = node('time', '', taipeiTime.format(new Date(round.time)));
    time.dateTime = round.time;
    const winners = node('ul');
    winners.append(...round.winners.map(student => studentItem(student, 'winner')));
    item.append(heading, time);
    if (round.ruleSummary) item.append(node('p', '', round.ruleSummary));
    item.append(winners);
    return item;
  });
  list.append(...entries);
  panel.replaceChildren(list);
}

function renderResult(round, animate = false) {
  const panel = $('result-panel');
  const list = $('result-list');
  panel.hidden = !round;
  const label = round ? '再抽一次' : '開始抽籤';
  $('draw-label').textContent = label;
  stageTrigger.textContent = label;
  if (!round) {
    $('confetti').replaceChildren();
    clearTimeout(confettiTimer);
    return;
  }
  panel.dataset.single = String(round.winners.length === 1);
  panel.dataset.animate = String(animate && !reducedMotion.matches);
  list.tabIndex = round.winners.length > 1 ? 0 : -1;
  $('result-detail').textContent = [modes[round.mode].title, `抽出 ${round.winners.length} 位同學`, round.ruleSummary].filter(Boolean).join(' · ');
  list.replaceChildren(...round.winners.map((student, index) => {
    const card = node('li', 'stage-winner');
    const seat = `${student.seat} 號`;
    const name = node('strong', 'stage-name', student.name || seat);
    name.dataset.long = String([...student.name].length > 8);
    if (student.name) card.append(node('span', 'stage-seat', seat));
    card.append(name);
    card.style.setProperty('--reveal-delay', `${Math.min(index, 8) * 45}ms`);
    return card;
  }));
  list.scrollTop = 0;
}

function activeRule(clock) {
  if (settings.mode !== 'rule') return null;
  return LuckyDraw.buildRule({
    type: settings.ruleType, source: settings.ruleSource, bSource: settings.ruleBSource, date: $('rule-date').value,
    time: clock, a: $('rule-a').valueAsNumber, b: $('rule-b').valueAsNumber,
  });
}

function ruleSourceKinds(type) {
  const sources = type.second ? [settings.ruleSource, settings.ruleBSource] : [settings.ruleSource];
  return {
    date: sources.some(source => source !== 'custom' && !LuckyDraw.isClockSource(source)),
    clock: sources.some(LuckyDraw.isClockSource),
  };
}

function availability(rosterData, clock) {
  const rule = activeRule(clock);
  const wins = LuckyDraw.winCounts(rosterData.history);
  const matching = rule?.error ? [] : LuckyDraw.candidates(rosterData.roster, wins, 'keep', rule);
  const pool = LuckyDraw.candidates(matching, wins, settings.policy);
  return { pool, matching, wins, rule };
}

function drawProblem(pool, count, rule) {
  if (rule?.error) return '請先修正數學規則。';
  if (!pool.length) return settings.mode === 'rule' ? '沒有可抽的座號，請調整規則或中籤設定。' : '本輪沒有可抽的同學。可切換中籤設定或清空紀錄。';
  if (!Number.isInteger(count) || count < 1) return '請輸入大於或等於 1 的整數。';
  if (count > pool.length) return `目前只有 ${pool.length} 人可抽，請減少人數。`;
  return '';
}

function renderControls(updateWheel = true, clock = taipeiClock.format()) {
  const { pool, matching, rule } = availability(activeClass(), clock);
  currentPool = pool;
  const mode = modes[settings.mode];
  $('mode-title').textContent = mode.title;
  visualStage.dataset.mode = settings.mode;
  $('wheel-wrap').hidden = settings.mode !== 'wheel';
  $('mode-art').hidden = settings.mode === 'wheel';
  $('art-symbol').textContent = mode.symbol ?? '';
  $('available-count').textContent = `${pool.length} 人可抽`;
  $('available-count').dataset.empty = String(!pool.length);

  const count = $('count').valueAsNumber;
  const problem = drawProblem(pool, count, rule);
  $('draw-note').textContent = drawing ? '正在揭曉本輪得主…' : importing ? '正在讀取班級名單…' : problem || `每輪抽出 ${count} 位同學 · 每人最多中籤一次`;
  $('draw-note').dataset.error = String(!drawing && !importing && Boolean(problem));
  const drawDisabled = drawing || importing || Boolean(problem);
  $('draw-button').disabled = drawDisabled;
  stageTrigger.setAttribute('aria-disabled', String(drawDisabled));
  visualStage.dataset.canDraw = String(!drawDisabled);
  $('count-minus').disabled = drawing || (Number.isFinite(count) && count <= 1);
  $('count-plus').disabled = drawing || (Number.isFinite(count) ? count >= pool.length : pool.length === 0);
  $('policy-help').textContent = policyHelp[settings.policy];
  $('weight-setting').hidden = settings.policy !== 'lower';
  $('weight-output').value = `${settings.weight}%`;
  $('rule-panel').hidden = settings.mode !== 'rule';
  $('mode-options').disabled = drawing;
  settingsToggle.setAttribute('aria-disabled', String(drawing));
  $('active-class').disabled = drawing;
  $('import-roster').disabled = drawing || importing;
  for (const field of Object.values(settingsInputs)) field.disabled = drawing;

  if (rule) {
    const type = LuckyDraw.ruleTypes[settings.ruleType];
    const used = ruleSourceKinds(type);
    $('rule-a-label').textContent = type.first;
    $('rule-b-label').textContent = type.second ?? '';
    $('rule-source-label').textContent = `${type.first}來源`;
    $('rule-b-source-label').textContent = `${type.second ?? ''}來源`;
    $('rule-b-source-setting').hidden = !type.second;
    $('rule-date-setting').hidden = !used.date;
    $('rule-clock').hidden = !used.clock;
    if (used.clock) {
      $('clock-time').textContent = clock;
      $('clock-time').dateTime = clock;
    }
    $('rule-a-setting').hidden = settings.ruleSource !== 'custom';
    $('rule-b-setting').hidden = !type.second || settings.ruleBSource !== 'custom';
    const seats = matching.slice(0, 16).map(student => student.seat).join('、');
    const preview = matching.length ? `。符合 ${matching.length} 人（${seats}${matching.length > 16 ? ' 等' : ''} 號）` : '。沒有座號符合這個規則';
    $('rule-preview').textContent = rule.error || `${rule.label}${preview}。`;
    $('rule-preview').dataset.error = String(Boolean(rule.error));
  }
  if (settings.mode === 'wheel' && updateWheel) renderWheel(pool);
}

function sectorCount(poolLength) {
  if (!poolLength) return 6;
  return poolLength <= 36 ? poolLength : 18;
}

function renderWheel(pool) {
  const key = pool.map(student => student.seat).join(',');
  if (key === wheelPoolKey && canvas.dataset.ready) return;
  wheelPoolKey = key;
  canvas.dataset.ready = 'true';
  wheelRotation = 0;
  canvas.style.transform = 'rotate(0deg)';
  const context = canvas.getContext('2d');
  if (!context) return;
  const radius = 360;
  const scale = canvas.width / (radius * 2);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const sectors = sectorCount(pool.length);
  const step = 2 * Math.PI / sectors;
  context.clearRect(0, 0, radius * 2, radius * 2);
  for (let index = 0; index < sectors; index += 1) {
    const [fill, ink] = colors[index % colors.length];
    const center = index * step - Math.PI / 2;
    context.beginPath();
    context.moveTo(radius, radius);
    context.arc(radius, radius, radius, center - step / 2, center + step / 2);
    context.closePath();
    context.fillStyle = pool.length ? fill : '#e0d1f4';
    context.fill();
    if (sectors > 1) {
      context.lineWidth = 2;
      context.strokeStyle = '#ffffffb8';
      context.stroke();
    }
    if (pool.length && pool.length <= 36) {
      context.save();
      context.translate(radius, radius);
      context.rotate(center + Math.PI / 2);
      context.fillStyle = ink;
      context.font = `800 ${sectors > 24 ? 32 : 39}px system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(pool[index].seat), 0, -radius * .85, Math.min(84, step * radius * .73));
      context.restore();
    }
  }
}

async function spinWheel(pool, winner) {
  renderWheel(pool);
  const sectors = sectorCount(pool.length);
  const index = pool.indexOf(winner);
  const sector = Math.floor(index * sectors / pool.length);
  const target = (360 - 360 * sector / sectors) % 360;
  const start = wheelRotation;
  const end = start + 360 * 4 + (target - start % 360 + 360) % 360;
  if (!reducedMotion.matches) {
    const animation = canvas.animate([
      { transform: `rotate(${start}deg)` }, { transform: `rotate(${end}deg)` },
    ], { duration: spinDuration, easing: 'cubic-bezier(.17,.68,.16,1)', fill: 'forwards' });
    await animation.finished;
    canvas.style.transform = `rotate(${target}deg)`;
    animation.cancel();
  } else {
    canvas.style.transform = `rotate(${target}deg)`;
  }
  wheelRotation = target;
}

function celebrate() {
  if (reducedMotion.matches) return;
  const container = $('confetti');
  const pieces = Array.from({ length: 48 }, (_, index) => {
    const piece = node('i');
    const direction = index < 24 ? -1 : 1;
    const spread = Math.random() * 140 - 45;
    piece.style.setProperty('--origin', direction < 0 ? '26%' : '74%');
    piece.style.setProperty('--x', `${direction * spread}px`);
    piece.style.setProperty('--y', `${30 - Math.random() * 215}px`);
    piece.style.setProperty('--r', `${direction * (120 + index % 6 * 67)}deg`);
    piece.style.setProperty('--color', colors[index % colors.length][0]);
    piece.style.setProperty('--delay', `${index % 6 * 17}ms`);
    return piece;
  });
  container.replaceChildren(...pieces);
  clearTimeout(confettiTimer);
  confettiTimer = setTimeout(() => container.replaceChildren(), 1250);
}

function announce(message) {
  $('announcement').textContent = message;
}

function setDisplay(mode) {
  const { dataset } = document.documentElement;
  if ((dataset.display ?? '') === mode) return;
  stageSettings.open = false;
  if (mode) dataset.display = mode;
  else delete dataset.display;
  stageTrigger.hidden = !mode;
  fullscreenControls.hidden = !mode;
  fullscreenOperations.hidden = !mode;
  $('settings-label').textContent = mode ? '操作' : '抽籤設定';
  if (mode) {
    fullscreenControls.append(stageSettings);
    $('fullscreen-class-slot').append(classPicker);
    $('fullscreen-draw-slot').append(drawActions);
    stageTrigger.focus({ preventScroll: true });
  } else {
    settingsHome.append(stageSettings);
    $('fullscreen-button').before(classPicker);
    drawActionsHome.append(drawActions);
    $('fullscreen-button').focus({ preventScroll: true });
  }
}

function syncFullscreen() {
  if (document.fullscreenElement === visualStage) setDisplay('fullscreen');
  else if (document.documentElement.dataset.display === 'fullscreen') setDisplay('');
}

async function toggleFullscreen() {
  const root = document.documentElement;
  if (root.dataset.display === 'projector') {
    setDisplay('');
    return;
  }
  const button = $('fullscreen-button');
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (document.fullscreenElement === visualStage) {
      try {
        await document.exitFullscreen();
        syncFullscreen();
      } catch {
        announce('請按 Esc 退出全螢幕。');
      }
      return;
    }
    if (currentPage !== 'stage') return;
    if (document.fullscreenEnabled && visualStage.requestFullscreen) {
      try {
        await visualStage.requestFullscreen();
        syncFullscreen();
        if (document.fullscreenElement === visualStage) return;
      } catch {
        // Embedded browsers can block native fullscreen.
      }
    }
    setDisplay('projector');
    announce('已切換到投影舞台。右側可展開操作。按空白鍵抽籤，按 Esc 退出。');
  } finally {
    button.disabled = false;
    if (!root.dataset.display && currentPage === 'stage') button.focus({ preventScroll: true });
  }
}

async function draw() {
  if (drawing || importing) return;
  const startedAt = new Date();
  const clock = taipeiClock.format(startedAt);
  drawing = true;
  stageSettings.open = false;
  if (document.documentElement.dataset.display) stageTrigger.focus({ preventScroll: true });
  $('clear-history').disabled = true;
  visualStage.classList.add('is-drawing');
  renderControls();
  let round;
  let drawingPool;
  try {
    await changeData(previous => {
      const selected = activeClass(previous);
      const { pool, wins, rule } = availability(selected, clock);
      const count = $('count').valueAsNumber;
      const problem = drawProblem(pool, count, rule);
      if (problem) {
        announce(problem);
        return previous;
      }
      const mode = settings.mode;
      const winners = LuckyDraw.pick(pool, count, wins, settings.policy, settings.weight);
      const type = LuckyDraw.ruleTypes[settings.ruleType];
      const used = ruleSourceKinds(type);
      const ruleSummary = rule ? [type.title, rule.label, used.date && $('rule-date').value, used.clock && `臺灣時間 ${clock}`].filter(Boolean).join(' · ') : '';
      drawingPool = pool;
      round = { time: startedAt.toISOString(), mode, ruleSummary, winners };
      return updateClass(previous, { ...selected, history: [...selected.history, round] });
    });
    if (!round) return;
    renderResult(null);
    if (round.mode === 'wheel') await spinWheel(drawingPool, round.winners[0]);
    if (!reducedMotion.matches) await new Promise(resolve => setTimeout(resolve, round.mode === 'wheel' ? 160 : 380));
  } finally {
    drawing = false;
    visualStage.classList.remove('is-drawing');
    renderControls(!round);
    renderRoster();
    renderHistory();
    if (round) {
      renderResult(activeClass().history.at(-1), currentPage === 'stage');
      if (currentPage === 'stage') {
        celebrate();
        if (!document.documentElement.dataset.display) visualStage.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
      const names = round.winners.slice(0, 12).map(studentLabel).join('、');
      announce(`抽出 ${round.winners.length} 位同學。${names}${round.winners.length > 12 ? ' 等。' : '。'}`);
    }
  }
}

for (const [name, field] of Object.entries(settingsInputs)) {
  const numeric = field.type === 'number' || field.type === 'range';
  field.value = name === 'ruleDate' ? settings.ruleDate || taipeiDate.format(new Date()) : settings[name] ?? '';
  field.addEventListener('input', () => {
    settings[name] = numeric ? (Number.isFinite(field.valueAsNumber) ? field.valueAsNumber : null) : field.value;
    saveStored(settingsKey, settings);
    renderControls();
  });
}
for (const radio of modeRadios) {
  radio.checked = radio.value === settings.mode;
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    settings.mode = radio.value;
    saveStored(settingsKey, settings);
    renderResult(null);
    renderControls();
  });
}

function stepCount(delta) {
  const start = Math.trunc($('count').valueAsNumber || 1);
  const limit = delta > 0 ? Math.max(1, currentPool.length) : LuckyDraw.maxSeat;
  $('count').value = Math.max(1, Math.min(limit, start + delta));
  $('count').dispatchEvent(new Event('input'));
}

function selectClass(id) {
  settings.classId = id;
  saveStored(settingsKey, settings);
  $('roster-message').hidden = true;
  syncRosterEditor();
  renderRoster();
  renderControls();
  renderHistory();
  renderResult(activeClass().history.at(-1));
}

async function importRoster(file) {
  importing = true;
  renderControls();
  const message = $('import-message');
  message.hidden = false;
  message.dataset.error = 'false';
  message.textContent = '正在讀取班級名單…';
  try {
    const imported = await ClassWorkbook.read(file);
    await changeData(previous => {
      const classes = new Map(previous.classes.map(entry => [entry.id, entry]));
      for (const entry of imported) {
        const history = classes.get(entry.id)?.history ?? [];
        classes.set(entry.id, { ...entry, history });
      }
      return { classes: [...classes.values()] };
    });
    const selected = imported.find(entry => entry.id === settings.classId) ?? imported[0];
    selectClass(selected.id);
    const total = imported.reduce((sum, entry) => sum + entry.roster.length, 0);
    message.textContent = `已匯入 ${imported.length} 個班級，共 ${total} 位同學。`;
  } catch (error) {
    message.dataset.error = 'true';
    message.textContent = error.message || '讀取名單時發生錯誤，請重新選擇 Excel 檔案。';
  } finally {
    importing = false;
    renderControls();
  }
}

$('count-minus').addEventListener('click', () => stepCount(-1));
$('count-plus').addEventListener('click', () => stepCount(1));
$('draw-button').addEventListener('click', draw);
$('fullscreen-button').addEventListener('click', toggleFullscreen);
stageExit.addEventListener('click', toggleFullscreen);
visualStage.addEventListener('click', event => {
  if (!document.documentElement.dataset.display || fullscreenControls.contains(event.target) ||
      (event.target.closest('button') && event.target !== stageTrigger)) return;
  stageTrigger.focus({ preventScroll: true });
  if (!$('draw-button').disabled) void draw();
});
document.addEventListener('fullscreenchange', syncFullscreen);
settingsToggle.addEventListener('click', event => {
  if (drawing) event.preventDefault();
});
document.addEventListener('click', event => {
  if (stageSettings.open && !stageSettings.contains(event.target)) stageSettings.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]') ||
      event.target.closest?.('input, select, textarea, [contenteditable]')) return;
  if (stageSettings.open) {
    stageSettings.open = false;
    settingsToggle.focus({ preventScroll: true });
    event.preventDefault();
  } else if (document.documentElement.dataset.display === 'projector') {
    setDisplay('');
  }
});
$('close-result').addEventListener('click', () => {
  renderResult(null);
  const nextFocus = $('draw-button').disabled ? $('mode-options').querySelector(':checked') : $('draw-button');
  nextFocus?.focus({ preventScroll: true });
});
$('active-class').addEventListener('change', event => selectClass(event.target.value));
$('import-roster').addEventListener('click', () => $('roster-file').click());
$('roster-file').addEventListener('change', event => {
  const [file] = event.target.files;
  event.target.value = '';
  if (file && !importing) importRoster(file);
});
$('roster-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = $('roster-message');
  try {
    const roster = LuckyDraw.parseRoster($('roster-input').value);
    const id = activeClass().id;
    await changeData(previous => {
      const selected = previous.classes.find(entry => entry.id === id);
      return selected ? updateClass(previous, { ...selected, roster }) : previous;
    });
    message.textContent = `已儲存 ${roster.length} 位同學。`;
    message.dataset.error = 'false';
    syncRosterEditor();
    renderRoster();
    renderControls(!drawing);
  } catch (error) {
    message.textContent = error.message;
    message.dataset.error = 'true';
  }
  message.hidden = false;
});
$('roster-input').addEventListener('input', () => { $('roster-message').hidden = true; });
$('clear-history').addEventListener('click', () => {
  $('clear-dialog').returnValue = '';
  $('clear-dialog').showModal();
});
$('clear-dialog').addEventListener('close', async event => {
  if (event.target.returnValue !== 'clear') return;
  const id = activeClass().id;
  await changeData(previous => {
    const selected = previous.classes.find(entry => entry.id === id);
    return selected ? updateClass(previous, { ...selected, history: [] }) : previous;
  });
  renderResult(null);
  renderHistory();
  renderControls();
  announce('已清空抽籤紀錄。');
});
window.addEventListener('hashchange', route);
window.addEventListener('storage', event => {
  if (event.key !== dataKey) return;
  const editor = $('roster-input');
  const savedText = rosterText(activeClass().roster);
  data = readClassData();
  if (editor.value === savedText) syncRosterEditor();
  renderRoster();
  if (drawing) return;
  renderControls();
  renderHistory();
  renderResult(activeClass().history.at(-1));
});

syncRosterEditor();
route();
renderRoster();
renderControls();
renderHistory();
renderResult(activeClass().history.at(-1));

setInterval(() => {
  if (drawing || currentPage !== 'stage' || settings.mode !== 'rule' || $('rule-clock').hidden) return;
  const clock = taipeiClock.format();
  if ($('clock-time').dateTime !== clock) renderControls(false, clock);
}, 1000);
