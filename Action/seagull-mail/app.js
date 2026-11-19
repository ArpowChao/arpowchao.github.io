(function () {
  'use strict';

  const CFG = window.SEAGULL_CONFIG || {};
  const FALLBACK_PUBLIC_URL = 'https://arpowchao.github.io/Action/seagull-mail/';
  const LS_GAS_KEY = 'seagull_gas_url_v1';
  const LS_DEMO_KEY = 'seagull_demo_letters_v1';
  const LS_CLIENT_ID = 'seagull_client_id_v1';

  const DEFAULT_GROUPS = [
    { id: 'ai', name: '智慧互動組', color: '#2b7de9', stamp: '波' },
    { id: 'physics', name: '物理實驗組', color: '#0d9488', stamp: '光' },
    { id: 'green', name: '永續綠能組', color: '#16a34a', stamp: '風' },
    { id: 'design', name: '創意設計組', color: '#e66a2c', stamp: '帆' },
    { id: 'all', name: '給全體專題', color: '#d94862', stamp: '海' }
  ];

  const DEFAULT_AVATARS = [
    { id: 'sailor', name: '水手帽海鷗', tagline: '準時遞送每一道海風' },
    { id: 'shades', name: '墨鏡酷海鷗', tagline: '今天海邊陽光特別刺眼' },
    { id: 'fries', name: '薯條貪吃鷗', tagline: '送完信可以分我一根嗎' },
    { id: 'straw', name: '草帽度假鷗', tagline: '從湘南海岸悠閒飛過來' },
    { id: 'scarf', name: '點點領巾鷗', tagline: '帶著滿滿祝福飛向大家' }
  ];

  const GROUPS = Array.isArray(CFG.groups) && CFG.groups.length ? CFG.groups : DEFAULT_GROUPS;
  const AVATARS = Array.isArray(CFG.avatars) && CFG.avatars.length ? CFG.avatars : DEFAULT_AVATARS;
  const MAX_LEN = Number(CFG.maxBodyLength) || 120;
  const POLL_MS = Math.max(5000, Number(CFG.pollIntervalMs) || 12000);
  const ROTATE_MS = Math.max(4, Number(CFG.autoRotateSec) || 9) * 1000;

  const $ = (id) => document.getElementById(id);

  const els = {
    body: document.body,
    stageView: $('stage-view'),
    canvas: $('sky-canvas'),
    eventTitle: $('event-title'),
    eventSubtitle: $('event-subtitle'),
    groupFilters: $('group-filters'),
    letterCount: $('letter-count'),
    connStatus: $('conn-status'),
    seagullTip: $('seagull-tip'),
    btnPick: $('btn-pick'),
    btnAuto: $('btn-auto'),
    btnOpenWrite: $('btn-open-write'),
    btnSceneTime: $('btn-scene-time'),
    btnFullscreen: $('btn-fullscreen'),
    qrCard: $('qr-card'),
    btnQrToggle: $('btn-qr-toggle'),
    qrBox: $('qr-box'),
    btnCopyLink: $('btn-copy-link'),
    btnOpenWriteTab: $('btn-open-write-tab'),
    letterModal: $('letter-modal'),
    letterPostcard: $('letter-postcard'),
    deliveryStage: $('delivery-stage'),
    deliveryBird: $('delivery-bird'),
    deliveryEnvelope: $('delivery-envelope'),
    envFlap: $('env-flap'),
    envSeal: $('env-seal'),
    btnCloseModal: $('btn-close-modal'),
    cardAvatar: $('card-avatar'),
    cardSender: $('card-sender'),
    cardGroup: $('card-group'),
    cardTime: $('card-time'),
    cardPostmark: $('card-postmark'),
    cardBody: $('card-body'),
    cardProgress: $('card-progress'),
    btnPrevLetter: $('btn-prev-letter'),
    btnNextLetter: $('btn-next-letter'),
    writeView: $('write-view'),
    writeMascot: $('write-mascot'),
    writeTitle: $('write-title'),
    writeSubtitle: $('write-subtitle'),
    btnBackStage: $('btn-back-stage'),
    writeForm: $('write-form'),
    avatarPicker: $('avatar-picker'),
    writeGroupPicker: $('write-group-picker'),
    inputSender: $('input-sender'),
    inputMessage: $('input-message'),
    charCount: $('char-count'),
    btnSubmitLetter: $('btn-submit-letter'),
    writeFeedback: $('write-feedback'),
    writeSuccess: $('write-success'),
    successSeagullWrap: $('success-seagull-wrap'),
    successNote: $('success-note'),
    btnWriteAgain: $('btn-write-again'),
    btnGoStage: $('btn-go-stage'),
    gasModal: $('gas-modal'),
    gasModePill: $('gas-mode-pill'),
    inputGasUrl: $('input-gas-url'),
    btnSaveGas: $('btn-save-gas'),
    btnClearGas: $('btn-clear-gas'),
    btnCloseGas: $('btn-close-gas')
  };

  const state = {
    view: 'stage',
    activeFilter: 'all_filter',
    letters: [],
    knownIds: new Set(),
    seenIds: new Set(),
    totalCount: 0,
    lastTimestamp: '',
    selectedLetterId: null,
    autoPlaying: false,
    autoElapsedMs: 0,
    deliverySeq: 0,
    deliveryTimers: [],
    isDelivering: false,
    sunset: false,
    sunsetMix: 0,
    gasUrl: '',
    connState: 'demo',
    connText: '展示模式（點此接 GAS）',
    selectedAvatar: AVATARS[0].id,
    selectedWriteGroup: GROUPS[0].name,
    birds: [],
    clouds: [],
    sparkles: [],
    trainX: -180,
    hoveredBird: null,
    rafId: null,
    lastFrameMs: performance.now(),
    pollTimer: null
  };

  /* -------------------- Utilities -------------------- */

  function getClientId() {
    let cid = '';
    try {
      cid = localStorage.getItem(LS_CLIENT_ID) || '';
      if (!cid) {
        cid = 'sg-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem(LS_CLIENT_ID, cid);
      }
    } catch (err) {
      cid = 'sg-temp-' + Math.random().toString(36).slice(2, 9);
    }
    return cid;
  }

  function resolveGasUrl() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get('gas') || '').trim();
    if (fromQuery) {
      try {
        localStorage.setItem(LS_GAS_KEY, fromQuery);
      } catch (err) { /* ignore storage errors */ }
      return fromQuery;
    }
    try {
      const fromStorage = (localStorage.getItem(LS_GAS_KEY) || '').trim();
      if (fromStorage) return fromStorage;
    } catch (err) { /* ignore storage errors */ }
    return (CFG.gasUrl || '').trim();
  }

  function findGroupMeta(groupName) {
    return GROUPS.find((g) => g.name === groupName || g.id === groupName) || GROUPS[GROUPS.length - 1];
  }

  function formatTimeLabel(isoStr) {
    if (!isoStr) return '剛剛';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return String(isoStr);
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin >= 0 && diffMin < 1) return '剛剛';
    if (diffMin >= 1 && diffMin < 60) return `${diffMin} 分鐘前`;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  }

  function getBasePageUrl() {
    if (CFG.publicUrl && CFG.publicUrl.trim()) {
      return CFG.publicUrl.trim();
    }
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      return window.location.origin + window.location.pathname;
    }
    return FALLBACK_PUBLIC_URL;
  }

  function getWriteUrl() {
    const url = new URL(getBasePageUrl(), FALLBACK_PUBLIC_URL);
    url.searchParams.set('mode', 'write');
    if (state.gasUrl && state.gasUrl !== (CFG.gasUrl || '').trim()) {
      url.searchParams.set('gas', state.gasUrl);
    }
    return url.toString();
  }

  function getFilteredLetters() {
    if (state.activeFilter === 'all_filter') return state.letters;
    return state.letters.filter((item) => item.group === state.activeFilter);
  }

  /* -------------------- Inline SVG Seagull Avatar Factory -------------------- */

  function renderSeagullSvg(avatarId, envelopeColor) {
    const env = envelopeColor || '#2b7de9';
    let accessory = '';

    if (avatarId === 'sailor') {
      accessory = `
        <path d="M23 23 C25 14, 41 14, 43 23 Z" fill="#fffdf7" stroke="#1a354d" stroke-width="2" stroke-linejoin="round"/>
        <rect x="21" y="21" width="24" height="4.5" rx="2.2" fill="#2b7de9" stroke="#1a354d" stroke-width="1.8"/>
        <path d="M28 19 L38 19" stroke="#d94862" stroke-width="2" stroke-linecap="round"/>`;
    } else if (avatarId === 'shades') {
      accessory = `
        <rect x="27" y="25" width="9" height="6" rx="2" fill="#0f172a" stroke="#1a354d" stroke-width="1.6"/>
        <rect x="37.5" y="25" width="8.5" height="6" rx="2" fill="#0f172a" stroke="#1a354d" stroke-width="1.6"/>
        <line x1="36" y1="27.5" x2="37.5" y2="27.5" stroke="#1a354d" stroke-width="1.8"/>
        <line x1="22" y1="27.5" x2="27" y2="27.5" stroke="#1a354d" stroke-width="1.8"/>
        <line x1="29" y1="26.5" x2="31" y2="29.5" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>`;
    } else if (avatarId === 'fries') {
      accessory = `
        <g transform="rotate(-14 49 33)">
          <rect x="44" y="24" width="3.2" height="11" rx="1" fill="#fde047" stroke="#1a354d" stroke-width="1.3"/>
          <rect x="48" y="26" width="3.2" height="9" rx="1" fill="#facc15" stroke="#1a354d" stroke-width="1.3"/>
        </g>`;
    } else if (avatarId === 'straw') {
      accessory = `
        <ellipse cx="33" cy="21" rx="17" ry="4" fill="#fcd34d" stroke="#1a354d" stroke-width="1.9"/>
        <path d="M23 20 C24 12, 42 12, 43 20 Z" fill="#fde68a" stroke="#1a354d" stroke-width="1.9"/>
        <path d="M23 19 Q33 21 43 19" fill="none" stroke="#e85d4a" stroke-width="2.6"/>`;
    } else if (avatarId === 'scarf') {
      accessory = `
        <path d="M21 40 Q33 46 43 39 L40 48 Q32 51 23 47 Z" fill="#e85d4a" stroke="#1a354d" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="29" cy="44" r="1.4" fill="#fffdf7"/>
        <circle cx="35" cy="43.5" r="1.4" fill="#fffdf7"/>
        <circle cx="32" cy="46.5" r="1.2" fill="#fffdf7"/>`;
    }

    const eyeMarkup = avatarId === 'shades'
      ? ''
      : '<circle cx="39" cy="28" r="1.8" fill="#1a354d"/><circle cx="39.6" cy="27.3" r="0.6" fill="#fff"/>';

    return `
      <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g-sky-${avatarId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#60b5ee"/>
            <stop offset="100%" stop-color="#d8f2fe"/>
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="31" fill="url(#g-sky-${avatarId})"/>
        <path d="M1 48 Q20 44 36 48 T63 47 L63 64 L1 64 Z" fill="#2d87c8" opacity="0.32"/>
        <!-- Body -->
        <path d="M12 58 C13 42, 20 35, 25 32 C22 25, 25 18, 34 18 C42 18, 46 24, 44 33 C45 41, 47 49, 49 58 Z" fill="#fffdf7" stroke="#1a354d" stroke-width="2.2" stroke-linejoin="round"/>
        <!-- Wing -->
        <path d="M21 37 Q15 44 20 53 Q30 51 35 42 Z" fill="#eef6fc" stroke="#1a354d" stroke-width="2" stroke-linejoin="round"/>
        <!-- Cheek blush -->
        <ellipse cx="35.5" cy="32" rx="3" ry="1.8" fill="#fda4af" opacity="0.7"/>
        <!-- Beak -->
        <path d="M44 28 L55 31 L44 34 Z" fill="#f59e0b" stroke="#1a354d" stroke-width="1.8" stroke-linejoin="round"/>
        ${eyeMarkup}
        ${accessory}
        <!-- Envelope tucked by side -->
        <g transform="translate(36, 43) rotate(-6)">
          <rect x="0" y="0" width="16" height="11" rx="2" fill="#fffdf7" stroke="#1a354d" stroke-width="1.7"/>
          <path d="M1 1 L8 6.5 L15 1" fill="none" stroke="${env}" stroke-width="1.8" stroke-linejoin="round"/>
        </g>
      </svg>`;
  }

  function renderDeliveryBirdSvg(avatarId, flipX) {
    let acc = '';
    if (avatarId === 'sailor') {
      acc = `
        <path d="M90 36 C92 28, 108 28, 110 36 Z" fill="#fffdf7" stroke="#1a354d" stroke-width="2" stroke-linejoin="round"/>
        <rect x="88" y="34.5" width="24" height="4.5" rx="2.2" fill="#2b7de9" stroke="#1a354d" stroke-width="1.8"/>`;
    } else if (avatarId === 'shades') {
      acc = `
        <rect x="97" y="39" width="12" height="5.5" rx="2" fill="#0f172a" stroke="#1a354d" stroke-width="1.6"/>
        <line x1="90" y1="41.5" x2="97" y2="41.5" stroke="#1a354d" stroke-width="1.7"/>
        <line x1="99" y1="40.5" x2="101.5" y2="43.5" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>`;
    } else if (avatarId === 'fries') {
      acc = `
        <g transform="rotate(-12 117 42)">
          <rect x="112" y="32" width="3.5" height="11" rx="1" fill="#fde047" stroke="#1a354d" stroke-width="1.4"/>
          <rect x="116" y="34" width="3.5" height="9" rx="1" fill="#facc15" stroke="#1a354d" stroke-width="1.4"/>
        </g>`;
    } else if (avatarId === 'straw') {
      acc = `
        <ellipse cx="100" cy="34.5" rx="16" ry="3.8" fill="#fcd34d" stroke="#1a354d" stroke-width="1.8"/>
        <path d="M90 34 C91 27, 109 27, 110 34 Z" fill="#fde68a" stroke="#1a354d" stroke-width="1.8"/>
        <path d="M90 32.8 Q100 34.8 110 32.8" fill="none" stroke="#e85d4a" stroke-width="2.4"/>`;
    } else if (avatarId === 'scarf') {
      acc = `
        <path d="M77 50 Q88 57 96 50 L92 61 Q84 63 75 58 Z" fill="#e85d4a" stroke="#1a354d" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="84" cy="55" r="1.4" fill="#fffdf7"/>
        <circle cx="89" cy="56" r="1.3" fill="#fffdf7"/>`;
    }

    const eye = avatarId === 'shades'
      ? ''
      : '<circle cx="103" cy="41.5" r="2" fill="#1a354d"/><circle cx="103.6" cy="40.8" r="0.7" fill="#fff"/>';

    const inner = `
      <!-- Back wing -->
      <path d="M70 43 Q52 16 28 24 Q46 35 61 48 Z" fill="#dcebf7" stroke="#1a354d" stroke-width="2.4" stroke-linejoin="round"/>
      <!-- Body + head -->
      <path d="M30 50 Q50 38 80 42 Q90 32 104 35 Q113 38 110 47 Q103 58 76 58 Q48 58 30 50 Z" fill="#fffdf7" stroke="#1a354d" stroke-width="2.4" stroke-linejoin="round"/>
      <!-- Tail feathers tip -->
      <path d="M30 50 L18 47 L23 53 Z" fill="#475569" stroke="#1a354d" stroke-width="1.8" stroke-linejoin="round"/>
      <!-- Beak -->
      <path d="M110 41 L126 44.5 L110 48 Z" fill="#f59e0b" stroke="#1a354d" stroke-width="2" stroke-linejoin="round"/>
      <!-- Cheek blush -->
      <ellipse cx="97" cy="46" rx="3.5" ry="2" fill="#fda4af" opacity="0.75"/>
      ${eye}
      ${acc}
      <!-- Front wing -->
      <path d="M78 46 Q68 18 42 12 Q57 28 65 50 Z" fill="#fffdf7" stroke="#1a354d" stroke-width="2.4" stroke-linejoin="round"/>
      <!-- Slate wing tip -->
      <path d="M51 14 Q45 12 42 12 Q45 17 51 20 Z" fill="#475569"/>`;

    return `
      <svg viewBox="0 0 148 96" width="148" height="96" xmlns="http://www.w3.org/2000/svg">
        <g${flipX ? ' transform="translate(148,0) scale(-1,1)"' : ''}>
          ${inner}
        </g>
      </svg>`;
  }

  /* -------------------- Data Loading & GAS Sync -------------------- */

  function loadDemoStore() {
    const base = Array.isArray(CFG.demoLetters) ? CFG.demoLetters.slice() : [];
    let extra = [];
    try {
      const raw = localStorage.getItem(LS_DEMO_KEY);
      if (raw) extra = JSON.parse(raw);
    } catch (err) {
      extra = [];
    }
    return [...(Array.isArray(extra) ? extra : []), ...base];
  }

  function saveDemoSubmission(letter) {
    let extra = [];
    try {
      const raw = localStorage.getItem(LS_DEMO_KEY);
      if (raw) extra = JSON.parse(raw);
    } catch (err) {
      extra = [];
    }
    const next = [letter, ...(Array.isArray(extra) ? extra : [])].slice(0, 80);
    try {
      localStorage.setItem(LS_DEMO_KEY, JSON.stringify(next));
    } catch (err) { /* ignore quota errors */ }
  }

  function setConnectionBadge(mode, text) {
    state.connState = mode;
    state.connText = text;
    if (!els.connStatus) return;
    els.connStatus.classList.remove('live', 'error');
    if (mode === 'live') els.connStatus.classList.add('live');
    if (mode === 'error') els.connStatus.classList.add('error');
    const lbl = els.connStatus.querySelector('.conn-label');
    if (lbl) lbl.textContent = text;
    if (els.gasModePill) {
      els.gasModePill.textContent = mode === 'live'
        ? '目前：Google Apps Script 即時連線'
        : (mode === 'error' ? '目前：GAS 連線異常（保留已載入資料）' : '目前：展示模式（Demo + 本機試寫）');
    }
  }

  function updateCounter(newTotal) {
    const prev = state.totalCount;
    state.totalCount = Math.max(0, Number(newTotal) || 0);
    if (!els.letterCount) return;
    els.letterCount.textContent = state.totalCount.toLocaleString('zh-TW');
    if (state.totalCount > prev && prev > 0) {
      els.letterCount.classList.remove('bump');
      void els.letterCount.offsetWidth;
      els.letterCount.classList.add('bump');
    }
  }

  function mergeIncomingLetters(items, isInitial, explicitTotal) {
    if (!Array.isArray(items)) return;
    const byId = new Map(state.letters.map((l) => [l.id, l]));
    const newlyArrived = [];

    items.forEach((item) => {
      if (!item || !item.id) return;
      if (!state.knownIds.has(item.id) && !isInitial) {
        newlyArrived.push(item);
      }
      state.knownIds.add(item.id);
      byId.set(item.id, item);
      if (item.timestamp && (!state.lastTimestamp || item.timestamp > state.lastTimestamp)) {
        state.lastTimestamp = item.timestamp;
      }
    });

    const sorted = [...byId.values()].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    state.letters = sorted;
    updateCounter(explicitTotal !== undefined ? explicitTotal : sorted.length);
    rebindBirdsToPool();

    if (newlyArrived.length) {
      newlyArrived.slice(0, 3).forEach((item, idx) => spawnExpressSeagull(item, idx));
    }
  }

  async function refreshLetters(isInitial) {
    if (!state.gasUrl) {
      const demo = loadDemoStore();
      mergeIncomingLetters(demo, isInitial, demo.length);
      setConnectionBadge('demo', '展示模式（點此接 GAS）');
      return;
    }

    try {
      const url = new URL(state.gasUrl);
      url.searchParams.set('action', 'list');
      if (!isInitial && state.lastTimestamp) {
        url.searchParams.set('since', state.lastTimestamp);
      }
      const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || data.ok === false) {
        throw new Error((data && data.error) || 'GAS 回應格式錯誤');
      }

      if (data.eventTitle && els.eventTitle) {
        els.eventTitle.textContent = data.eventTitle;
      }

      const incoming = !isInitial && Array.isArray(data.newItems) ? data.newItems : (data.items || []);
      mergeIncomingLetters(incoming, isInitial, data.total);
      setConnectionBadge('live', 'GAS 即時連線中');
    } catch (err) {
      console.warn('Seagull Mail GAS fetch failed:', err);
      if (isInitial && state.letters.length === 0) {
        const fallback = loadDemoStore();
        mergeIncomingLetters(fallback, true, fallback.length);
      }
      setConnectionBadge('error', 'GAS 連線重試中');
    }
  }

  async function submitLetter(payload) {
    if (!state.gasUrl) {
      const localItem = {
        id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        timestamp: new Date().toISOString(),
        group: payload.group,
        sender: payload.sender || '海風訪客',
        avatar: payload.avatar,
        message: payload.message
      };
      saveDemoSubmission(localItem);
      mergeIncomingLetters([localItem], false, state.totalCount + 1);
      return { ok: true, status: 'approved', item: localItem, mode: 'demo' };
    }

    const res = await fetch(state.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('伺服器回應失敗 (' + res.status + ')');
    const data = await res.json();
    if (!data || !data.ok) {
      throw new Error((data && (data.error || data.message)) || '送出失敗，請稍後再試');
    }
    if (data.status === 'approved' && data.item) {
      mergeIncomingLetters([data.item], false, data.total);
    }
    return data;
  }

  /* -------------------- Seaside Canvas Engine -------------------- */

  function initEnvironment() {
    state.clouds = [];
    for (let i = 0; i < 8; i++) {
      state.clouds.push({
        xNorm: i / 7,
        yFrac: 0.08 + (i % 3) * 0.075,
        scale: 0.72 + (i % 4) * 0.22,
        speed: 4 + (i % 3) * 2.5,
        puffs: 3 + (i % 2)
      });
    }

    state.birds = [];
    const totalBirds = 30;
    for (let i = 0; i < totalBirds; i++) {
      const layer = i < 10 ? 0 : (i < 21 ? 1 : 2);
      state.birds.push(makeBird(layer, true));
    }
    rebindBirdsToPool();
  }

  function makeBird(layer, randomX) {
    const w = els.canvas.clientWidth || 1280;
    const h = els.canvas.clientHeight || 720;
    const dir = Math.random() < 0.72 ? 1 : -1;
    const baseSpeed = layer === 0 ? 22 : (layer === 1 ? 38 : 56);
    const scale = layer === 0 ? 0.56 : (layer === 1 ? 0.84 : 1.12);
    return {
      layer,
      scale,
      dir,
      x: randomX ? Math.random() * w : (dir === 1 ? -90 : w + 90),
      y: h * (0.14 + Math.random() * 0.45),
      vx: dir * (baseSpeed + Math.random() * 18),
      flapPhase: Math.random() * Math.PI * 2,
      flapFreq: 4.5 + Math.random() * 2.2,
      glidePhase: Math.random() * Math.PI * 2,
      bobPhase: Math.random() * Math.PI * 2,
      isNew: false,
      newTimer: 0,
      letter: null
    };
  }

  function spawnExpressSeagull(letter, staggerIdx) {
    const w = els.canvas.clientWidth || 1280;
    const h = els.canvas.clientHeight || 720;
    const bird = makeBird(2, false);
    bird.dir = 1;
    bird.x = -110 - (staggerIdx || 0) * 140;
    bird.y = h * (0.24 + (staggerIdx || 0) * 0.08);
    bird.vx = 92;
    bird.scale = 1.32;
    bird.isNew = true;
    bird.newTimer = 18;
    bird.letter = letter;
    state.birds.push(bird);
    if (state.birds.length > 38) {
      const oldestNonNew = state.birds.findIndex((b) => !b.isNew && b.layer === 0);
      if (oldestNonNew !== -1) state.birds.splice(oldestNonNew, 1);
    }
  }

  function rebindBirdsToPool() {
    const pool = getFilteredLetters();
    if (!pool.length) {
      state.birds.forEach((b) => { b.letter = null; });
      return;
    }
    let idx = 0;
    state.birds.forEach((b) => {
      if (b.isNew && b.letter && pool.some((p) => p.id === b.letter.id)) return;
      b.letter = pool[idx % pool.length];
      idx++;
    });
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColor(c1, c2, t) {
    const r = Math.round(lerp(c1[0], c2[0], t));
    const g = Math.round(lerp(c1[1], c2[1], t));
    const b = Math.round(lerp(c1[2], c2[2], t));
    return `rgb(${r},${g},${b})`;
  }

  function resizeCanvas() {
    if (!els.canvas) return { w: 1280, h: 720, dpr: 1 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = els.canvas.getBoundingClientRect();
    const cssW = Math.max(320, rect.width || window.innerWidth);
    const cssH = Math.max(360, rect.height || window.innerHeight);
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (els.canvas.width !== pxW || els.canvas.height !== pxH) {
      els.canvas.width = pxW;
      els.canvas.height = pxH;
    }
    return { w: cssW, h: cssH, dpr };
  }

  function drawCloud(ctx, x, y, scale, puffs, sunsetMix) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const fillMain = lerpColor([255, 253, 247], [255, 232, 206], sunsetMix);
    const shadowCol = lerpColor([198, 229, 249], [231, 165, 152], sunsetMix);

    ctx.fillStyle = shadowCol;
    ctx.beginPath();
    ctx.roundRect(-78, -6, 156, 30, 15);
    ctx.fill();

    ctx.fillStyle = fillMain;
    ctx.strokeStyle = 'rgba(26, 53, 77, 0.35)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-44, -2, 24, Math.PI * 0.9, Math.PI * 1.9);
    ctx.arc(-12, -18, 32, Math.PI * 1.05, Math.PI * 1.95);
    ctx.arc(24, -12, 26, Math.PI * 1.1, Math.PI * 2.02);
    if (puffs > 3) {
      ctx.arc(52, 0, 18, Math.PI * 1.15, Math.PI * 0.15);
    }
    ctx.lineTo(72, 16);
    ctx.lineTo(-68, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawCoastalScenery(ctx, w, h, seaY, sunsetMix, nowSec) {
    // Distant island / Enoshima-like headland on right-center
    const islandCol = lerpColor([118, 174, 209], [102, 108, 148], sunsetMix);
    const capeCol = lerpColor([72, 134, 155], [70, 74, 110], sunsetMix);

    ctx.save();
    ctx.fillStyle = islandCol;
    ctx.beginPath();
    ctx.moveTo(w * 0.56, seaY + 2);
    ctx.quadraticCurveTo(w * 0.68, seaY - 58, w * 0.78, seaY - 46);
    ctx.quadraticCurveTo(w * 0.87, seaY - 26, w * 0.94, seaY + 2);
    ctx.closePath();
    ctx.fill();

    // Closer cape on right edge
    ctx.fillStyle = capeCol;
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.75, seaY + 2);
    ctx.quadraticCurveTo(w * 0.84, seaY - 42, w * 0.92, seaY - 38);
    ctx.lineTo(w * 1.02, seaY - 22);
    ctx.lineTo(w * 1.02, seaY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Red-and-white coastal lighthouse on cape
    const lx = w * 0.885;
    const ly = seaY - 36;
    if (sunsetMix > 0.25) {
      ctx.save();
      const beamAlpha = sunsetMix * 0.24;
      const beamAngle = Math.sin(nowSec * 0.7) * 0.35 - Math.PI * 0.86;
      const grad = ctx.createRadialGradient(lx, ly - 46, 4, lx, ly - 46, 280);
      grad.addColorStop(0, `rgba(255, 240, 165, ${beamAlpha})`);
      grad.addColorStop(1, 'rgba(255, 240, 165, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 46);
      ctx.arc(lx, ly - 46, 280, beamAngle - 0.14, beamAngle + 0.14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = '#fffdf7';
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(lx - 7, ly);
    ctx.lineTo(lx - 4.5, ly - 42);
    ctx.lineTo(lx + 4.5, ly - 42);
    ctx.lineTo(lx + 7, ly);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Red stripe on lighthouse
    ctx.fillStyle = '#e85d4a';
    ctx.fillRect(lx - 5.5, ly - 24, 11, 10);
    ctx.strokeRect(lx - 5.5, ly - 24, 11, 10);
    // Lantern room
    ctx.fillStyle = '#fde047';
    ctx.fillRect(lx - 4, ly - 49, 8, 7);
    ctx.strokeRect(lx - 4, ly - 49, 8, 7);
    ctx.beginPath();
    ctx.moveTo(lx - 6, ly - 49);
    ctx.lineTo(lx, ly - 55);
    ctx.lineTo(lx + 6, ly - 49);
    ctx.closePath();
    ctx.fillStyle = '#e85d4a';
    ctx.fill();
    ctx.stroke();

    // Enoden-inspired green-and-cream seaside train viaduct
    const railY = seaY - 12;
    ctx.fillStyle = lerpColor([222, 228, 232], [176, 152, 146], sunsetMix);
    ctx.fillRect(0, railY + 6, w * 0.78, 8);
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, railY + 6);
    ctx.lineTo(w * 0.78, railY + 6);
    ctx.stroke();

    // Catenary poles
    for (let px = 60; px < w * 0.76; px += 120) {
      ctx.beginPath();
      ctx.moveTo(px, railY + 6);
      ctx.lineTo(px, railY - 18);
      ctx.moveTo(px - 6, railY - 15);
      ctx.lineTo(px + 6, railY - 15);
      ctx.stroke();
    }

    // Two-car coastal train
    const tx = state.trainX;
    for (let c = 0; c < 2; c++) {
      const cx = tx + c * 54;
      if (cx > w * 0.77 || cx + 50 < 0) continue;
      ctx.fillStyle = '#fef6d8';
      ctx.strokeStyle = '#1a354d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx, railY - 9, 49, 15, 3);
      ctx.fill();
      ctx.fillStyle = '#2d7a4f';
      ctx.fillRect(cx + 0.5, railY - 1, 48, 7);
      ctx.strokeRect(cx, railY - 9, 49, 15);
      ctx.fillStyle = '#93c5fd';
      for (let win = 0; win < 4; win++) {
        ctx.fillRect(cx + 5 + win * 10, railY - 6, 7, 4.5);
      }
    }

    ctx.restore();
  }

  function drawOceanAndShore(ctx, w, h, seaY, sunsetMix, nowSec) {
    const seaTop = lerpColor([58, 155, 214], [79, 108, 162], sunsetMix);
    const seaBot = lerpColor([28, 96, 158], [46, 62, 114], sunsetMix);
    const seaGrad = ctx.createLinearGradient(0, seaY, 0, h);
    seaGrad.addColorStop(0, seaTop);
    seaGrad.addColorStop(0.75, seaBot);
    seaGrad.addColorStop(1, lerpColor([23, 81, 134], [38, 49, 92], sunsetMix));
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, seaY, w, h - seaY);

    // Horizon line
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, seaY);
    ctx.lineTo(w, seaY);
    ctx.stroke();

    // Sunlit sparkling dashes across the waves
    const sparkCol = sunsetMix > 0.4 ? 'rgba(255, 224, 148, 0.55)' : 'rgba(255, 255, 255, 0.45)';
    ctx.fillStyle = sparkCol;
    for (let row = 0; row < 5; row++) {
      const y = seaY + 12 + row * ((h - seaY - 40) / 5);
      const count = 9 + row * 2;
      for (let j = 0; j < count; j++) {
        const phase = nowSec * (0.45 + row * 0.08) + j * 1.9;
        const sx = ((j / count) * w + Math.sin(phase) * 14 + w) % w;
        const sw = 18 + (j % 3) * 14 + Math.sin(phase * 1.7) * 6;
        ctx.fillRect(sx, y, Math.max(8, sw), 2.5);
      }
    }

    // Gentle sandy curve at bottom edge
    const shoreY = h - 22;
    const sandCol = lerpColor([244, 221, 184], [219, 179, 148], sunsetMix);
    ctx.fillStyle = sandCol;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, shoreY + 4);
    for (let x = 0; x <= w; x += 40) {
      const waveOffset = Math.sin(x * 0.012 + nowSec * 1.3) * 4;
      ctx.lineTo(x, shoreY + waveOffset);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Sea foam rim
    ctx.strokeStyle = 'rgba(255, 253, 247, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 24) {
      const waveOffset = Math.sin(x * 0.012 + nowSec * 1.3) * 4;
      if (x === 0) ctx.moveTo(x, shoreY + waveOffset);
      else ctx.lineTo(x, shoreY + waveOffset);
    }
    ctx.stroke();
  }

  function drawFlyingSeagull(ctx, bird, hovered, nowSec) {
    const groupMeta = bird.letter ? findGroupMeta(bird.letter.group) : GROUPS[GROUPS.length - 1];
    const envColor = groupMeta.color || '#2b7de9';
    const avatar = bird.letter ? bird.letter.avatar : 'sailor';
    const isGliding = Math.sin(nowSec * 0.7 + bird.glidePhase) > 0.55;
    const wingBeat = isGliding ? 0.25 : Math.sin(bird.flapPhase);
    const bobY = Math.sin(bird.bobPhase) * 4 * bird.scale;

    ctx.save();
    ctx.translate(bird.x, bird.y + bobY);

    if (bird.isNew) {
      // Soft golden aura for newly sent express seagull
      const pulse = 0.7 + 0.3 * Math.sin(nowSec * 6);
      const aura = ctx.createRadialGradient(0, 0, 6, 0, 0, 44 * bird.scale);
      aura.addColorStop(0, `rgba(253, 224, 71, ${0.42 * pulse})`);
      aura.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, 44 * bird.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    if (hovered) {
      ctx.strokeStyle = '#e85d4a';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 2, 34 * bird.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.scale(bird.dir * bird.scale, bird.scale);

    // Back wing
    const bwLift = -14 + wingBeat * 13;
    ctx.fillStyle = '#e4eff7';
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.quadraticCurveTo(-14, bwLift - 9, -27, bwLift);
    ctx.quadraticCurveTo(-15, bwLift + 5, -5, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hanging colored airmail envelope from beak
    const sway = Math.sin(nowSec * 3.5 + bird.bobPhase) * 0.14;
    ctx.save();
    ctx.translate(22, 3);
    ctx.rotate(sway);
    // Thin string
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(-1, 4);
    ctx.stroke();
    // Envelope card
    ctx.fillStyle = '#fffdf7';
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-9, 4, 16, 11, 2);
    ctx.fill();
    ctx.stroke();
    // Colored flap & stamp corner
    ctx.strokeStyle = envColor;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-8, 5);
    ctx.lineTo(-1, 10.5);
    ctx.lineTo(6, 5);
    ctx.stroke();
    ctx.fillStyle = envColor;
    ctx.fillRect(2, 11, 3.5, 2.5);
    ctx.restore();

    // Body + Head
    ctx.fillStyle = '#fffdf7';
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-21, 1);
    ctx.quadraticCurveTo(-10, -7, 6, -5);
    ctx.quadraticCurveTo(13, -11, 19, -6);
    ctx.quadraticCurveTo(21, -2, 16, 2);
    ctx.quadraticCurveTo(7, 8, -10, 6);
    ctx.quadraticCurveTo(-18, 4, -21, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Beak
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(18, -5.5);
    ctx.lineTo(27, -3.2);
    ctx.lineTo(18, -0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eye & avatar accessory detail on larger layers
    if (avatar === 'shades' && bird.layer > 0) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(11, -7.2, 6, 3.4);
    } else {
      ctx.fillStyle = '#1a354d';
      ctx.beginPath();
      ctx.arc(14.5, -5.3, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (bird.layer > 0) {
      if (avatar === 'sailor') {
        ctx.fillStyle = '#2b7de9';
        ctx.fillRect(9, -11, 8, 2.6);
      } else if (avatar === 'straw') {
        ctx.fillStyle = '#fcd34d';
        ctx.fillRect(7, -10.5, 11, 2.4);
      } else if (avatar === 'scarf') {
        ctx.fillStyle = '#e85d4a';
        ctx.fillRect(5, -3, 6, 3.2);
      } else if (avatar === 'fries') {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(20, -9, 2.2, 5.5);
      }
    }

    // Front wing
    const fwLift = -12 + wingBeat * 17;
    ctx.fillStyle = '#fffdf7';
    ctx.strokeStyle = '#1a354d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(-6, fwLift - 12, -20, fwLift);
    ctx.quadraticCurveTo(-9, fwLift + 6, -2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dark slate tip on wing
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(-16, fwLift + 1, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (bird.isNew) {
      ctx.save();
      ctx.fillStyle = '#e85d4a';
      ctx.strokeStyle = '#1a354d';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(bird.x - 24, bird.y + bobY - 34 * bird.scale, 48, 18, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fffdf7';
      ctx.font = '900 10.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NEW!', bird.x, bird.y + bobY - 34 * bird.scale + 9.5);
      ctx.restore();
    }
  }

  function stepAnimation(dt, nowMs) {
    const targetSunset = state.sunset ? 1 : 0;
    state.sunsetMix += (targetSunset - state.sunsetMix) * Math.min(1, dt * 2.2);

    const w = els.canvas.clientWidth || 1280;
    const h = els.canvas.clientHeight || 720;
    const nowSec = nowMs / 1000;

    state.clouds.forEach((c) => {
      c.xNorm = (c.xNorm + (c.speed * dt) / Math.max(w, 600)) % 1.18;
    });

    state.trainX += 46 * dt;
    if (state.trainX > w * 0.85) {
      state.trainX = -150;
    }

    state.birds.forEach((b) => {
      b.x += b.vx * dt;
      b.flapPhase += b.flapFreq * dt;
      b.bobPhase += 2.2 * dt;
      if (b.isNew) {
        b.newTimer -= dt;
        if (b.newTimer <= 0) {
          b.isNew = false;
          b.scale = 1.12;
          b.vx = 52;
        }
      }
      if (b.dir === 1 && b.x > w + 110) {
        b.x = -100;
        b.y = h * (0.14 + Math.random() * 0.45);
      } else if (b.dir === -1 && b.x < -110) {
        b.x = w + 100;
        b.y = h * (0.14 + Math.random() * 0.45);
      }
    });

    if (state.autoPlaying && !els.letterModal.hidden && !state.isDelivering) {
      state.autoElapsedMs += dt * 1000;
      const pct = Math.min(100, (state.autoElapsedMs / ROTATE_MS) * 100);
      els.cardProgress.style.width = `${pct}%`;
      if (state.autoElapsedMs >= ROTATE_MS) {
        state.autoElapsedMs = 0;
        stepLetter(1);
      }
    }
  }

  function renderFrame(nowMs) {
    if (state.view !== 'stage' || !els.canvas) return;
    const ctx = els.canvas.getContext('2d');
    const { w, h, dpr } = resizeCanvas();
    const nowSec = nowMs / 1000;
    const mix = state.sunsetMix;
    const seaY = Math.round(h * 0.72);

    ctx.save();
    ctx.scale(dpr, dpr);

    // Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, seaY);
    skyGrad.addColorStop(0, lerpColor([58, 152, 220], [50, 76, 134], mix));
    skyGrad.addColorStop(0.58, lerpColor([141, 208, 245], [216, 124, 112], mix));
    skyGrad.addColorStop(1, lerpColor([249, 239, 212], [250, 204, 134], mix));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, seaY + 2);

    // Sun Disc + Halo
    const sunX = w * 0.78;
    const sunY = lerp(h * 0.22, seaY - 28, mix);
    const sunRadius = lerp(34, 46, mix);
    const halo = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.3, sunX, sunY, sunRadius * 4.2);
    halo.addColorStop(0, mix > 0.4 ? 'rgba(255, 226, 138, 0.75)' : 'rgba(255, 249, 214, 0.75)');
    halo.addColorStop(1, 'rgba(255, 245, 200, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius * 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = lerpColor([255, 245, 189], [255, 198, 112], mix);
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Clouds
    state.clouds.forEach((c) => {
      const cx = (c.xNorm - 0.08) * (w + 180);
      const cy = seaY * (0.28 + c.yFrac * 1.4);
      drawCloud(ctx, cx, cy, c.scale, c.puffs, mix);
    });

    // Coastal Scenery + Ocean
    drawCoastalScenery(ctx, w, h, seaY, mix, nowSec);
    drawOceanAndShore(ctx, w, h, seaY, mix, nowSec);

    // Seagulls ordered by layer (0 -> 2)
    for (let layer = 0; layer <= 2; layer++) {
      state.birds.forEach((b) => {
        if (b.layer === layer) {
          drawFlyingSeagull(ctx, b, b === state.hoveredBird, nowSec);
        }
      });
    }

    ctx.restore();
  }

  function startAnimationLoop() {
    if (state.rafId !== null) return;
    state.lastFrameMs = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - state.lastFrameMs) / 1000));
      state.lastFrameMs = now;
      if (state.view === 'stage' && !document.hidden) {
        stepAnimation(dt, now);
        renderFrame(now);
      }
      state.rafId = requestAnimationFrame(tick);
    };
    state.rafId = requestAnimationFrame(tick);
  }

  function hitTestBird(clientX, clientY) {
    if (!els.canvas) return null;
    const rect = els.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    for (let layer = 2; layer >= 0; layer--) {
      for (let i = state.birds.length - 1; i >= 0; i--) {
        const b = state.birds[i];
        if (b.layer !== layer || !b.letter) continue;
        const bobY = Math.sin(b.bobPhase) * 4 * b.scale;
        const dist = Math.hypot(x - b.x, y - (b.y + bobY));
        if (dist <= 34 * b.scale) {
          return { bird: b, x, y: b.y + bobY };
        }
      }
    }
    return null;
  }

  /* -------------------- Modal, Delivery Animation & Auto-Carousel -------------------- */

  function clearDeliveryTimers() {
    while (state.deliveryTimers.length) {
      clearTimeout(state.deliveryTimers.pop());
    }
    if (els.deliveryStage) {
      els.deliveryStage.hidden = true;
      els.deliveryStage.classList.remove('dir-next', 'dir-prev', 'is-sparkling');
    }
    if (els.deliveryEnvelope) {
      els.deliveryEnvelope.classList.remove('is-open', 'is-fading');
    }
  }

  function populatePostcard(letter) {
    state.selectedLetterId = letter.id;
    state.seenIds.add(letter.id);
    state.autoElapsedMs = 0;

    const groupMeta = findGroupMeta(letter.group);
    els.cardAvatar.innerHTML = renderSeagullSvg(letter.avatar || 'sailor', groupMeta.color);
    els.cardSender.textContent = letter.sender || '海風訪客';
    els.cardGroup.textContent = groupMeta.name;
    els.cardGroup.style.backgroundColor = groupMeta.color;
    els.cardTime.textContent = formatTimeLabel(letter.timestamp);
    els.cardBody.textContent = letter.message || '';

    const ring = els.cardPostmark.querySelector('.postmark-ring');
    if (ring) ring.textContent = groupMeta.stamp || '海';

    els.cardProgress.style.width = '0%';
  }

  function openLetterModal(letter, options) {
    if (!letter) return;
    const opts = options || {};
    const direction = opts.direction === 'prev' ? 'prev' : 'next';
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shouldAnimate = opts.animate !== false && !reduceMotion;
    const wasOpen = !els.letterModal.hidden;

    clearDeliveryTimers();
    const seq = ++state.deliverySeq;
    const schedule = (ms, fn) => {
      const tid = setTimeout(() => {
        if (seq !== state.deliverySeq) return;
        fn();
      }, ms);
      state.deliveryTimers.push(tid);
    };

    if (!shouldAnimate || !els.deliveryStage || !els.letterPostcard) {
      state.isDelivering = false;
      if (els.letterPostcard) {
        els.letterPostcard.classList.remove('is-leaving-next', 'is-leaving-prev', 'is-waiting', 'is-unfolding');
      }
      populatePostcard(letter);
      els.letterModal.hidden = false;
      return;
    }

    state.isDelivering = true;
    state.autoElapsedMs = 0;
    els.cardProgress.style.width = '0%';
    els.letterModal.hidden = false;

    const groupMeta = findGroupMeta(letter.group);
    els.deliveryBird.innerHTML = renderDeliveryBirdSvg(letter.avatar || 'sailor', direction === 'prev');
    els.deliveryEnvelope.style.setProperty('--env-color', groupMeta.color || '#2b7de9');
    els.envSeal.textContent = groupMeta.stamp || '海';

    els.deliveryStage.classList.remove('dir-next', 'dir-prev', 'is-sparkling');
    els.deliveryEnvelope.classList.remove('is-open', 'is-fading');
    els.deliveryStage.hidden = false;
    void els.deliveryStage.offsetWidth;
    els.deliveryStage.classList.add(direction === 'prev' ? 'dir-prev' : 'dir-next');

    els.letterPostcard.classList.remove('is-leaving-next', 'is-leaving-prev', 'is-waiting', 'is-unfolding');
    if (wasOpen) {
      els.letterPostcard.classList.add(direction === 'prev' ? 'is-leaving-prev' : 'is-leaving-next');
      schedule(150, () => {
        els.letterPostcard.classList.remove('is-leaving-next', 'is-leaving-prev');
        els.letterPostcard.classList.add('is-waiting');
        populatePostcard(letter);
      });
    } else {
      els.letterPostcard.classList.add('is-waiting');
      populatePostcard(letter);
    }

    schedule(230, () => {
      els.deliveryEnvelope.classList.add('is-open');
      els.deliveryStage.classList.add('is-sparkling');
    });

    schedule(440, () => {
      els.deliveryEnvelope.classList.add('is-fading');
      els.letterPostcard.classList.remove('is-waiting');
      void els.letterPostcard.offsetWidth;
      els.letterPostcard.classList.add('is-unfolding');
    });

    schedule(760, () => {
      clearDeliveryTimers();
      els.letterPostcard.classList.remove('is-unfolding');
      state.isDelivering = false;
    });
  }

  function closeLetterModal() {
    state.deliverySeq++;
    clearDeliveryTimers();
    state.isDelivering = false;
    if (els.letterPostcard) {
      els.letterPostcard.classList.remove('is-leaving-next', 'is-leaving-prev', 'is-waiting', 'is-unfolding');
    }
    els.letterModal.hidden = true;
    state.autoPlaying = false;
    els.btnAuto.setAttribute('aria-pressed', 'false');
    els.btnAuto.textContent = '🔄 自動輪播';
    els.cardProgress.style.width = '0%';
  }

  function makeEmptyHintLetter() {
    return {
      id: 'empty-hint',
      timestamp: new Date().toISOString(),
      group: GROUPS[GROUPS.length - 1].name,
      sender: '海風小幫手',
      avatar: 'sailor',
      message: '目前還沒有符合條件的海鷗信喔！快掃描右下角 QR Code 或點「✉️ 寫一封信」，放飛第一隻海鷗吧！'
    };
  }

  function pickNextUnseenLetter() {
    const pool = getFilteredLetters();
    if (!pool.length) return null;
    let candidates = pool.filter((l) => !state.seenIds.has(l.id));
    if (!candidates.length) {
      state.seenIds.clear();
      candidates = pool;
    }
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
  }

  function stepLetter(delta) {
    const pool = getFilteredLetters();
    if (!pool.length) return;
    const curIdx = pool.findIndex((l) => l.id === state.selectedLetterId);
    const nextIdx = curIdx === -1 ? 0 : (curIdx + delta + pool.length) % pool.length;
    openLetterModal(pool[nextIdx], { animate: true, direction: delta < 0 ? 'prev' : 'next' });
  }

  /* -------------------- UI Builders & View Switching -------------------- */

  function buildFilterPills() {
    if (!els.groupFilters) return;
    els.groupFilters.innerHTML = '';

    const makePill = (id, label, color) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-pill' + (state.activeFilter === id ? ' active' : '');
      btn.dataset.filter = id;
      if (color) {
        const dot = document.createElement('span');
        dot.className = 'swatch';
        dot.style.backgroundColor = color;
        btn.appendChild(dot);
      }
      btn.appendChild(document.createTextNode(label));
      btn.addEventListener('click', () => {
        state.activeFilter = id;
        document.querySelectorAll('.filter-pill').forEach((p) => {
          p.classList.toggle('active', p.dataset.filter === id);
        });
        rebindBirdsToPool();
      });
      return btn;
    };

    els.groupFilters.appendChild(makePill('all_filter', '全部組別', null));
    GROUPS.forEach((g) => {
      els.groupFilters.appendChild(makePill(g.name, g.name, g.color));
    });
  }

  function buildWritePickers() {
    if (els.writeMascot) {
      els.writeMascot.innerHTML = renderSeagullSvg(state.selectedAvatar, findGroupMeta(state.selectedWriteGroup).color);
    }

    els.avatarPicker.innerHTML = '';
    AVATARS.forEach((av) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-option' + (av.id === state.selectedAvatar ? ' selected' : '');
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', av.id === state.selectedAvatar ? 'true' : 'false');
      btn.title = av.tagline;
      btn.innerHTML = renderSeagullSvg(av.id, findGroupMeta(state.selectedWriteGroup).color);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = av.name;
      btn.appendChild(nameSpan);
      btn.addEventListener('click', () => {
        state.selectedAvatar = av.id;
        buildWritePickers();
      });
      els.avatarPicker.appendChild(btn);
    });

    els.writeGroupPicker.innerHTML = '';
    GROUPS.forEach((g) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'group-choice' + (g.name === state.selectedWriteGroup ? ' selected' : '');
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', g.name === state.selectedWriteGroup ? 'true' : 'false');
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.backgroundColor = g.color;
      btn.appendChild(sw);
      btn.appendChild(document.createTextNode(g.name));
      btn.addEventListener('click', () => {
        state.selectedWriteGroup = g.name;
        buildWritePickers();
      });
      els.writeGroupPicker.appendChild(btn);
    });
  }

  function renderQrCode() {
    const writeUrl = getWriteUrl();
    if (els.btnOpenWriteTab) {
      els.btnOpenWriteTab.href = writeUrl;
    }
    if (!els.qrBox) return;
    els.qrBox.innerHTML = '';
    if (typeof window.QRCode === 'function') {
      new window.QRCode(els.qrBox, {
        text: writeUrl,
        width: 132,
        height: 132,
        colorDark: '#1a354d',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } else {
      const span = document.createElement('span');
      span.style.fontSize = '11px';
      span.style.textAlign = 'center';
      span.textContent = '離線狀態：請用下方連結開啟寫信頁';
      els.qrBox.appendChild(span);
    }
  }

  function setView(viewName) {
    state.view = viewName === 'write' ? 'write' : 'stage';
    els.body.dataset.view = state.view;
    els.stageView.hidden = state.view !== 'stage';
    els.writeView.hidden = state.view !== 'write';

    if (state.view === 'write') {
      closeLetterModal();
      buildWritePickers();
      els.writeFeedback.hidden = true;
    } else {
      resizeCanvas();
      renderQrCode();
    }
  }

  /* -------------------- Event Wiring -------------------- */

  function bindEvents() {
    if (els.canvas) {
      els.canvas.addEventListener('mousemove', (e) => {
        const hit = hitTestBird(e.clientX, e.clientY);
        state.hoveredBird = hit ? hit.bird : null;
        els.canvas.style.cursor = hit ? 'pointer' : 'default';
        if (hit && hit.bird.letter) {
          const l = hit.bird.letter;
          els.seagullTip.textContent = `${l.group}｜${l.sender || '海風訪客'} — 點我看信`;
          els.seagullTip.style.left = `${hit.x}px`;
          els.seagullTip.style.top = `${hit.y}px`;
          els.seagullTip.hidden = false;
        } else {
          els.seagullTip.hidden = true;
        }
      });

      els.canvas.addEventListener('mouseleave', () => {
        state.hoveredBird = null;
        els.seagullTip.hidden = true;
      });

      els.canvas.addEventListener('click', (e) => {
        const hit = hitTestBird(e.clientX, e.clientY);
        if (hit && hit.bird.letter) {
          openLetterModal(hit.bird.letter, { animate: true, direction: 'next' });
        }
      });
    }

    els.btnPick.addEventListener('click', () => {
      const next = pickNextUnseenLetter() || makeEmptyHintLetter();
      openLetterModal(next, { animate: true, direction: 'next' });
    });

    els.btnAuto.addEventListener('click', () => {
      state.autoPlaying = !state.autoPlaying;
      els.btnAuto.setAttribute('aria-pressed', state.autoPlaying ? 'true' : 'false');
      els.btnAuto.textContent = state.autoPlaying ? '⏸ 暫停輪播' : '🔄 自動輪播';
      if (state.autoPlaying && els.letterModal.hidden) {
        const next = pickNextUnseenLetter() || makeEmptyHintLetter();
        openLetterModal(next, { animate: true, direction: 'next' });
      }
    });

    els.btnOpenWrite.addEventListener('click', () => {
      setView('write');
    });

    els.btnBackStage.addEventListener('click', () => {
      setView('stage');
    });

    els.btnGoStage.addEventListener('click', () => {
      setView('stage');
    });

    els.btnSceneTime.addEventListener('click', () => {
      state.sunset = !state.sunset;
      els.body.classList.toggle('sunset', state.sunset);
      els.btnSceneTime.setAttribute('aria-pressed', state.sunset ? 'true' : 'false');
      els.btnSceneTime.textContent = state.sunset ? '☀️ 切回藍天' : '🌅 切換黃昏';
    });

    els.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

    document.addEventListener('fullscreenchange', () => {
      const active = Boolean(document.fullscreenElement);
      els.btnFullscreen.setAttribute('aria-pressed', active ? 'true' : 'false');
      els.btnFullscreen.textContent = active ? '✕ 離開全螢幕' : '⛶ 全螢幕';
    });

    els.btnQrToggle.addEventListener('click', () => {
      const collapsed = els.qrCard.classList.toggle('collapsed');
      els.btnQrToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      els.btnQrToggle.textContent = collapsed ? 'QR 掃碼' : '收合';
    });

    els.btnCopyLink.addEventListener('click', () => {
      const url = getWriteUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          els.btnCopyLink.textContent = '已複製 ✓';
          setTimeout(() => { els.btnCopyLink.textContent = '複製連結'; }, 1600);
        }).catch(() => {
          window.prompt('請複製寫信頁網址：', url);
        });
      } else {
        window.prompt('請複製寫信頁網址：', url);
      }
    });

    els.btnCloseModal.addEventListener('click', closeLetterModal);
    els.letterModal.addEventListener('click', (e) => {
      if (e.target === els.letterModal) closeLetterModal();
    });
    els.btnPrevLetter.addEventListener('click', () => stepLetter(-1));
    els.btnNextLetter.addEventListener('click', () => stepLetter(1));

    // GAS Settings Modal
    els.connStatus.addEventListener('click', () => {
      els.inputGasUrl.value = state.gasUrl;
      els.gasModal.hidden = false;
    });
    els.btnCloseGas.addEventListener('click', () => {
      els.gasModal.hidden = true;
    });
    els.gasModal.addEventListener('click', (e) => {
      if (e.target === els.gasModal) els.gasModal.hidden = true;
    });
    els.btnSaveGas.addEventListener('click', () => {
      const val = els.inputGasUrl.value.trim();
      if (!val || !val.startsWith('https://script.google.com/')) {
        window.alert('請輸入有效的 Google Apps Script Web App 網址（需以 https://script.google.com/ 開頭）');
        return;
      }
      state.gasUrl = val;
      try { localStorage.setItem(LS_GAS_KEY, val); } catch (err) { /* ignore */ }
      state.knownIds.clear();
      state.letters = [];
      state.lastTimestamp = '';
      renderQrCode();
      els.gasModal.hidden = true;
      refreshLetters(true);
    });
    els.btnClearGas.addEventListener('click', () => {
      state.gasUrl = '';
      try { localStorage.removeItem(LS_GAS_KEY); } catch (err) { /* ignore */ }
      state.knownIds.clear();
      state.letters = [];
      state.lastTimestamp = '';
      renderQrCode();
      els.gasModal.hidden = true;
      refreshLetters(true);
    });

    // Write Form
    els.inputMessage.maxLength = MAX_LEN;
    els.charCount.textContent = `0 / ${MAX_LEN}`;
    els.inputMessage.addEventListener('input', () => {
      const len = els.inputMessage.value.length;
      els.charCount.textContent = `${len} / ${MAX_LEN}`;
      els.charCount.classList.toggle('warn', len >= MAX_LEN - 10);
    });

    els.writeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      els.writeFeedback.hidden = true;
      const msg = els.inputMessage.value.trim();
      if (!msg) {
        els.writeFeedback.textContent = '請先寫下你想送出的專題留言！';
        els.writeFeedback.hidden = false;
        els.inputMessage.focus();
        return;
      }
      if (msg.length > MAX_LEN) {
        els.writeFeedback.textContent = `內容超過 ${MAX_LEN} 字上限，請精簡一點喔！`;
        els.writeFeedback.hidden = false;
        return;
      }

      els.btnSubmitLetter.disabled = true;
      els.btnSubmitLetter.textContent = '海鷗起飛中⋯⋯';

      try {
        const sender = els.inputSender.value.trim() || '海風訪客';
        const result = await submitLetter({
          group: state.selectedWriteGroup,
          sender,
          avatar: state.selectedAvatar,
          message: msg,
          clientId: getClientId()
        });

        const groupColor = findGroupMeta(state.selectedWriteGroup).color;
        els.successSeagullWrap.innerHTML = renderSeagullSvg(state.selectedAvatar, groupColor);
        els.successNote.textContent = result.status === 'pending'
          ? '信件已送入 Google 試算表審核清單，老師／管理員核准後就會起飛！'
          : (state.gasUrl
            ? '海鷗已飛向 Google 試算表與大螢幕，幾秒後就會出現在湘南天空中！'
            : '（展示模式）海鷗已帶著你的信起飛！切回大螢幕馬上就會看到閃亮 NEW 海鷗。');

        els.writeForm.hidden = true;
        els.writeSuccess.hidden = false;
      } catch (err) {
        els.writeFeedback.textContent = err.message || '送出失敗，請稍後再試一次。';
        els.writeFeedback.hidden = false;
      } finally {
        els.btnSubmitLetter.disabled = false;
        els.btnSubmitLetter.textContent = '🕊️ 放飛海鷗！';
      }
    });

    els.btnWriteAgain.addEventListener('click', () => {
      els.inputMessage.value = '';
      els.charCount.textContent = `0 / ${MAX_LEN}`;
      els.charCount.classList.remove('warn');
      els.writeSuccess.hidden = true;
      els.writeForm.hidden = false;
      els.inputMessage.focus();
    });

    // Cross-tab sync in Demo Mode
    window.addEventListener('storage', (e) => {
      if (e.key === LS_DEMO_KEY && !state.gasUrl) {
        refreshLetters(false);
      }
    });

    // Keyboard shortcuts on stage
    document.addEventListener('keydown', (e) => {
      if (state.view !== 'stage') return;
      if (!els.gasModal.hidden && e.key === 'Escape') {
        els.gasModal.hidden = true;
        return;
      }
      if (els.letterModal.hidden) return;
      if (e.key === 'Escape') closeLetterModal();
      else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        stepLetter(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepLetter(-1);
      }
    });

    window.addEventListener('resize', resizeCanvas);
    if (window.ResizeObserver && els.stageView) {
      new ResizeObserver(() => resizeCanvas()).observe(els.stageView);
    }
  }

  /* -------------------- Bootstrap -------------------- */

  function init() {
    if (CFG.eventTitle && els.eventTitle) els.eventTitle.textContent = CFG.eventTitle;
    if (CFG.eventSubtitle && els.eventSubtitle) els.eventSubtitle.textContent = CFG.eventSubtitle;
    if (CFG.eventTitle && els.writeTitle) els.writeTitle.textContent = `${CFG.eventTitle}・寄出你的信`;

    state.gasUrl = resolveGasUrl();
    const params = new URLSearchParams(window.location.search);
    const initialView = params.get('mode') === 'write' ? 'write' : 'stage';

    buildFilterPills();
    initEnvironment();
    bindEvents();
    setView(initialView);
    refreshLetters(true);
    startAnimationLoop();

    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      if (!document.hidden && state.gasUrl) {
        refreshLetters(false);
      }
    }, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
