/* ==========================================================================
   軌道衰減模擬器 - 核心物理與渲染邏輯 (Orbital Decay Simulator JS)
   ========================================================================== */

// --- 物理常數 (Real Physical Constants) ---
const G = 6.6743e-11;       // 萬有引力常數, m^3 kg^-1 s^-2
const M = 5.972e24;         // 地球質量, kg
const R = 6371000;          // 地球半徑, m
const GM = G * M;           // 地球重力常數常數項 (μ), m^3 s^-2

// --- 大氣阻力常數 ---
const rho0 = 1.225;         // 海平面空氣密度, kg/m^3
const H = 15000;            // 太空大氣標高 (Scale Height) 等效值, m (約為 15-20 km 以符合低軌大氣密度)
const Cd = 2.2;             // 衛星阻力係數 (標準低軌衛星值)
const A = 10.0;             // 衛星迎風面積, m^2

// --- 模擬狀態變數 ---
let isRunning = false;
let isDragEnabled = false;
let isCrashed = false;

// 物理參數 (可經由 UI 調整)
let mass = 1000;            // 衛星質量, kg
let initialAltitude = 400000; // 初始高度, m (預設 400 km)
let dragMultiplier = 5e6;   // 阻力放大率，以利於 1-2 分鐘內看見墜毀
let stepsPerFrame = 2000;   // 每影格執行的物理步長數 (dt = 0.001s, 2000步 = 每影格模擬 2 秒)
const dt = 0.001;           // 物理步長, s (千分之一秒)

// 運動狀態
let x = 0, y = 0;           // 位置向量, m
let vx = 0, vy = 0;         // 速度向量, m/s
let ax = 0, ay = 0;         // 加速度向量, m/s^2
let simTime = 0;            // 累積模擬時間, s
let lastSampleTime = 0;     // 能量採樣基準時間, s

// 歷史記錄 (繪圖用)
let orbitTrail = [];        // 軌道尾跡 [{x, y}]
const maxTrailLength = 1000;
let energyHistory = [];     // 能量歷史 [{t, ke, pe, me}]
const maxEnergyHistory = 500;

// --- Canvas 繪圖環境 ---
const orbitCanvas = document.getElementById('orbit-canvas');
const orbitCtx = orbitCanvas.getContext('2d');
const energyCanvas = document.getElementById('energy-canvas');
const energyCtx = energyCanvas.getContext('2d');

// --- 畫布主題顏色管理 ---
let canvasTheme = {
    canvasBg: 'rgba(5, 6, 12, 0.4)',
    gridColor: 'rgba(255, 255, 255, 0.02)',
    glowAtmos0: 'rgba(59, 130, 246, 0.55)',
    glowAtmos1: 'rgba(0, 242, 254, 0.35)',
    glowAtmos2: 'rgba(0, 242, 254, 0.08)',
    glowAtmos3: 'rgba(0, 242, 254, 0)',
    earthCenter: '#1e293b',
    earthMid: '#0f172a',
    earthEdge: '#020617',
    earthOutline: 'rgba(0, 242, 254, 0.4)',
    earthOutlineGlow: 'rgba(0, 242, 254, 0.5)',
    trailColorNormal: 'rgba(0, 242, 254, 0.4)',
    trailColorDrag: 'rgba(244, 63, 94, 0.5)',
    satColorNormal: 'rgba(0, 242, 254, 0.8)',
    satColorDrag: 'rgba(244, 63, 94, 0.8)',
    satGlowNormal: '#00f2fe',
    satGlowDrag: '#f43f5e',
    chartBg: 'rgba(0, 0, 0, 0.2)',
    chartBorder: 'rgba(255, 255, 255, 0.04)',
    chartGrid: 'rgba(255, 255, 255, 0.02)',
    chartText: 'rgba(148, 163, 184, 0.7)'
};

function updateCanvasTheme() {
    const isLight = document.body && document.body.classList && document.body.classList.contains('light-mode');
    if (isLight) {
        canvasTheme = {
            canvasBg: 'rgba(255, 255, 255, 0.15)',
            gridColor: 'rgba(0, 0, 0, 0.04)',
            glowAtmos0: 'rgba(37, 99, 235, 0.45)',
            glowAtmos1: 'rgba(2, 132, 199, 0.25)',
            glowAtmos2: 'rgba(2, 132, 199, 0.04)',
            glowAtmos3: 'rgba(2, 132, 199, 0)',
            earthCenter: '#cbd5e1',
            earthMid: '#94a3b8',
            earthEdge: '#475569',
            earthOutline: 'rgba(2, 132, 199, 0.45)',
            earthOutlineGlow: 'rgba(2, 132, 199, 0.2)',
            trailColorNormal: 'rgba(2, 132, 199, 0.55)',
            trailColorDrag: 'rgba(185, 28, 28, 0.6)',
            satColorNormal: 'rgba(2, 132, 199, 0.95)',
            satColorDrag: 'rgba(185, 28, 28, 0.95)',
            satGlowNormal: '#1d4ed8',
            satGlowDrag: '#b91c1c',
            chartBg: 'rgba(255, 255, 255, 0.65)',
            chartBorder: 'rgba(15, 23, 42, 0.08)',
            chartGrid: 'rgba(15, 23, 42, 0.04)',
            chartText: 'rgba(71, 85, 105, 0.9)'
        };
    } else {
        canvasTheme = {
            canvasBg: 'rgba(5, 6, 12, 0.4)',
            gridColor: 'rgba(255, 255, 255, 0.02)',
            glowAtmos0: 'rgba(59, 130, 246, 0.55)',
            glowAtmos1: 'rgba(0, 242, 254, 0.35)',
            glowAtmos2: 'rgba(0, 242, 254, 0.08)',
            glowAtmos3: 'rgba(0, 242, 254, 0)',
            earthCenter: '#1e293b',
            earthMid: '#0f172a',
            earthEdge: '#020617',
            earthOutline: 'rgba(0, 242, 254, 0.4)',
            earthOutlineGlow: 'rgba(0, 242, 254, 0.5)',
            trailColorNormal: 'rgba(0, 242, 254, 0.4)',
            trailColorDrag: 'rgba(244, 63, 94, 0.5)',
            satColorNormal: 'rgba(0, 242, 254, 0.8)',
            satColorDrag: 'rgba(244, 63, 94, 0.8)',
            satGlowNormal: '#00f2fe',
            satGlowDrag: '#f43f5e',
            chartBg: 'rgba(0, 0, 0, 0.2)',
            chartBorder: 'rgba(255, 255, 255, 0.04)',
            chartGrid: 'rgba(255, 255, 255, 0.02)',
            chartText: 'rgba(148, 163, 184, 0.7)'
        };
    }
}

// --- UI 元素 ---
const playPauseBtn = document.getElementById('play-pause-btn');
const playBtnText = document.getElementById('play-btn-text');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const resetBtn = document.getElementById('reset-btn');
const dragToggleBtn = document.getElementById('drag-toggle-btn');
const crashOverlay = document.getElementById('crash-overlay');
const overlayResetBtn = document.getElementById('overlay-reset-btn');

// telemetry readouts
const readoutAltitude = document.getElementById('readout-altitude');
const readoutVelocity = document.getElementById('readout-velocity');
const readoutDensity = document.getElementById('readout-density');
const readoutAccRatio = document.getElementById('readout-acc-ratio');
const elapsedTimeText = document.getElementById('elapsed-time');
const zoomStatusText = document.getElementById('zoom-status');

// legend values
const valKeText = document.getElementById('val-ke');
const valPeText = document.getElementById('val-pe');
const valMeText = document.getElementById('val-me');

// sliders
const speedSlider = document.getElementById('speed-slider');
const speedVal = document.getElementById('speed-val');
const altitudeSlider = document.getElementById('altitude-slider');
const altitudeVal = document.getElementById('altitude-val');
const massSlider = document.getElementById('mass-slider');
const massVal = document.getElementById('mass-val');
const dragSlider = document.getElementById('drag-slider');
const dragVal = document.getElementById('drag-val');

// 地球陸地生成隨機噪聲 (確保每次渲染地球的陸地一致且美觀)
const earthLands = [];
function generateEarthLands() {
    earthLands.length = 0;
    const count = 7;
    // 固定的隨機生成種子，以維持陸地圖案固定
    let seed = 42;
    function random() {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }
    for (let i = 0; i < count; i++) {
        earthLands.push({
            angle: random() * Math.PI * 2,
            radiusRatio: 0.3 + random() * 0.5,
            sizeRatio: 0.2 + random() * 0.3,
            color: random() > 0.4 ? '#1d8a43' : '#14532d' // 墨綠色與翠綠色
        });
    }
}
generateEarthLands();

// ==========================================================================
// 1. 初始化與重設狀態
// ==========================================================================
function initSimulation() {
    // 獲取 UI 滑桿當前值
    mass = parseFloat(massSlider.value);
    initialAltitude = parseFloat(altitudeSlider.value) * 1000; // km -> m
    dragMultiplier = parseFloat(dragSlider.value);
    stepsPerFrame = parseInt(speedSlider.value);

    // 初始位置設定在 X 軸上
    const r0 = R + initialAltitude;
    x = r0;
    y = 0;

    // 圓周運動初速度 V = sqrt(GM/r)，方向垂直朝上 (+Y)
    const v0 = Math.sqrt(GM / r0);
    vx = 0;
    vy = v0;

    // 初始加速度 (萬有引力)
    const r_mag = Math.sqrt(x*x + y*y);
    const g_acc = -GM / (r_mag * r_mag * r_mag);
    ax = g_acc * x;
    ay = g_acc * y;

    // 重設狀態
    simTime = 0;
    lastSampleTime = 0; // 重設採樣時間，避免 Reset 後能量圖表凍結
    isCrashed = false;
    orbitTrail = [];
    energyHistory = [];
    crashOverlay.classList.add('hidden');
    
    // 計算初始能量並存入歷史
    recordEnergySample();
    
    updateTelemetryUI();
    resizeCanvases();
    requestAnimationFrame(drawAll);
}

// 記錄能量樣本
function recordEnergySample() {
    const d = Math.sqrt(x*x + y*y);
    const v = Math.sqrt(vx*vx + vy*vy);
    
    const ke = 0.5 * mass * v * v;
    const pe = -GM * mass / d;
    const me = ke + pe;

    energyHistory.push({
        t: simTime,
        ke: ke,
        pe: pe,
        me: me
    });

    if (energyHistory.length > maxEnergyHistory) {
        energyHistory.shift();
    }

    // 更新圖表旁的數值 (GJ)
    valKeText.textContent = (ke / 1e9).toFixed(3);
    valPeText.textContent = (pe / 1e9).toFixed(3);
    valMeText.textContent = (me / 1e9).toFixed(3);
}

// ==========================================================================
// 2. 物理模擬核心引擎 (Velocity Verlet Algorithm)
// ==========================================================================
function runPhysicsStep() {
    if (isCrashed) return;

    // 1. 計算當前高度與防撞地表判定
    const d = Math.sqrt(x*x + y*y);
    const h = d - R;
    if (h <= 0) {
        isCrashed = true;
        isRunning = false;
        showCrashUI();
        return;
    }

    // 2. Velocity Verlet 第一步：預測半步速度 (t + dt/2)
    const vx_half = vx + 0.5 * ax * dt;
    const vy_half = vy + 0.5 * ay * dt;

    // 3. 更新位置 (t + dt)
    x += vx_half * dt;
    y += vy_half * dt;

    // 4. 計算新位置 (t + dt) 的加速度
    const d_next = Math.sqrt(x*x + y*y);
    const h_next = d_next - R;
    
    if (h_next <= 0) {
        // 判定撞地
        x = (x / d_next) * R; // 定位在地表
        y = (y / d_next) * R;
        isCrashed = true;
        isRunning = false;
        showCrashUI();
        return;
    }

    // 4a. 萬有引力加速度 (t + dt)
    const g_acc_next = -GM / (d_next * d_next * d_next);
    let ax_next = g_acc_next * x;
    let ay_next = g_acc_next * y;

    // 4b. 空氣阻力加速度 (t + dt)
    if (isDragEnabled) {
        // 雙層大氣模型 (連續且真實，80km以上為太空熱層，80km以下為稠密大氣)
        let rho = 0;
        if (h_next >= 80000) {
            rho = 1.0e-5 * Math.exp(-(h_next - 80000) / 25000);
        } else if (h_next > 0) {
            rho = 1.0e-5 * Math.exp(-(h_next - 80000) / 7000);
        }
        rho *= dragMultiplier;

        const v_mag_pred = Math.sqrt(vx_half*vx_half + vy_half*vy_half);
        const drag_const = 0.5 * Cd * A * rho / mass;
        
        ax_next -= drag_const * v_mag_pred * vx_half;
        ay_next -= drag_const * v_mag_pred * vy_half;
    }

    // 5. Velocity Verlet 第二步：更新全步速度 (t + dt)
    vx = vx_half + 0.5 * ax_next * dt;
    vy = vy_half + 0.5 * ay_next * dt;

    ax = ax_next;
    ay = ay_next;

    // 6. 累加模擬時間
    simTime += dt;
}

// 顯示墜毀畫面
function showCrashUI() {
    crashOverlay.classList.remove('hidden');
    playPauseBtn.className = "btn btn-success";
    playBtnText.textContent = "開始模擬";
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    updateTelemetryUI();
}

// ==========================================================================
// 3. 網頁渲染邏輯 (Double Canvas Renderer)
// ==========================================================================

// 3a. 軌道畫布渲染 (支援平滑相機追蹤偏移 camX, camY)
function drawOrbit(scale, zoomFactor, camX = 0, camY = 0) {
    const w = orbitCanvas.width;
    const h = orbitCanvas.height;
    orbitCtx.clearRect(0, 0, w, h);

    // 中心座標
    const cx = w / 2;
    const cy = h / 2;

    // 偏移後的地球中心座標
    const earthCx = cx - camX * scale;
    const earthCy = cy - camY * scale;

    // 1. 繪製太空星光微弱背景
    orbitCtx.fillStyle = canvasTheme.canvasBg;
    orbitCtx.fillRect(0, 0, w, h);

    // 2. 繪製格線 (Grid Lines)
    orbitCtx.strokeStyle = canvasTheme.gridColor;
    orbitCtx.lineWidth = 1;
    const gridSize = 40;
    for (let i = 0; i < w; i += gridSize) {
        orbitCtx.beginPath();
        orbitCtx.moveTo(i, 0);
        orbitCtx.lineTo(i, h);
        orbitCtx.stroke();
    }
    for (let j = 0; j < h; j += gridSize) {
        orbitCtx.beginPath();
        orbitCtx.moveTo(0, j);
        orbitCtx.lineTo(w, j);
        orbitCtx.stroke();
    }

    // 3. 繪製大氣層發光 (Atmosphere glow)
    const earthRadiusPx = R * scale;
    const atmosRadiusPx = (R + 120000) * scale; // 120km 厚度大氣
    const glowGrad = orbitCtx.createRadialGradient(earthCx, earthCy, earthRadiusPx - 10 * scale, earthCx, earthCy, atmosRadiusPx);
    glowGrad.addColorStop(0, canvasTheme.glowAtmos0);
    glowGrad.addColorStop(0.3, canvasTheme.glowAtmos1);
    glowGrad.addColorStop(0.8, canvasTheme.glowAtmos2);
    glowGrad.addColorStop(1, canvasTheme.glowAtmos3);
    orbitCtx.fillStyle = glowGrad;
    orbitCtx.beginPath();
    orbitCtx.arc(earthCx, earthCy, atmosRadiusPx, 0, Math.PI * 2);
    orbitCtx.fill();

    // 4. 繪製地球本體
    const earthGrad = orbitCtx.createRadialGradient(earthCx - earthRadiusPx*0.2, earthCy - earthRadiusPx*0.2, 0, earthCx, earthCy, earthRadiusPx);
    earthGrad.addColorStop(0, canvasTheme.earthCenter);
    earthGrad.addColorStop(0.6, canvasTheme.earthMid);
    earthGrad.addColorStop(1, canvasTheme.earthEdge);
    orbitCtx.fillStyle = earthGrad;
    orbitCtx.beginPath();
    orbitCtx.arc(earthCx, earthCy, earthRadiusPx, 0, Math.PI * 2);
    orbitCtx.fill();

    // 4a. 繪製地球陸地 (簡約扁平陸地)
    orbitCtx.save();
    orbitCtx.beginPath();
    orbitCtx.arc(earthCx, earthCy, earthRadiusPx, 0, Math.PI * 2);
    orbitCtx.clip(); // 限制繪圖區域在地球圓圈內

    earthLands.forEach(land => {
        const lx = earthCx + Math.cos(land.angle) * earthRadiusPx * land.radiusRatio;
        const ly = earthCy + Math.sin(land.angle) * earthRadiusPx * land.radiusRatio;
        const lr = earthRadiusPx * land.sizeRatio;
        
        orbitCtx.fillStyle = land.color;
        orbitCtx.beginPath();
        orbitCtx.arc(lx, ly, lr, 0, Math.PI * 2);
        orbitCtx.fill();
    });
    orbitCtx.restore();

    // 4b. 地球發光邊界線
    orbitCtx.strokeStyle = canvasTheme.earthOutline;
    orbitCtx.lineWidth = 1.5;
    orbitCtx.shadowColor = canvasTheme.earthOutlineGlow;
    orbitCtx.shadowBlur = 6;
    orbitCtx.beginPath();
    orbitCtx.arc(earthCx, earthCy, earthRadiusPx, 0, Math.PI * 2);
    orbitCtx.stroke();
    orbitCtx.shadowBlur = 0; // 重置陰影

    // 5. 繪製衛星軌道尾跡
    if (orbitTrail.length > 1) {
        orbitCtx.beginPath();
        orbitCtx.moveTo(cx + (orbitTrail[0].x - camX) * scale, cy + (orbitTrail[0].y - camY) * scale);
        for (let i = 1; i < orbitTrail.length; i++) {
            orbitCtx.lineTo(cx + (orbitTrail[i].x - camX) * scale, cy + (orbitTrail[i].y - camY) * scale);
        }
        
        // 漸層軌跡 (隨著越遠越淡)
        orbitCtx.strokeStyle = canvasTheme.trailColorNormal;
        if (isDragEnabled) {
            // 開啟阻力時為橙紅色發光尾跡，強調衰減
            orbitCtx.strokeStyle = canvasTheme.trailColorDrag;
        }
        orbitCtx.lineWidth = 1.5;
        orbitCtx.stroke();
    }

    // 6. 繪製衛星 (Glowing Satellite Dot)
    const satX = cx + (x - camX) * scale;
    const satY = cy + (y - camY) * scale;
    
    // 衛星外發光
    orbitCtx.fillStyle = isDragEnabled ? canvasTheme.satColorDrag : canvasTheme.satColorNormal;
    orbitCtx.shadowColor = isDragEnabled ? canvasTheme.satGlowDrag : canvasTheme.satGlowNormal;
    orbitCtx.shadowBlur = 12;
    orbitCtx.beginPath();
    orbitCtx.arc(satX, satY, 5, 0, Math.PI * 2);
    orbitCtx.fill();
    orbitCtx.shadowBlur = 0; // 重置
 
    // 衛星本體白色核心
    orbitCtx.fillStyle = '#ffffff';
    orbitCtx.beginPath();
    orbitCtx.arc(satX, satY, 2.5, 0, Math.PI * 2);
    orbitCtx.fill();
}

// 3b. 能量圖表畫布渲染 (分割為 3 個獨立 Y 軸子圖，放大局部變化)
function drawEnergyChart() {
    const w = energyCanvas.width;
    const h = energyCanvas.height;
    energyCtx.clearRect(0, 0, w, h);

    if (energyHistory.length < 2) return;

    // 定義版面邊距
    const margin = { top: 15, right: 30, bottom: 15, left: 80 };
    const chartW = w - margin.left - margin.right;
    const chartH = h - margin.top - margin.bottom;

    // 分割為 3 個獨立的水平通道子圖
    const subplotsCount = 3;
    const gap = 16;
    const subH = (chartH - (subplotsCount - 1) * gap) / subplotsCount;

    // 橫軸座標轉換
    const getX = (index) => margin.left + (index / (maxEnergyHistory - 1)) * chartW;

    // 三個能量子圖的設定與樣式
    const configs = [
        { key: 'ke', name: '動能 (Kinetic Energy) [綠線]', color: '#10b981', shadow: 'rgba(16, 185, 129, 0.4)' },
        { key: 'pe', name: '重力位能 (Potential Energy) [紅線]', color: '#f43f5e', shadow: 'rgba(244, 63, 94, 0.4)' },
        { key: 'me', name: '總力學能 (Mechanical Energy) [藍線]', color: '#3b82f6', shadow: 'rgba(59, 130, 246, 0.4)' }
    ];

    configs.forEach((config, idx) => {
        const key = config.key;
        const subYStart = margin.top + idx * (subH + gap);
        const subYEnd = subYStart + subH;

        // 1. 尋找此子圖的最大與最小值以計算本圖專屬的 Y 軸範圍
        let minVal = Infinity;
        let maxVal = -Infinity;
        energyHistory.forEach(d => {
            const val = d[key];
            if (val < minVal) minVal = val;
            if (val > maxVal) maxVal = val;
        });

        // 加上 5% 的自適應上下邊緣緩衝，使波動極其微小的動能變化也能被局部拉大展示
        let range = maxVal - minVal;
        if (range === 0) {
            // 若完全無變化 (例如剛開始)，給定預設的上下偏離幅度
            const offset = Math.abs(minVal) * 0.05 || 1.0;
            minVal -= offset;
            maxVal += offset;
            range = maxVal - minVal;
        } else {
            minVal -= range * 0.05;
            maxVal += range * 0.05;
            range = maxVal - minVal;
        }

        // 當前子圖的專屬 Y 座標轉換函數
        const getY = (val) => subYEnd - ((val - minVal) / range) * subH;

        // 2. 繪製子圖玻璃背景與發光邊界
        energyCtx.fillStyle = canvasTheme.chartBg;
        energyCtx.fillRect(margin.left, subYStart, chartW, subH);
        energyCtx.strokeStyle = canvasTheme.chartBorder;
        energyCtx.lineWidth = 1;
        energyCtx.strokeRect(margin.left, subYStart, chartW, subH);

        // 3. 繪製格線與標註
        energyCtx.strokeStyle = canvasTheme.chartGrid;
        energyCtx.beginPath();
        energyCtx.moveTo(margin.left, subYStart + subH / 2);
        energyCtx.lineTo(margin.left + chartW, subYStart + subH / 2);
        energyCtx.stroke();

        // 標註最大/最小值 (單位 GJ)
        energyCtx.fillStyle = canvasTheme.chartText;
        energyCtx.font = '10px Share Tech Mono';
        energyCtx.textAlign = 'right';
        energyCtx.textBaseline = 'middle';
        energyCtx.fillText(`${(maxVal / 1e9).toFixed(3)} GJ`, margin.left - 10, subYStart + 5);
        energyCtx.fillText(`${(minVal / 1e9).toFixed(3)} GJ`, margin.left - 10, subYEnd - 5);

        // 標註子圖左上角能量名稱
        energyCtx.fillStyle = config.color;
        energyCtx.font = '11px Outfit';
        energyCtx.textAlign = 'left';
        energyCtx.fillText(config.name, margin.left + 10, subYStart + 12);

        // 4. 繪製曲線
        energyCtx.beginPath();
        energyCtx.strokeStyle = config.color;
        energyCtx.lineWidth = 1.8;
        energyCtx.shadowColor = config.shadow;
        energyCtx.shadowBlur = 6;

        energyCtx.moveTo(getX(0), getY(energyHistory[0][key]));
        for (let i = 1; i < energyHistory.length; i++) {
            energyCtx.lineTo(getX(i), getY(energyHistory[i][key]));
        }
        energyCtx.stroke();
        energyCtx.shadowBlur = 0; // 重置陰影
    });
}

// 主渲染調度
function drawAll() {
    const d = Math.sqrt(x*x + y*y);
    const h = d - R;

    // 計算縮放 (Zoom Level)
    // 預設 1.0x 縮放因子，改用 Math.min 確保在任何長寬比下地球都不會被裁切
    let defaultScale = (Math.min(orbitCanvas.width, orbitCanvas.height) * 0.38) / R;
    let currentScale = defaultScale;
    let zoomFactor = 1.0;
    let t = 0;

    // 當衛星高度低於 150 km 時，平滑放大畫面 (Auto-Zoom)
    if (h < 150000) {
        // 高度 150km -> 0km 對應放大率 1.0x -> 3.5x
        t = Math.max(0, Math.min(1, (150000 - h) / 150000));
        zoomFactor = 1.0 + t * 2.5; 
        currentScale = defaultScale * zoomFactor;
    }

    zoomStatusText.textContent = `縮放: ${zoomFactor.toFixed(1)}x`;

    // 計算相機中心偏移 (平滑移向衛星降落點)，防止放大時衛星飛出畫布
    const camX = x * t * 0.88;
    const camY = y * t * 0.88;

    drawOrbit(currentScale, zoomFactor, camX, camY);
    drawEnergyChart();
}

// ==========================================================================
// 4. 模擬主循環更新
// ==========================================================================
function update() {
    if (isRunning && !isCrashed) {
        const d = Math.sqrt(x*x + y*y);
        const h = d - R;
        
        // 時間稀釋 (Time Dilation): 當高度低於 150km 時，自動調慢模擬物理步數，以清晰呈現螺旋降落的過程
        let currentSteps = stepsPerFrame;
        if (h < 150000) {
            const ratio = Math.max(0.005, h / 150000);
            currentSteps = Math.max(5, Math.floor(stepsPerFrame * ratio));
        }

        // 一個畫面影格中跑 currentSteps 次物理計算步長 (dt = 0.001s)
        for (let i = 0; i < currentSteps; i++) {
            runPhysicsStep();
            if (isCrashed) break;
        }

        // 記錄軌跡軌尾 (每影格記錄一次)
        if (!isCrashed) {
            orbitTrail.push({ x: x, y: y });
            if (orbitTrail.length > maxTrailLength) {
                orbitTrail.shift();
            }
        }

        // 每隔一段模擬時間記錄一次能量樣本（控制圖表的橫軸時間解析度）
        // 為了讓滾動圖表平滑，約模擬過 10s 採樣一次
        if (simTime - lastSampleTime >= 10.0 || isCrashed) {
            recordEnergySample();
            lastSampleTime = simTime;
        }

        updateTelemetryUI();
    }

    drawAll();

    if (isRunning) {
        requestAnimationFrame(update);
    }
}

// ==========================================================================
// 5. 數據監測面板更新 (UI Readouts)
// ==========================================================================
function updateTelemetryUI() {
    const d = Math.sqrt(x*x + y*y);
    const h = (d - R) / 1000; // m -> km
    const v = Math.sqrt(vx*vx + vy*vy) / 1000; // m/s -> km/s

    readoutAltitude.textContent = Math.max(0, h).toFixed(2);
    readoutVelocity.textContent = v.toFixed(3);

    // 大氣密度 (顯示真實值，不含放大倍率)
    let rho = 0;
    const h_m = h * 1000; // km -> m
    if (h_m >= 80000) {
        rho = 1.0e-5 * Math.exp(-(h_m - 80000) / 25000);
    } else if (h_m > 0) {
        rho = 1.0e-5 * Math.exp(-(h_m - 80000) / 7000);
    }
    
    // 用科學記號顯示大氣密度
    if (rho === 0) {
        readoutDensity.textContent = "0.00e0";
    } else {
        const exp = Math.floor(Math.log10(rho));
        const base = rho / Math.pow(10, exp);
        readoutDensity.textContent = `${base.toFixed(2)}e${exp}`;
    }

    // 離心/向心加速度比 (Centrifugal / Centripetal force ratio)
    // 圓周運動時為 1.0。若阻力減慢速度，此值會小於 1.0，代表重力勝過離心力，軌道開始向內坍縮
    let accRatio = 1.0;
    if (d > 0 && v > 0) {
        const centripetalAcc = (v * 1000) * (v * 1000) / d; // v^2 / r
        const gravityAcc = GM / (d * d); // GM / r^2
        accRatio = centripetalAcc / gravityAcc;
    }
    readoutAccRatio.textContent = accRatio.toFixed(3);

    // 顯示模擬時間
    const totalSecs = Math.floor(simTime);
    const ms = Math.floor((simTime - totalSecs) * 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const pad = (num, len = 2) => String(num).padStart(len, '0');
    elapsedTimeText.textContent = `${pad(days)} 天 ${pad(hours)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

// ==========================================================================
// 6. UI 事件與監聽器
// ==========================================================================

// 開始 / 暫停
playPauseBtn.addEventListener('click', () => {
    if (isCrashed) {
        initSimulation();
    }
    
    isRunning = !isRunning;
    if (isRunning) {
        playPauseBtn.className = "btn btn-secondary";
        playBtnText.textContent = "暫停模擬";
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
        update(); // 啟動模擬循環
    } else {
        playPauseBtn.className = "btn btn-success";
        playBtnText.textContent = "繼續模擬";
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    }
});

// 重設
resetBtn.addEventListener('click', () => {
    const wasRunning = isRunning;
    isRunning = false;
    initSimulation();
    if (wasRunning) {
        isRunning = true;
        playPauseBtn.className = "btn btn-secondary";
        playBtnText.textContent = "暫停模擬";
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
        update();
    } else {
        playPauseBtn.className = "btn btn-success";
        playBtnText.textContent = "開始模擬";
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    }
});

// 空氣阻力切換
dragToggleBtn.addEventListener('click', () => {
    isDragEnabled = !isDragEnabled;
    if (isDragEnabled) {
        dragToggleBtn.className = "btn btn-drag-on";
        dragToggleBtn.querySelector('span').textContent = "大氣阻力：已開啟";
    } else {
        dragToggleBtn.className = "btn btn-drag-off";
        dragToggleBtn.querySelector('span').textContent = "大氣阻力：關閉中";
    }
    // 即時更新讀數與渲染
    updateTelemetryUI();
    drawAll();
});

// 墜毀覆蓋層重設按鈕
overlayResetBtn.addEventListener('click', () => {
    initSimulation();
});

// --- 滑桿輸入事件 ---

// 1. 更新速度
speedSlider.addEventListener('input', () => {
    stepsPerFrame = parseInt(speedSlider.value);
    speedVal.textContent = `${stepsPerFrame}x`;
});

// 2. 初始高度 (調整即重新初始化)
altitudeSlider.addEventListener('input', () => {
    const val = altitudeSlider.value;
    altitudeVal.textContent = `${val} km`;
    initSimulation();
});

// 3. 衛星質量 (即時生效)
massSlider.addEventListener('input', () => {
    mass = parseFloat(massSlider.value);
    massVal.textContent = `${mass.toLocaleString()} kg`;
    // 即時更新一次能量數據與 UI
    if (!isRunning) {
        recordEnergySample();
        drawAll();
    }
});

// 4. 阻力放大率
dragSlider.addEventListener('input', () => {
    dragMultiplier = parseFloat(dragSlider.value);
    // 使用科學記號顯示
    const exp = Math.floor(Math.log10(dragMultiplier));
    const base = dragMultiplier / Math.pow(10, exp);
    dragVal.textContent = `${base.toFixed(1)}e${exp} x`;
});

// ==========================================================================
// 7. 畫布自動尺寸調整
// ==========================================================================
function resizeCanvases() {
    // 獲取畫布的 CSS 容器尺寸並套用至屬性，確保高 DPI 螢幕不模糊
    const orbitContainer = orbitCanvas.parentElement;
    orbitCanvas.width = orbitContainer.clientWidth;
    orbitCanvas.height = orbitContainer.clientHeight;

    const energyContainer = energyCanvas.parentElement;
    energyCanvas.width = energyContainer.clientWidth;
    energyCanvas.height = energyContainer.clientHeight;

    drawAll();
}

window.addEventListener('resize', resizeCanvases);

// --- 初始化啟動 ---
updateCanvasTheme();
initSimulation();

// ==========================================================================
// 8. 主題切換 (Theme Toggle)
// ==========================================================================
const themeToggleBtn = document.getElementById('theme-toggle-btn');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        themeToggleBtn.innerHTML = isLight ? '🌙 切換暗色模式' : '🌓 切換明亮模式';
        updateCanvasTheme();
        
        // 即時重繪防白屏
        drawAll();
        drawEnergyChart();
    });
}
