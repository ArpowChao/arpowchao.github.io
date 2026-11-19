(function () {
  'use strict';

  const Physics = window.TransistorPhysics;
  if (!Physics) {
    console.error('TransistorPhysics not loaded');
    return;
  }

  const state = {
    mode: 'bjt',
    running: true,
    darkTheme: false,
    pn: { vd: 0.72 },
    bjt: { vbe: 0.72, vce: 5.0, wbUm: 0.8 },
    mosfet: { vgs: 3.5, vds: 2.5, vth: 1.0 }
  };

  const MODE_META = {
    pn: {
      buttons: [
        { id: 'pn-off', label: '🔴 逆偏阻斷 (-3.0 V)', apply: () => { state.pn.vd = -3.0; } },
        { id: 'pn-eq', label: '⚪ 熱平衡 (0 V)', apply: () => { state.pn.vd = 0.0; } },
        { id: 'pn-on', label: '🟢 順偏導通 (+0.72 V)', apply: () => { state.pn.vd = 0.72; } }
      ],
      primary: {
        label: '外加電壓 V_D',
        min: -4.0,
        max: 0.78,
        step: 0.01,
        minLbl: '-4.0 V（逆向偏壓・阻障牆變厚）',
        maxLbl: '+0.78 V（順向偏壓・阻障牆消失）',
        get: () => state.pn.vd,
        set: (v) => { state.pn.vd = v; },
        fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} V`
      },
      steps: [
        {
          num: 'STEP 1 · 中間阻障牆',
          title: '交界處形成「空乏區」',
          body: 'P 區電洞與 N 區電子在交界處相遇複合，留下不能移動的正負離子牆，就像在路上築起一道絕緣柵欄。'
        },
        {
          num: 'STEP 2 · 逆偏越撐越寬',
          title: '負電壓拉開兩側載子',
          body: 'P 區接負、N 區接正時，電源把電洞與電子往外拉走，中間阻障牆變厚、位能山丘墊高，電流完全過不去。'
        },
        {
          num: 'STEP 3 · 順偏推平山丘',
          title: '正電壓超過 ~0.6 V 就大導通',
          body: 'P 區接正、N 區接負時，電源推擠載子向中間靠近、壓扁阻障牆；一旦位能山丘夠低，電子就大量湧過接面。'
        }
      ]
    },
    bjt: {
      buttons: [
        { id: 'bjt-off', label: '🔴 關閉 OFF (B極 = 0 V)', apply: () => { state.bjt.vbe = 0.0; state.bjt.wbUm = 0.8; } },
        { id: 'bjt-on', label: '🟢 導通 ON (B極 = +0.72 V)', apply: () => { state.bjt.vbe = 0.72; state.bjt.wbUm = 0.8; } },
        { id: 'bjt-thick', label: '⚠️ 反事實：P 區太厚 (4.5 μm)', apply: () => { state.bjt.vbe = 0.72; state.bjt.wbUm = 4.5; } }
      ],
      primary: {
        label: 'B 極控制電壓 V_BE',
        min: 0.0,
        max: 0.82,
        step: 0.01,
        minLbl: '0.0 V（E–B 阻障牆擋住）',
        maxLbl: '+0.82 V（阻障消除・大量導通）',
        get: () => state.bjt.vbe,
        set: (v) => { state.bjt.vbe = v; },
        fmt: (v) => `+${v.toFixed(2)} V`
      },
      secondary: {
        label: '中間 P 區（基極）厚度',
        min: 0.4,
        max: 4.5,
        step: 0.1,
        minLbl: '極薄 0.4 μm（99% 直接穿過）',
        maxLbl: '過厚 4.5 μm（半途複合失效）',
        get: () => state.bjt.wbUm,
        set: (v) => { state.bjt.wbUm = v; },
        fmt: (v) => v <= 1.2 ? `${v.toFixed(1)} μm（極薄）` : `${v.toFixed(1)} μm（過厚）`
      },
      steps: [
        {
          num: 'STEP 1 · B 極開門',
          title: '微弱 +0.7 V 就把左牆壓平',
          body: '沒加 B 極電壓時，E–B 交界有高牆擋住電子。只要給 B 極約 +0.7 V，左邊閘門一打開，射極大量電子就湧入 P 區。'
        },
        {
          num: 'STEP 2 · 超薄 P 區秘訣',
          title: '電子來不及複合就穿過去',
          body: '中間 P 區設計得極薄（小於 1 微米）且電洞很少；99% 的電子根本來不及和電洞複合，就靠擴散衝到了右邊界。'
        },
        {
          num: 'STEP 3 · C 極電場瀑布',
          title: 'B 極小電流控制 C 極大電流',
          body: 'C 極接高正電 (+5 V)，在 B–C 交界形成陡峭的「電子溜滑梯」，瞬間把電子全吸走！B 極只需補回 1% 複合掉的電洞。'
        }
      ]
    },
    mosfet: {
      buttons: [
        { id: 'mos-off', label: '🔴 關閉 OFF (G極 = 0 V)', apply: () => { state.mosfet.vgs = 0.0; } },
        { id: 'mos-mid', label: '🟡 剛跨門檻 (G極 = 1.6 V)', apply: () => { state.mosfet.vgs = 1.6; } },
        { id: 'mos-on', label: '🟢 全開導通 ON (G極 = 3.5 V)', apply: () => { state.mosfet.vgs = 3.5; } }
      ],
      primary: {
        label: 'G 極控制電壓 V_GS（門檻 = 1.0 V）',
        min: 0.0,
        max: 5.0,
        step: 0.05,
        minLbl: '0.0 V（中間是 P 區斷路）',
        maxLbl: '+5.0 V（吸出寬闊電子橋）',
        get: () => state.mosfet.vgs,
        set: (v) => { state.mosfet.vgs = v; },
        fmt: (v) => `+${v.toFixed(2)} V`
      },
      steps: [
        {
          num: 'STEP 1 · 絕緣不漏電',
          title: 'G 極隔著絕緣玻璃層',
          body: '和 BJT 的 B 極不同，場效電晶體的 G 極下方有 SiO₂ 絕緣層，直流電流進不去（I_G = 0），純粹靠「電場」隔空施力。'
        },
        {
          num: 'STEP 2 · 感應電子橋',
          title: '正電場推走電洞、吸出 N 通道',
          body: '當 G 極加上超過門檻 (1.0 V) 的正電壓，向下穿透的電場會把 P 區的電洞推開，同時在表面吸聚大量電子，架出一座藍色「電子橋樑」。'
        },
        {
          num: 'STEP 3 · 左右暢通',
          title: '電子從 S 過橋直接衝進 D',
          body: '一旦藍色電子橋連通了左右兩塊 N⁺ 區，原本斷路的元件立刻變成導體，電子順暢從源極 (S) 流向汲極 (D) 點亮燈泡！'
        }
      ]
    }
  };

  const canvas = document.getElementById('sim-canvas');
  const ctx = canvas.getContext('2d');
  const stateButtonsEl = document.getElementById('state-buttons');
  const primarySlider = document.getElementById('primary-slider');
  const primaryLabel = document.getElementById('primary-label');
  const primaryVal = document.getElementById('primary-val');
  const primaryMinLbl = document.getElementById('primary-min-lbl');
  const primaryMaxLbl = document.getElementById('primary-max-lbl');

  const secondaryBox = document.getElementById('secondary-slider-box');
  const secondarySlider = document.getElementById('secondary-slider');
  const secondaryLabel = document.getElementById('secondary-label');
  const secondaryVal = document.getElementById('secondary-val');
  const secondaryMinLbl = document.getElementById('secondary-min-lbl');
  const secondaryMaxLbl = document.getElementById('secondary-max-lbl');

  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const statusReadout = document.getElementById('status-readout');
  const stepCardsEl = document.getElementById('step-cards');

  let sol = null;
  let particles = {
    electrons: [],
    holes: [],
    flashes: [],
    hillDots: [],
    spawnAcc: 0
  };
  let lastTime = performance.now();
  let animTime = 0;

  function fmtCurrent(ma) {
    const abs = Math.abs(ma);
    if (abs < 1e-4) return '0.00 mA';
    if (abs >= 1) return `${ma.toFixed(1)} mA`;
    return `${(ma * 1000).toFixed(0)} μA`;
  }

  function solveCurrentMode() {
    if (state.mode === 'pn') {
      sol = Physics.solvePNJunction({ na: 2e16, nd: 2e16, vd: state.pn.vd });
    } else if (state.mode === 'bjt') {
      sol = Physics.solveNPNBJT({
        vbe: state.bjt.vbe,
        vce: state.bjt.vce,
        wbUm: state.bjt.wbUm,
        nab: state.bjt.wbUm > 2.2 ? 1.2e17 : 2e16
      });
    } else {
      sol = Physics.solveNMOSFET({
        vgs: state.mosfet.vgs,
        vds: state.mosfet.vds,
        vth: state.mosfet.vth
      });
    }
  }

  function updateStatusAndButtons() {
    statusBadge.className = 'status-badge';

    if (sol.mode === 'pn') {
      if (sol.regime === 'forward') {
        statusBadge.textContent = '🟢 順向導通 ON';
        statusBadge.classList.add('on');
        statusText.textContent = '正偏壓壓扁中間阻障牆，N 區電子大量向左越過接面，燈泡亮起！';
        statusReadout.textContent = `通過電流 = ${fmtCurrent(sol.iNetMa)}`;
      } else if (sol.regime === 'reverse') {
        statusBadge.textContent = '🔴 逆向阻斷 OFF';
        statusBadge.classList.add('off');
        statusText.textContent = '負偏壓把中間阻障牆拉寬，電子被擋在右側過不去，燈泡熄滅。';
        statusReadout.textContent = '通過電流 ≈ 0 mA';
      } else {
        statusBadge.textContent = '⚪ 未加偏壓 0 V';
        statusBadge.classList.add('warn');
        statusText.textContent = '沒加電壓時，中間天然阻障牆剛好擋住兩邊載子，淨電流為零。';
        statusReadout.textContent = '通過電流 = 0.00 mA';
      }
    } else if (sol.mode === 'bjt') {
      if (sol.regime === 'cutoff') {
        statusBadge.textContent = '🔴 關閉斷路 OFF';
        statusBadge.classList.add('off');
        statusText.textContent = 'B 極未加正電，E–B 高牆死死擋住電子；就算 C 極接 +5 V 也沒電流！';
        statusReadout.textContent = 'I_C = 0 mA ｜ I_B = 0 mA';
      } else if (sol.betaF < 15) {
        statusBadge.textContent = '⚠️ 放大失靈（P 區太厚）';
        statusBadge.classList.add('warn');
        statusText.textContent = `P 區太厚！只有 ${(sol.alphaF * 100).toFixed(0)}% 電子衝到 C 極，其餘半途與電洞複合並從 B 極漏走。`;
        statusReadout.textContent = `到達 C 極 ${(sol.alphaF * 100).toFixed(0)}% ｜ 放大倍率 ${sol.betaF.toFixed(1)}×`;
      } else {
        statusBadge.textContent = '🟢 導通放大 ON';
        statusBadge.classList.add('on');
        statusText.textContent = `B 極消除左牆、P 區極薄，${(sol.alphaF * 100).toFixed(1)}% 電子直衝進 C 極點亮燈泡！`;
        statusReadout.textContent = `I_C = ${fmtCurrent(sol.icMa)} ｜ I_B = ${fmtCurrent(sol.ibMa)} (${sol.betaF.toFixed(0)}× 放大)`;
      }
    } else {
      if (sol.vgs < sol.vth) {
        statusBadge.textContent = '🔴 關閉斷路 OFF';
        statusBadge.classList.add('off');
        statusText.textContent = 'G 極電壓未達 1.0 V 門檻，表面沒有電子橋樑，左右兩塊 N⁺ 區彼此斷路！';
        statusReadout.textContent = 'I_D = 0.00 mA ｜ I_G = 0 (絕緣)';
      } else {
        statusBadge.textContent = '🟢 通道連通 ON';
        statusBadge.classList.add('on');
        statusText.textContent = 'G 極正電場推走表面電洞，吸出一座藍色「電子橋」連通 S 與 D，電子暢通亮燈！';
        statusReadout.textContent = `I_D = ${fmtCurrent(sol.idMa)} ｜ I_G = 0 (絕緣不耗電流)`;
      }
    }

    document.querySelectorAll('.state-btn').forEach((btn) => {
      const id = btn.dataset.stateId;
      let match = false;
      if (id === 'pn-off') match = state.mode === 'pn' && state.pn.vd <= -2.5;
      if (id === 'pn-eq') match = state.mode === 'pn' && Math.abs(state.pn.vd) < 0.05;
      if (id === 'pn-on') match = state.mode === 'pn' && state.pn.vd >= 0.68;
      if (id === 'bjt-off') match = state.mode === 'bjt' && state.bjt.vbe < 0.1;
      if (id === 'bjt-on') match = state.mode === 'bjt' && state.bjt.vbe >= 0.68 && state.bjt.wbUm <= 1.0;
      if (id === 'bjt-thick') match = state.mode === 'bjt' && state.bjt.wbUm >= 4.0;
      if (id === 'mos-off') match = state.mode === 'mosfet' && state.mosfet.vgs < 0.2;
      if (id === 'mos-mid') match = state.mode === 'mosfet' && Math.abs(state.mosfet.vgs - 1.6) < 0.2;
      if (id === 'mos-on') match = state.mode === 'mosfet' && state.mosfet.vgs >= 3.2;
      btn.classList.toggle('active', match);
    });
  }

  function renderModeControls() {
    const meta = MODE_META[state.mode];

    stateButtonsEl.innerHTML = '';
    meta.buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'state-btn';
      btn.dataset.stateId = b.id;
      btn.textContent = b.label;
      btn.addEventListener('click', () => {
        b.apply();
        syncSlidersToState();
        solveCurrentMode();
        updateStatusAndButtons();
      });
      stateButtonsEl.appendChild(btn);
    });

    primaryLabel.textContent = meta.primary.label;
    primarySlider.min = meta.primary.min;
    primarySlider.max = meta.primary.max;
    primarySlider.step = meta.primary.step;
    primaryMinLbl.textContent = meta.primary.minLbl;
    primaryMaxLbl.textContent = meta.primary.maxLbl;

    if (meta.secondary) {
      secondaryBox.hidden = false;
      secondaryLabel.textContent = meta.secondary.label;
      secondarySlider.min = meta.secondary.min;
      secondarySlider.max = meta.secondary.max;
      secondarySlider.step = meta.secondary.step;
      secondaryMinLbl.textContent = meta.secondary.minLbl;
      secondaryMaxLbl.textContent = meta.secondary.maxLbl;
    } else {
      secondaryBox.hidden = true;
    }

    syncSlidersToState();

    stepCardsEl.innerHTML = '';
    meta.steps.forEach((s) => {
      const card = document.createElement('article');
      card.className = 'step-card';
      card.innerHTML = `<span class="step-num">${s.num}</span><h3>${s.title}</h3><p>${s.body}</p>`;
      stepCardsEl.appendChild(card);
    });
  }

  function syncSlidersToState() {
    const meta = MODE_META[state.mode];
    const v1 = meta.primary.get();
    primarySlider.value = v1;
    primaryVal.textContent = meta.primary.fmt(v1);

    if (meta.secondary) {
      const v2 = meta.secondary.get();
      secondarySlider.value = v2;
      secondaryVal.textContent = meta.secondary.fmt(v2);
    }
  }

  function resetParticles() {
    particles.electrons = [];
    particles.holes = [];
    particles.flashes = [];
    particles.hillDots = [];
    particles.spawnAcc = 0;

    if (state.mode === 'pn') {
      for (let i = 0; i < 28; i++) {
        particles.electrons.push({
          u: 0.56 + Math.random() * 0.40,
          v: 0.14 + Math.random() * 0.72,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16
        });
        particles.holes.push({
          u: 0.04 + Math.random() * 0.40,
          v: 0.14 + Math.random() * 0.72,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12
        });
      }
      for (let i = 0; i < 8; i++) {
        particles.hillDots.push({ u: 0.55 + Math.random() * 0.40, dir: -1 });
      }
    } else if (state.mode === 'bjt') {
      for (let i = 0; i < 26; i++) {
        particles.electrons.push({
          kind: 'bulk',
          u: 0.03 + Math.random() * 0.24,
          v: 0.16 + Math.random() * 0.68,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18
        });
      }
      for (let i = 0; i < 10; i++) {
        particles.holes.push({
          u: 0.34 + Math.random() * 0.08,
          v: 0.16 + Math.random() * 0.68,
          vx: (Math.random() - 0.5) * 0.10,
          vy: (Math.random() - 0.5) * 0.10
        });
      }
      for (let i = 0; i < 9; i++) {
        particles.hillDots.push({ u: Math.random() * 0.9, dir: 1 });
      }
    } else {
      for (let i = 0; i < 22; i++) {
        particles.electrons.push({
          kind: 'source',
          u: 0.04 + Math.random() * 0.16,
          v: 0.08 + Math.random() * 0.28,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15
        });
      }
      for (let i = 0; i < 18; i++) {
        particles.electrons.push({
          kind: 'bridge',
          u: 0.18 + (i / 18) * 0.66,
          v: 0.05 + Math.random() * 0.09
        });
      }
      for (let i = 0; i < 16; i++) {
        particles.holes.push({
          u: 0.10 + Math.random() * 0.80,
          v: 0.50 + Math.random() * 0.38,
          vx: (Math.random() - 0.5) * 0.10,
          vy: (Math.random() - 0.5) * 0.10
        });
      }
      for (let i = 0; i < 9; i++) {
        particles.hillDots.push({ u: Math.random() * 0.9, dir: 1 });
      }
    }
  }

  function updateParticles(dt) {
    if (!sol) return;

    for (let i = particles.flashes.length - 1; i >= 0; i--) {
      particles.flashes[i].life -= dt * 1.9;
      if (particles.flashes[i].life <= 0) particles.flashes.splice(i, 1);
    }

    if (sol.mode === 'pn') {
      const xpNorm = Math.min(0.42, sol.xpUm / 3.2);
      const xnNorm = Math.min(0.42, sol.xnUm / 3.2);
      const depL = 0.5 - xpNorm;
      const depR = 0.5 + xnNorm;
      const isForward = sol.regime === 'forward';
      const drive = isForward ? Math.min(1.0, Math.max(0.25, (sol.vd - 0.45) * 2.6)) : 0;

      particles.electrons.forEach((e) => {
        if (isForward) {
          e.u -= (0.26 * drive) * dt;
          e.v += (Math.random() - 0.5) * 0.25 * dt;
          if (e.u < 0.08 + Math.random() * 0.22) {
            if (e.u < 0.38 && Math.random() < 0.25) {
              particles.flashes.push({ u: e.u, v: e.v, life: 1.0 });
            }
            e.u = 0.95;
            e.v = 0.14 + Math.random() * 0.72;
          }
        } else {
          e.vx = (e.vx + (Math.random() - 0.5) * 0.5 * dt) * 0.94;
          e.vy = (e.vy + (Math.random() - 0.5) * 0.5 * dt) * 0.94;
          e.u += e.vx * dt;
          e.v += e.vy * dt;
          if (e.u < depR + 0.02) { e.u = depR + 0.02; e.vx = Math.abs(e.vx) + 0.07; }
          if (e.u > 0.96) { e.u = 0.96; e.vx = -Math.abs(e.vx); }
        }
        e.v = Math.min(0.86, Math.max(0.14, e.v));
      });

      particles.holes.forEach((h) => {
        if (isForward) {
          h.u += (0.18 * drive) * dt;
          h.v += (Math.random() - 0.5) * 0.2 * dt;
          if (h.u > 0.65 + Math.random() * 0.25) {
            h.u = 0.04;
            h.v = 0.14 + Math.random() * 0.72;
          }
        } else {
          h.vx = (h.vx + (Math.random() - 0.5) * 0.4 * dt) * 0.94;
          h.vy = (h.vy + (Math.random() - 0.5) * 0.4 * dt) * 0.94;
          h.u += h.vx * dt;
          h.v += h.vy * dt;
          if (h.u > depL - 0.02) { h.u = depL - 0.02; h.vx = -Math.abs(h.vx) - 0.07; }
          if (h.u < 0.04) { h.u = 0.04; h.vx = Math.abs(h.vx); }
        }
        h.v = Math.min(0.86, Math.max(0.14, h.v));
      });

      particles.hillDots.forEach((d) => {
        if (isForward) {
          d.u -= 0.25 * drive * dt;
          if (d.u < 0.05) d.u = 0.95;
        } else {
          d.u += d.dir * 0.14 * dt;
          if (d.u < depR + 0.02) { d.u = depR + 0.02; d.dir = 1; }
          if (d.u > 0.95) { d.u = 0.95; d.dir = -1; }
        }
      });
    } else if (sol.mode === 'bjt') {
      const emitEnd = 0.28;
      const baseFrac = 0.09 + ((sol.wbUm - 0.3) / 4.2) * 0.28;
      const baseEnd = emitEnd + baseFrac;
      const isOn = sol.regime !== 'cutoff';
      const activity = isOn ? Math.min(1.0, Math.max(0.25, Math.log10(1 + Math.max(0, sol.ieMa) * 2.5) / 2.0)) : 0;

      const streamCount = particles.electrons.filter((p) => p.kind === 'stream').length;
      const targetStream = Math.round(activity * 28);
      particles.spawnAcc += dt * targetStream * 1.6;
      while (streamCount < targetStream && particles.spawnAcc >= 1) {
        particles.spawnAcc -= 1;
        const willSurvive = Math.random() < sol.alphaF;
        particles.electrons.push({
          kind: 'stream',
          u: 0.04,
          v: 0.22 + Math.random() * 0.56,
          vx: 0.30,
          vy: 0,
          fate: willSurvive ? 'survive' : 'recombine',
          recombU: emitEnd + baseFrac * (0.25 + Math.random() * 0.55)
        });
      }

      for (let i = particles.electrons.length - 1; i >= 0; i--) {
        const e = particles.electrons[i];
        if (e.kind === 'bulk') {
          e.vx = (e.vx + (Math.random() - 0.5) * 0.55 * dt) * 0.92;
          e.vy = (e.vy + (Math.random() - 0.5) * 0.55 * dt) * 0.92;
          e.u += e.vx * dt;
          e.v += e.vy * dt;
          if (e.u < 0.03) { e.u = 0.03; e.vx = Math.abs(e.vx); }
          if (e.u > emitEnd - 0.02) { e.u = emitEnd - 0.02; e.vx = -Math.abs(e.vx) - 0.08; }
          e.v = Math.min(0.84, Math.max(0.16, e.v));
        } else {
          if (!isOn) {
            particles.electrons.splice(i, 1);
            continue;
          }
          if (e.u < emitEnd) {
            e.vx = 0.34;
          } else if (e.u < baseEnd) {
            e.vx = Math.max(0.14, 0.28 * (0.8 / Math.max(0.45, sol.wbUm)));
            e.vy = (Math.random() - 0.5) * 0.14;
            if (e.fate === 'recombine' && e.u >= e.recombU) {
              particles.flashes.push({ u: e.u, v: e.v, life: 1.0 });
              particles.holes.push({
                u: emitEnd + baseFrac * 0.5,
                v: 0.04,
                isReplacement: true,
                targetV: e.v
              });
              particles.electrons.splice(i, 1);
              continue;
            }
          } else {
            e.vx = Math.min(1.15, e.vx + 1.8 * dt);
            e.vy *= 0.85;
          }
          e.u += e.vx * dt;
          e.v = Math.min(0.84, Math.max(0.16, e.v + e.vy * dt));
          if (e.u > 0.97) particles.electrons.splice(i, 1);
        }
      }

      for (let i = particles.holes.length - 1; i >= 0; i--) {
        const h = particles.holes[i];
        if (h.isReplacement) {
          h.v += 0.35 * dt;
          if (h.v >= h.targetV) particles.holes.splice(i, 1);
          continue;
        }
        h.vx = (h.vx + (Math.random() - 0.5) * 0.3 * dt) * 0.92;
        h.vy = (h.vy + (Math.random() - 0.5) * 0.3 * dt) * 0.92;
        h.u += h.vx * dt;
        h.v += h.vy * dt;
        if (h.u < emitEnd + 0.015) { h.u = emitEnd + 0.015; h.vx = Math.abs(h.vx); }
        if (h.u > baseEnd - 0.015) { h.u = baseEnd - 0.015; h.vx = -Math.abs(h.vx); }
        h.v = Math.min(0.82, Math.max(0.18, h.v));
      }

      particles.hillDots.forEach((d) => {
        if (!isOn) {
          d.u += d.dir * 0.14 * dt;
          if (d.u > emitEnd - 0.02) { d.u = emitEnd - 0.02; d.dir = -1; }
          if (d.u < 0.04) { d.u = 0.04; d.dir = 1; }
        } else {
          const speed = d.u > baseEnd ? 0.65 : 0.28;
          d.u += speed * activity * dt;
          if (d.u > 0.96) d.u = 0.04;
        }
      });
    } else {
      const hasBridge = sol.vgs >= sol.vth;
      const bridgeSpeed = hasBridge ? Math.min(0.75, 0.18 + sol.idMa * 0.03) : 0;

      particles.electrons.forEach((e) => {
        if (e.kind === 'source') {
          e.vx = (e.vx + (Math.random() - 0.5) * 0.4 * dt) * 0.92;
          e.vy = (e.vy + (Math.random() - 0.5) * 0.4 * dt) * 0.92;
          e.u = Math.min(0.20, Math.max(0.03, e.u + e.vx * dt));
          e.v = Math.min(0.32, Math.max(0.06, e.v + e.vy * dt));
        } else {
          if (!hasBridge) {
            if (e.u > 0.21 && e.u < 0.79) e.u = e.u < 0.5 ? 0.16 : 0.84;
            e.u = Math.min(0.95, Math.max(0.05, e.u + (Math.random() - 0.5) * 0.08 * dt));
            e.v = 0.08 + Math.random() * 0.18;
          } else {
            e.u += bridgeSpeed * dt;
            e.v = 0.045 + 0.04 * (1 + Math.sin(e.u * 22 + animTime * 3));
            if (e.u > 0.93) e.u = 0.16;
          }
        }
      });

      particles.holes.forEach((h) => {
        h.vx = (h.vx + (Math.random() - 0.5) * 0.25 * dt) * 0.92;
        h.vy = (h.vy + (Math.random() - 0.5) * 0.25 * dt) * 0.92;
        h.u = Math.min(0.94, Math.max(0.06, h.u + h.vx * dt));
        const minDepth = hasBridge ? 0.48 + Math.min(0.22, (sol.vgs - sol.vth) * 0.06) : 0.22;
        h.v = Math.min(0.92, Math.max(minDepth, h.v + h.vy * dt));
      });

      particles.hillDots.forEach((d) => {
        if (!hasBridge) {
          d.u += d.dir * 0.12 * dt;
          if (d.u > 0.20) { d.u = 0.20; d.dir = -1; }
          if (d.u < 0.04) { d.u = 0.04; d.dir = 1; }
        } else {
          d.u += (0.25 + bridgeSpeed * 0.4) * dt;
          if (d.u > 0.96) d.u = 0.04;
        }
      });
    }
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width * dpr));
    const h = Math.max(420, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { dpr, w: canvas.width / dpr, h: canvas.height / dpr };
  }

  function drawArrow(x1, y1, x2, y2, color, width, head) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ux = dx / len;
    const uy = dy / len;
    const hs = head || 8;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - ux * hs * 0.7, y2 - uy * hs * 0.7);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * hs - uy * hs * 0.52, y2 - uy * hs + ux * hs * 0.52);
    ctx.lineTo(x2 - ux * hs + uy * hs * 0.52, y2 - uy * hs - ux * hs * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawElectron(x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 7;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#031524';
    ctx.font = `bold ${Math.round(r * 1.45)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('−', x, y + 0.5);
    ctx.restore();
  }

  function drawHole(x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fb7185';
    ctx.shadowColor = '#fb7185';
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#29040e';
    ctx.font = `bold ${Math.round(r * 1.35)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', x, y + 0.5);
    ctx.restore();
  }

  function drawLamp(cx, cy, brightness, label) {
    ctx.save();
    if (brightness > 0.05) {
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 34);
      glow.addColorStop(0, `rgba(253, 224, 71, ${0.75 * brightness})`);
      glow.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = brightness > 0.05
      ? `rgba(250, 204, 21, ${0.35 + 0.65 * brightness})`
      : '#1e293b';
    ctx.fill();
    ctx.strokeStyle = brightness > 0.05 ? '#fde047' : '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = brightness > 0.4 ? '#0f172a' : '#cbd5e1';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💡', cx, cy + 1);

    ctx.fillStyle = brightness > 0.05 ? '#fde047' : '#94a3b8';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(label, cx, cy + 26);
    ctx.restore();
  }

  function drawFlashes(slabX, slabY, slabW, slabH) {
    particles.flashes.forEach((f) => {
      const fx = slabX + f.u * slabW;
      const fy = slabY + f.v * slabH;
      const rad = 6 + (1 - f.life) * 14;
      ctx.save();
      ctx.beginPath();
      ctx.arc(fx, fy, rad, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(251, 191, 36, ${f.life})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = `rgba(254, 240, 138, ${f.life})`;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('複合!', fx, fy - rad - 4);
      ctx.restore();
    });
  }

  function drawCalloutPill(cx, cy, text, bgColor, borderColor, textColor) {
    ctx.save();
    ctx.font = 'bold 12.5px sans-serif';
    const tw = ctx.measureText(text).width;
    const pw = tw + 18;
    const ph = 24;
    ctx.fillStyle = bgColor || 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = borderColor || '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - pw * 0.5, cy - ph * 0.5, pw, ph, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = textColor || '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }

  function renderCanvas() {
    const { dpr, w, h } = resizeCanvas();
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#071222';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 32) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += 32) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    const slabX = Math.round(w * 0.10);
    const slabW = Math.round(w * 0.74);
    const slabY = 70;
    const slabH = Math.round(h * 0.42);
    const hillTop = Math.round(h * 0.67);
    const hillH = h - hillTop - 22;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(20, hillTop - 16);
    ctx.lineTo(w - 20, hillTop - 16);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('▼ 同步對照：電子感受到的「位能山丘（溜滑梯）」— 上坡會被擋住、下坡會自動加速衝過去', 22, hillTop - 24);

    if (sol.mode === 'pn') {
      drawPN(w, h, slabX, slabY, slabW, slabH, hillTop, hillH);
    } else if (sol.mode === 'bjt') {
      drawBJT(w, h, slabX, slabY, slabW, slabH, hillTop, hillH);
    } else {
      drawMOSFET(w, h, slabX, slabY, slabW, slabH, hillTop, hillH);
    }

    ctx.restore();
  }

  function drawPN(w, h, slabX, slabY, slabW, slabH, hillTop, hillH) {
    const jX = slabX + slabW * 0.5;
    const xpPx = Math.min(slabW * 0.42, (sol.xpUm / 3.2) * slabW);
    const xnPx = Math.min(slabW * 0.42, (sol.xnUm / 3.2) * slabW);
    const isForward = sol.regime === 'forward';
    const brightness = isForward ? Math.min(1, Math.max(0.25, sol.iNetMa / 2.5)) : 0;

    ctx.fillStyle = 'rgba(225, 29, 72, 0.16)';
    ctx.fillRect(slabX, slabY, slabW * 0.5, slabH);
    ctx.fillStyle = 'rgba(14, 165, 233, 0.16)';
    ctx.fillRect(jX, slabY, slabW * 0.5, slabH);

    const depX = jX - xpPx;
    const depW = xpPx + xnPx;
    ctx.fillStyle = isForward ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.25)';
    ctx.fillRect(depX, slabY, depW, slabH);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = isForward ? 1.2 : 2.2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(depX, slabY + 1, depW, slabH - 2);
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(203, 213, 225, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(slabX, slabY, slabW, slabH);

    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#fda4af';
    ctx.textAlign = 'left';
    ctx.fillText('P 型區（電洞 +）', slabX + 14, slabY + 24);
    ctx.fillStyle = '#7dd3fc';
    ctx.textAlign = 'right';
    ctx.fillText('N 型區（電子 −）', slabX + slabW - 14, slabY + 24);

    if (isForward) {
      drawCalloutPill(jX, slabY - 22, '阻障牆變薄 → 電子由 N 區向左湧過接面！', 'rgba(5, 150, 105, 0.25)', '#34d399', '#a7f3d0');
    } else {
      drawCalloutPill(jX, slabY - 22, `🚧 空乏區阻障牆 (${sol.wUm.toFixed(2)} μm) 擋住電子`, 'rgba(217, 119, 6, 0.25)', '#fbbf24', '#fde68a');
    }

    particles.electrons.forEach((e) => drawElectron(slabX + e.u * slabW, slabY + e.v * slabH, 5.4));
    particles.holes.forEach((p) => drawHole(slabX + p.u * slabW, slabY + p.v * slabH, 5.4));
    drawFlashes(slabX, slabY, slabW, slabH);

    const lampX = slabX + slabW + (w - slabX - slabW) * 0.5;
    const lampY = slabY + slabH * 0.5;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(slabX + slabW, lampY);
    ctx.lineTo(lampX - 16, lampY);
    ctx.moveTo(lampX + 16, lampY);
    ctx.lineTo(Math.min(w - 6, lampX + 34), lampY);
    ctx.stroke();
    drawLamp(lampX, lampY, brightness, isForward ? '導通亮燈' : '斷路熄滅');

    if (isForward) {
      drawArrow(jX + 90, slabY + slabH + 22, jX - 90, slabY + slabH + 22, '#34d399', 3, 9);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('← 電子實際流向（由 N 區越過接面進入 P 區）', jX, slabY + slabH + 40);
    }

    const leftY = hillTop + hillH * 0.20;
    const rightY = Math.min(hillTop + hillH * 0.88, leftY + (sol.veff / 3.8) * (hillH * 0.68));
    const mapHillY = (u) => {
      const xPix = slabX + u * slabW;
      if (xPix <= depX) return leftY;
      if (xPix >= depX + depW) return rightY;
      const t = (xPix - depX) / Math.max(depW, 1);
      return leftY + (rightY - leftY) * (3 * t * t - 2 * t * t * t);
    };

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const u = i / 80;
      const px = slabX + u * slabW;
      const py = mapHillY(u);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    particles.hillDots.forEach((d) => {
      drawElectron(slabX + d.u * slabW, mapHillY(d.u) - 7, 5);
    });

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('P 側（電子爬坡後）', slabX + 6, leftY - 8);
    ctx.textAlign = 'right';
    ctx.fillText(isForward ? '山坡已變平，電子輕鬆翻過去！' : '山坡太陡，電子爬不上去！', slabX + slabW - 6, Math.min(hillTop + hillH - 6, rightY + 16));
  }

  function drawBJT(w, h, slabX, slabY, slabW, slabH, hillTop, hillH) {
    const emitEnd = 0.28;
    const baseFrac = 0.09 + ((sol.wbUm - 0.3) / 4.2) * 0.28;
    const baseEnd = emitEnd + baseFrac;

    const xEB = slabX + slabW * emitEnd;
    const xBC = slabX + slabW * baseEnd;
    const bxMid = (xEB + xBC) * 0.5;
    const isOn = sol.regime !== 'cutoff';
    const isThick = sol.betaF < 15 && isOn;
    const brightness = !isOn ? 0 : (isThick ? 0.22 : Math.min(1.0, Math.max(0.4, sol.icMa / 35)));

    ctx.fillStyle = 'rgba(14, 165, 233, 0.22)';
    ctx.fillRect(slabX, slabY, xEB - slabX, slabH);
    ctx.fillStyle = 'rgba(225, 29, 72, 0.22)';
    ctx.fillRect(xEB, slabY, xBC - xEB, slabH);
    ctx.fillStyle = 'rgba(14, 165, 233, 0.14)';
    ctx.fillRect(xBC, slabY, slabX + slabW - xBC, slabH);

    if (!isOn) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.32)';
      ctx.fillRect(xEB - 14, slabY, 28, slabH);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(xEB - 14, slabY + 1, 28, slabH - 2);
      ctx.setLineDash([]);
    }

    const wfW = Math.min(slabX + slabW - xBC - 10, 88);
    const wfGrad = ctx.createLinearGradient(xBC, slabY, xBC + wfW, slabY);
    wfGrad.addColorStop(0, 'rgba(168, 85, 247, 0.26)');
    wfGrad.addColorStop(1, 'rgba(168, 85, 247, 0.02)');
    ctx.fillStyle = wfGrad;
    ctx.fillRect(xBC, slabY, wfW, slabH);

    ctx.strokeStyle = 'rgba(203, 213, 225, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(slabX, slabY, slabW, slabH);

    ctx.font = 'bold 13.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('N⁺ 射極 (E)', (slabX + xEB) * 0.5, slabY + 22);
    ctx.fillStyle = '#fda4af';
    ctx.fillText(`P 基極 (${sol.wbUm.toFixed(1)}μm)`, bxMid, slabY + 22);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('N 集極 (C)', (xBC + slabX + slabW) * 0.5, slabY + 22);

    ctx.fillStyle = isOn ? '#34d399' : '#fb7185';
    ctx.fillRect(bxMid - 18, slabY - 12, 36, 12);
    ctx.strokeStyle = isOn ? '#34d399' : '#fb7185';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(bxMid, slabY - 12);
    ctx.lineTo(bxMid, slabY - 38);
    ctx.stroke();

    if (!isOn) {
      drawCalloutPill(bxMid, slabY - 48, `B 極 = 0 V（未打開閘門）`, 'rgba(225, 29, 72, 0.25)', '#fb7185', '#fecdd3');
      drawCalloutPill(xEB, slabY + slabH * 0.5, '🚧 E–B 阻障牆（擋住電子）', 'rgba(217, 119, 6, 0.35)', '#fbbf24', '#fef3c7');
    } else {
      drawCalloutPill((slabX + xEB) * 0.5, 22, `① B 極 +${sol.vbe.toFixed(2)}V 消掉左牆`, 'rgba(5, 150, 105, 0.28)', '#34d399', '#a7f3d0');
      drawCalloutPill((xBC + slabX + slabW) * 0.52, 22, `③ C 極 +5V 電場瀑布把電子吸走！`, 'rgba(139, 92, 246, 0.28)', '#c084fc', '#e9d5ff');
      if (isThick) {
        drawCalloutPill(bxMid, slabY + slabH * 0.5, '⚠️ P 區太厚，電子半途撞電洞複合消失！', 'rgba(225, 29, 72, 0.35)', '#fb7185', '#fecdd3');
      } else {
        drawArrow(xBC + 6, slabY + slabH * 0.5, xBC + wfW - 8, slabY + slabH * 0.5, '#c084fc', 3, 9);
      }
    }

    particles.electrons.forEach((e) => drawElectron(slabX + e.u * slabW, slabY + e.v * slabH, e.kind === 'stream' ? 5.6 : 4.5));
    particles.holes.forEach((p) => drawHole(slabX + p.u * slabW, slabY + p.v * slabH, 4.8));
    drawFlashes(slabX, slabY, slabW, slabH);

    const lampX = slabX + slabW + (w - slabX - slabW) * 0.5;
    const lampY = slabY + slabH * 0.5;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(slabX + slabW, lampY);
    ctx.lineTo(lampX - 16, lampY);
    ctx.moveTo(lampX + 16, lampY);
    ctx.lineTo(Math.min(w - 6, lampX + 34), lampY);
    ctx.stroke();
    drawLamp(lampX, lampY, brightness, !isOn ? '斷路熄滅' : (isThick ? '微弱發光' : '導通大亮'));

    if (isOn) {
      drawArrow(xEB - 30, slabY + slabH + 22, xBC + 110, slabY + slabH + 22, '#34d399', 3, 9);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`電子流方向：射極 (E) → 薄基極 (B) → 集極 (C) ｜ ${(sol.alphaF * 100).toFixed(1)}% 成功抵達！`, (xEB + xBC) * 0.5 + 40, slabY + slabH + 40);
    }

    const eLevel = hillTop + hillH * 0.42;
    const bHeightPx = (sol.vBarEB / 1.0) * (hillH * 0.36);
    const bLevel = Math.max(hillTop + 10, eLevel - bHeightPx);
    const cLevel = hillTop + hillH * 0.88;

    const mapHillY = (u) => {
      if (u < emitEnd - 0.04) return eLevel;
      if (u < emitEnd + 0.04) {
        const t = (u - (emitEnd - 0.04)) / 0.08;
        return eLevel + (bLevel - eLevel) * (3 * t * t - 2 * t * t * t);
      }
      if (u < baseEnd - 0.03) return bLevel;
      if (u < baseEnd + 0.09) {
        const t = (u - (baseEnd - 0.03)) / 0.12;
        return bLevel + (cLevel - bLevel) * (3 * t * t - 2 * t * t * t);
      }
      return cLevel;
    };

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      const px = slabX + u * slabW;
      const py = mapHillY(u);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    particles.hillDots.forEach((d) => {
      drawElectron(slabX + d.u * slabW, mapHillY(d.u) - 7, 5);
    });

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(isOn ? 'B 極把門檻壓低，電子輕鬆翻過去！' : 'E–B 牆太高，電子被彈回！', slabX + 6, eLevel + 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c084fc';
    ctx.fillText('B–C 電場大溜滑梯 → 衝向集極 C', slabX + slabW - 6, cLevel - 10);
  }

  function drawMOSFET(w, h, slabX, slabY, slabW, slabH, hillTop, hillH) {
    const pocketW = slabW * 0.22;
    const pocketH = slabH * 0.36;
    const chLeft = slabX + pocketW;
    const chW = slabW - 2 * pocketW;
    const hasBridge = sol.vgs >= sol.vth;
    const brightness = hasBridge ? Math.min(1.0, Math.max(0.28, sol.idMa / 12)) : 0;

    ctx.fillStyle = 'rgba(225, 29, 72, 0.16)';
    ctx.fillRect(slabX, slabY, slabW, slabH);

    ctx.fillStyle = 'rgba(14, 165, 233, 0.30)';
    ctx.fillRect(slabX, slabY, pocketW, pocketH);
    ctx.fillRect(slabX + slabW - pocketW, slabY, pocketW, pocketH);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(slabX, slabY, pocketW, pocketH);
    ctx.strokeRect(slabX + slabW - pocketW, slabY, pocketW, pocketH);

    if (hasBridge) {
      const bridgeThick = Math.min(38, 16 + ((sol.vgs - sol.vth) / 4.0) * 22);
      const bGrad = ctx.createLinearGradient(chLeft, slabY, chLeft + chW, slabY);
      bGrad.addColorStop(0, 'rgba(34, 211, 238, 0.85)');
      bGrad.addColorStop(1, 'rgba(56, 189, 248, 0.55)');
      ctx.save();
      ctx.fillStyle = bGrad;
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(chLeft, slabY);
      ctx.lineTo(chLeft + chW, slabY);
      ctx.lineTo(chLeft + chW, slabY + bridgeThick * 0.65);
      ctx.lineTo(chLeft, slabY + bridgeThick);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      drawCalloutPill(slabX + slabW * 0.5, slabY + slabH * 0.45, '🚧 中間是 P 區（無自由電子）→ 左右斷路 OFF', 'rgba(225, 29, 72, 0.28)', '#fb7185', '#fecdd3');
    }

    const oxH = 20;
    ctx.fillStyle = 'rgba(94, 234, 212, 0.24)';
    ctx.fillRect(chLeft - 6, slabY - oxH, chW + 12, oxH);
    ctx.strokeStyle = '#5eead4';
    ctx.strokeRect(chLeft - 6, slabY - oxH, chW + 12, oxH);

    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(chLeft + 8, slabY - oxH - 14, chW - 16, 14);

    if (sol.vgs > 0.2) {
      for (let i = 0; i < 5; i++) {
        const ax = chLeft + ((i + 0.5) * chW) / 5;
        drawArrow(ax, slabY - oxH - 2, ax, slabY + 18, '#fde047', 2.2, 6);
      }
    }

    ctx.strokeStyle = 'rgba(203, 213, 225, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(slabX, slabY, slabW, slabH);

    ctx.font = 'bold 13.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('N⁺ 源極 (S)', slabX + pocketW * 0.5, slabY + pocketH * 0.65);
    ctx.fillText('N⁺ 汲極 (D)', slabX + slabW - pocketW * 0.5, slabY + pocketH * 0.65);
    ctx.fillStyle = '#fda4af';
    ctx.fillText('P 型基底（電洞被正電場往下推離）', slabX + slabW * 0.5, slabY + slabH - 14);
    ctx.fillStyle = '#99f6e4';
    ctx.font = 'bold 11.5px sans-serif';
    ctx.fillText('SiO₂ 絕緣層（電子過不去，只傳遞電場）', slabX + slabW * 0.5, slabY - 6);

    drawCalloutPill(
      slabX + slabW * 0.5,
      slabY - oxH - 28,
      `G 極 +${sol.vgs.toFixed(2)} V ${hasBridge ? '➔ 吸出電子橋！' : '（低於 1.0V 門檻）'}`,
      hasBridge ? 'rgba(5, 150, 105, 0.28)' : 'rgba(15, 23, 42, 0.9)',
      hasBridge ? '#34d399' : '#fbbf24',
      hasBridge ? '#a7f3d0' : '#fde68a'
    );

    if (hasBridge) {
      drawCalloutPill(slabX + slabW * 0.5, slabY + 56, '✨ N 型電子通道橋樑（左右 N⁺ 區連通！）', 'rgba(6, 182, 212, 0.28)', '#22d3ee', '#cffafe');
    }

    particles.electrons.forEach((e) => drawElectron(slabX + e.u * slabW, slabY + e.v * slabH, 5.2));
    particles.holes.forEach((p) => drawHole(slabX + p.u * slabW, slabY + p.v * slabH, 4.8));

    const lampX = slabX + slabW + (w - slabX - slabW) * 0.5;
    const lampY = slabY + slabH * 0.5;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(slabX + slabW, lampY);
    ctx.lineTo(lampX - 16, lampY);
    ctx.moveTo(lampX + 16, lampY);
    ctx.lineTo(Math.min(w - 6, lampX + 34), lampY);
    ctx.stroke();
    drawLamp(lampX, lampY, brightness, hasBridge ? '導通亮燈' : '斷路熄滅');

    if (hasBridge) {
      drawArrow(chLeft + 10, slabY + slabH + 22, chLeft + chW - 10, slabY + slabH + 22, '#34d399', 3, 9);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('電子實際流向：從 S 走藍色「電子橋」流向 D ➔', slabX + slabW * 0.5, slabY + slabH + 40);
    }

    const sLevel = hillTop + hillH * 0.42;
    const dLevel = hillTop + hillH * 0.82;
    const chHeight = hasBridge
      ? sLevel - Math.max(0.02, 0.14 - (sol.vgs - sol.vth) * 0.03) * hillH
      : hillTop + hillH * 0.10;

    const mapHillY = (u) => {
      if (u < 0.20) return sLevel;
      if (u < 0.26) {
        const t = (u - 0.20) / 0.06;
        return sLevel + (chHeight - sLevel) * (3 * t * t - 2 * t * t * t);
      }
      if (u < 0.74) {
        const t = (u - 0.26) / 0.48;
        const slopeEnd = hasBridge ? (chHeight + (dLevel - chHeight) * 0.55) : chHeight;
        return chHeight + (slopeEnd - chHeight) * t;
      }
      if (u < 0.82) {
        const t = (u - 0.74) / 0.08;
        const slopeEnd = hasBridge ? (chHeight + (dLevel - chHeight) * 0.55) : chHeight;
        return slopeEnd + (dLevel - slopeEnd) * (3 * t * t - 2 * t * t * t);
      }
      return dLevel;
    };

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      const px = slabX + u * slabW;
      const py = mapHillY(u);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    particles.hillDots.forEach((d) => {
      drawElectron(slabX + d.u * slabW, mapHillY(d.u) - 7, 5);
    });

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(hasBridge ? 'G 極電場把通道門檻拉下來了，電子一路溜進 D！' : 'G 極電場不夠強，中間門檻把電子擋在 S 區！', slabX + 6, sLevel + 24);
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-tab').forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    renderModeControls();
    solveCurrentMode();
    updateStatusAndButtons();
    resetParticles();
  }

  function init() {
    document.querySelectorAll('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => setMode(tab.dataset.mode));
    });

    primarySlider.addEventListener('input', () => {
      const meta = MODE_META[state.mode];
      const v = parseFloat(primarySlider.value);
      meta.primary.set(v);
      primaryVal.textContent = meta.primary.fmt(v);
      solveCurrentMode();
      updateStatusAndButtons();
    });

    secondarySlider.addEventListener('input', () => {
      const meta = MODE_META[state.mode];
      if (!meta.secondary) return;
      const v = parseFloat(secondarySlider.value);
      meta.secondary.set(v);
      secondaryVal.textContent = meta.secondary.fmt(v);
      solveCurrentMode();
      updateStatusAndButtons();
    });

    const playBtn = document.getElementById('btn-play-pause');
    playBtn.addEventListener('click', () => {
      state.running = !state.running;
      playBtn.textContent = state.running ? '⏸ 暫停動畫' : '▶ 播放動畫';
    });

    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.addEventListener('click', () => {
      state.darkTheme = !state.darkTheme;
      document.body.classList.toggle('dark-theme', state.darkTheme);
      themeBtn.setAttribute('aria-pressed', state.darkTheme ? 'true' : 'false');
      themeBtn.textContent = state.darkTheme ? '☀️ 明亮模式' : '🌙 深色投影';
    });

    setMode('bjt');

    function loop(now) {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      if (state.running) {
        animTime += dt;
        updateParticles(dt);
      }
      renderCanvas();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
