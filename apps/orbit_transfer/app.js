/* ==========================================================================
   太空軌道轉移與重力逃逸遊戲 (Orbital Maneuver Game) - 核心邏輯與物理引擎
   ========================================================================== */

// --- 物理常數 (Real Physical Constants) ---
const G = 6.6743e-11;       // 萬有引力常數, m^3 kg^-1 s^-2
const M = 5.972e24;         // 地球質量, kg
const R = 6371000;          // 地球半徑, m
const GM = G * M;           // 地球重力常數, m^3 s^-2
const earthRotationSpeed = 2 * Math.PI / 86400; // 地球自轉角速度, rad/s

// --- 衛星屬性 ---
const satelliteMass = 1000; // 衛星質量, kg

// --- 模擬狀態與變數 ---
let isRunning = false;
let isOnLaunchpad = true;
let isCrashed = false;
let earthRotationAngle = 0; // 地球旋轉角 (弧度)

// 衛星的位置與速度 (公尺, 公尺/秒)
let x = R;
let y = 0;
let vx = 0;
let vy = 0;

// 推進器燃料/預算 (m/s)
let fuel = 10000;
let maxFuel = 10000;

// 模擬時間與倍速
let simTime = 0;
let timeWarp = 1; // 1x, 5x, 25x, 100x

// 歷史軌跡與推進粒子
let orbitTrail = [];
const maxTrailLength = 1200;
let particles = [];

// 鏡頭狀態 (用於平滑插值)
let camX = 0;
let camY = 0;
let zoomFactor = 1.0;
let targetCamX = 0;
let targetCamY = 0;
let targetZoom = 1.0;
let isCameraSatellite = false; // 預設地球中心
let userZoomFactor = 1.0;     // 使用者手動縮放因子 (滾輪/按鈕)

// 關卡與任務
let currentMissionIdx = 0;
let successFrames = 0; // 滿足條件的影格計數器
let isPerfectEscape = false; // 完美游離旗標

// 地球陸地生成
const earthLands = [];
function generateEarthLands() {
    earthLands.length = 0;
    const count = 8;
    let seed = 101;
    function random() {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }
    for (let i = 0; i < count; i++) {
        earthLands.push({
            angle: random() * Math.PI * 2,
            radiusRatio: 0.35 + random() * 0.45,
            sizeRatio: 0.2 + random() * 0.25,
            color: random() > 0.4 ? '#166534' : '#15803d' // 綠色
        });
    }
}
generateEarthLands();

// --- 關卡任務設定 ---
const missions = [
    {
        title: "低軌道發射 (LEO Insertion)",
        description: "太空載具靜止於地表發射台。請點擊「順向噴射 (+Δv)」增加速度，飛離地表並在約 400 km 高度進行圓周化 (使離心率 e < 0.01)。\n(快捷鍵: Space 暫停/繼續, W 順向噴射, S 逆向噴射, T 切換視角, 1~4 設定時間倍速)",
        checklist: [
            { id: "alt", text: "高度達到 380 ~ 420 km", check: (h, e, me) => h >= 380 && h <= 420 },
            { id: "circ", text: "圓周化 (離心率 e < 0.01)", check: (h, e, me) => e < 0.01 }
        ],
        init: () => {
            resetToLaunchpad();
            maxFuel = 10000;
            fuel = 10000;
            updateFuelUI();
        }
    },
    {
        title: "霍曼轉移挑戰 (Hohmann Transfer)",
        description: "您已成功駐軌 LEO！現在請轉移到 2000 km 的綠色目標軌道。在近地點 (Pe) 順向噴射將遠地點 (Ap) 升至 2000 km；等抵達遠地點時，再次進行順向噴射使軌道圓周化進駐目標。",
        checklist: [
            { id: "alt", text: "目標高度達到 1980 ~ 2020 km", check: (h, e, me) => h >= 1980 && h <= 2020 },
            { id: "circ", text: "圓周化 (離心率 e < 0.01)", check: (h, e, me) => e < 0.01 }
        ],
        init: () => {
            setCircularOrbit(400000); // 400 km
            maxFuel = 5000;
            fuel = 5000;
            updateFuelUI();
        }
    },
    {
        title: "重力逃逸與游離 (Gravity Escape)",
        description: "最終挑戰：加能使其擺脫地球引力束縛！當總力學能 ME ≥ 0 即成功游離。如果控制增量使 ME 剛好趨近於 0 (誤差 ±0.05 GJ)，將達成「完美游離」成就，在無窮遠處停下！",
        checklist: [
            { id: "alt", text: "總力學能 ME ≥ 0 (脫離重力束縛)", check: (h, e, me) => me >= 0 },
            { id: "circ", text: "飛離地球深空 (高度 > 30,000 km)", check: (h, e, me) => h > 30000 }
        ],
        init: () => {
            setCircularOrbit(400000); // 400 km
            maxFuel = 6000;
            fuel = 6000;
            updateFuelUI();
        }
    }
];

// --- Canvas 設定 ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// --- UI 元素 ---
const valAltitude = document.getElementById('val-altitude');
const valVelocity = document.getElementById('val-velocity');
const valEscapeVel = document.getElementById('val-escape-vel');
const valEccentricity = document.getElementById('val-eccentricity');

const valKe = document.getElementById('val-ke');
const valPe = document.getElementById('val-pe');
const valMe = document.getElementById('val-me');
const valBinding = document.getElementById('val-binding');
const valIonization = document.getElementById('val-ionization');
const valFormulaEquation = document.getElementById('val-formula-equation');
const escapeStatus = document.getElementById('escape-status');
const bindingCard = document.getElementById('binding-card');
const barPe = document.getElementById('bar-pe');
const barMe = document.getElementById('bar-me');
const barKe = document.getElementById('bar-ke');
const barKion = document.getElementById('bar-kion');
const barEb = document.getElementById('bar-eb');
const chartValPe = document.getElementById('chart-val-pe');
const chartValMe = document.getElementById('chart-val-me');
const chartValKe = document.getElementById('chart-val-ke');
const chartValKion = document.getElementById('chart-val-kion');
const chartValEb = document.getElementById('chart-val-eb');

const valFuel = document.getElementById('val-fuel');
const fuelBar = document.getElementById('fuel-bar');

const currentMissionTitle = document.getElementById('current-mission-title');
const missionDescription = document.getElementById('mission-description');
const checkAlt = document.getElementById('check-alt');
const checkCirc = document.getElementById('check-circ');
const missionSelector = document.getElementById('mission-selector');

const progradeBtn = document.getElementById('prograde-btn');
const retrogradeBtn = document.getElementById('retrograde-btn');
const resetBtn = document.getElementById('reset-btn');
const toggleCameraBtn = document.getElementById('toggle-camera-btn');
const cameraModeBadge = document.getElementById('camera-mode');

const gameModal = document.getElementById('game-modal');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const modalIcon = document.getElementById('modal-icon');
const modalNextBtn = document.getElementById('modal-next-btn');
const modalReplayBtn = document.getElementById('modal-replay-btn');

// ==========================================================================
// 1. 初始化與重置
// ==========================================================================
function resetToLaunchpad() {
    isOnLaunchpad = true;
    earthRotationAngle = 0;
    x = R;
    y = 0;
    const v_rot = earthRotationSpeed * R;
    vx = 0;
    vy = v_rot;
    isCrashed = false;
    successFrames = 0;
    isPerfectEscape = false;
}

function setCircularOrbit(altitude) {
    isOnLaunchpad = false;
    const r0 = R + altitude;
    x = r0;
    y = 0;
    const v0 = Math.sqrt(GM / r0);
    vx = 0;
    vy = v0;
    isCrashed = false;
    successFrames = 0;
    isPerfectEscape = false;
}

function initMission(idx) {
    currentMissionIdx = idx;
    const mission = missions[idx];
    
    if (currentMissionTitle) {
        currentMissionTitle.textContent = mission.title;
    }
    if (missionDescription) {
        missionDescription.textContent = mission.description;
    }
    
    // 同步下拉選單選取狀態
    if (missionSelector) {
        missionSelector.value = idx;
    }
    
    // 更新清單文字與圖示
    checkAlt.querySelector('.check-text').textContent = mission.checklist[0].text;
    checkCirc.querySelector('.check-text').textContent = mission.checklist[1].text;
    updateCheckItem(checkAlt, false);
    updateCheckItem(checkCirc, false);
    
    mission.init();
    
    gameModal.classList.add('hidden');
    orbitTrail = [];
    particles = [];
    simTime = 0;
    timeWarp = 1;
    userZoomFactor = 1.0; // 重置手動縮放
    updateCameraBadge();
    
    if (!isRunning) {
        isRunning = true;
        update();
    }
}

function updateCheckItem(element, isSuccess) {
    const box = element.querySelector('.check-box');
    if (isSuccess) {
        element.classList.add('success');
        box.textContent = "✅";
    } else {
        element.classList.remove('success');
        box.textContent = "❌";
    }
}

// ==========================================================================
// 2. 軌道根數 (Keplerian Elements) 計算
// ==========================================================================
function getOrbitalElements() {
    const r_mag = Math.sqrt(x*x + y*y);
    const v_mag = Math.sqrt(vx*vx + vy*vy);
    
    if (r_mag === 0) return { e: 0, a: R, Pe: 0, Ap: 0, w: 0, me: 0 };
    
    const v2 = v_mag * v_mag;
    const energy = v2 / 2 - GM / r_mag; // 比力學能
    
    // 離心率向量
    const rxv = x * vy - y * vx; // 角動量 2D
    const dot_rv = x * vx + y * vy;
    const ex = ((v2 - GM / r_mag) * x - dot_rv * vx) / GM;
    const ey = ((v2 - GM / r_mag) * y - dot_rv * vy) / GM;
    const e = Math.sqrt(ex*ex + ey*ey);
    const w = Math.atan2(ey, ex); // 近地點幅角
    
    let a, Pe, Ap;
    if (e < 0.999) {
        a = -GM / (2 * energy);
        Pe = a * (1 - e) - R;
        Ap = a * (1 + e) - R;
    } else {
        // 拋物或雙曲軌道
        a = GM / (2 * Math.max(0.001, energy));
        Pe = a * (e - 1) - R;
        Ap = Infinity;
    }
    
    return { e: e, a: a, Pe: Pe, Ap: Ap, w: w, me: energy * satelliteMass };
}

// ==========================================================================
// 3. 推進器控制與粒子效果
// ==========================================================================
function triggerBurn(isPrograde) {
    if (isCrashed || fuel <= 0) return;
    
    let dv;
    let burnDir = { x: 0, y: 0 };
    
    if (isOnLaunchpad) {
        // 地表發射：使用固定的發射推進器 (1500 m/s) 以衝出大氣層
        const launchAmount = 1500;
        dv = Math.min(fuel, launchAmount);
        fuel -= dv;
        
        const pitch = 60 * Math.PI / 180; // 仰角 60 度
        const theta = earthRotationAngle;
        const ur = { x: Math.cos(theta), y: Math.sin(theta) }; // 徑向 (向上)
        const ut = { x: -Math.sin(theta), y: Math.cos(theta) }; // 切向 (向東)
        
        const sign = isPrograde ? 1.0 : -1.0;
        burnDir = {
            x: Math.sin(pitch) * ur.x + sign * Math.cos(pitch) * ut.x,
            y: Math.sin(pitch) * ur.y + sign * Math.cos(pitch) * ut.y
        };
        
        // 發射時速度為地球自轉速度加上推進器速度
        const v_rot = earthRotationSpeed * R;
        vx = v_rot * ut.x + dv * burnDir.x;
        vy = v_rot * ut.y + dv * burnDir.y;
        
        // 將太空船稍微抬高 500 公尺，防止在物理運算首步被吸回發射架
        x += 500 * ur.x;
        y += 500 * ur.y;
        
        isOnLaunchpad = false;
        console.log("Rocket Launched! Launch burn dV:", dv, "m/s");
    } else {
        // 獲取微調或大推力數值
        const activeRadio = document.querySelector('input[name="burn-mode"]:checked');
        const burnAmount = activeRadio ? parseFloat(activeRadio.value) : 100;
        
        dv = Math.min(fuel, burnAmount);
        fuel -= dv;
        
        // 軌道中，沿著速度方向
        const v = Math.sqrt(vx*vx + vy*vy);
        if (v > 0) {
            burnDir = { x: vx / v, y: vy / v };
        } else {
            // 速度為0時，沿切向
            const r = Math.sqrt(x*x + y*y);
            burnDir = { x: -y / r, y: x / r };
        }
        
        if (isPrograde) {
            vx += dv * burnDir.x;
            vy += dv * burnDir.y;
        } else {
            vx -= dv * burnDir.x;
            vy -= dv * burnDir.y;
        }
        console.log("Orbital Burn! dV:", dv, "m/s, Direction:", isPrograde ? "Prograde" : "Retrograde");
    }
    
    // 產生尾跡粒子
    const particlePos = { x: x, y: y };
    const thrustVector = isPrograde ? burnDir : { x: -burnDir.x, y: -burnDir.y };
    createThrustParticles(particlePos, thrustVector);
    
    // UI 更新
    updateFuelUI();
}

function createThrustParticles(pos, dir) {
    const count = 35;
    for (let i = 0; i < count; i++) {
        // 排氣方向與推進方向相反，並加點散射
        const angle = Math.atan2(dir.y, dir.x) + Math.PI + (Math.random() - 0.5) * 0.45;
        const speed = 250 + Math.random() * 350; // 排氣速度 m/s
        
        particles.push({
            x: pos.x,
            y: pos.y,
            vx: vx + Math.cos(angle) * speed,
            vy: vy + Math.sin(angle) * speed,
            age: 0,
            maxAge: 40 + Math.random() * 30, // frames
            size: 3 + Math.random() * 4,
            color: Math.random() > 0.4 ? '#ff5500' : (Math.random() > 0.5 ? '#ffbb00' : '#ff2200')
        });
    }
}

function updateFuelUI() {
    valFuel.textContent = `${Math.ceil(fuel)} / ${maxFuel} m/s`;
    fuelBar.style.width = `${(fuel / maxFuel) * 100}%`;
    if (fuel < 1000) {
        fuelBar.style.background = 'linear-gradient(90deg, #ff3366, #ffaa00)';
    } else {
        fuelBar.style.background = 'linear-gradient(90deg, var(--blue), var(--cyan))';
    }
}

// ==========================================================================
// 4. 物理運算核心 (Velocity Verlet)
// ==========================================================================
const dt = 0.1; // 物理步長 (s)

function physicsStep() {
    if (isCrashed) return;
    
    if (isOnLaunchpad) {
        // 地表狀態：隨地球自轉
        earthRotationAngle += earthRotationSpeed * dt;
        x = R * Math.cos(earthRotationAngle);
        y = R * Math.sin(earthRotationAngle);
        
        const v_rot = earthRotationSpeed * R;
        vx = -v_rot * Math.sin(earthRotationAngle);
        vy = v_rot * Math.cos(earthRotationAngle);
        
        simTime += dt;
        return;
    }
    
    const d = Math.sqrt(x*x + y*y);
    const ux = x / d;
    const uy = y / d;
    const v_vertical = vx * ux + vy * uy;
    
    // 撞地檢測 (僅在高度低於地表半徑且正在朝地心移動時才觸發)
    if (d <= R && v_vertical < 0) {
        handleGroundCollision();
        return;
    }
    
    // 1. 當前加速度
    const g_acc = -GM / (d * d * d);
    let ax = g_acc * x;
    let ay = g_acc * y;

    
    // 2. Verlet 位置更新 (半步)
    const vx_half = vx + 0.5 * ax * dt;
    const vy_half = vy + 0.5 * ay * dt;
    
    x += vx_half * dt;
    y += vy_half * dt;
    
    // 3. 更新後的加速度
    const d_next = Math.sqrt(x*x + y*y);
    const ux_next = x / d_next;
    const uy_next = y / d_next;
    const v_vertical_next = vx * ux_next + vy * uy_next;
    if (d_next <= R && v_vertical_next < 0) {
        handleGroundCollision();
        return;
    }
    
    const g_acc_next = -GM / (d_next * d_next * d_next);
    let ax_next = g_acc_next * x;
    let ay_next = g_acc_next * y;

    
    // 4. Verlet 速度更新 (滿步)
    vx = vx_half + 0.5 * ax_next * dt;
    vy = vy_half + 0.5 * ay_next * dt;
    
    simTime += dt;
    earthRotationAngle += earthRotationSpeed * dt; // 地球依然自轉
}

function handleGroundCollision() {
    // 計算垂直撞擊速度
    const d = Math.sqrt(x*x + y*y);
    const ux = x / d;
    const uy = y / d;
    const v_vertical = vx * ux + vy * uy; // 投影到徑向向量
    
    if (v_vertical < -50) {
        // 猛烈撞擊墜毀
        isCrashed = true;
        isRunning = false;
        showModal("任務失敗！太空載具墜毀", "您以過高的速度 (" + Math.abs(v_vertical).toFixed(1) + " m/s) 撞擊地表。請重設任務並再次挑戰！", "💥", false);
    } else {
        // 安全著陸，回復地表自轉狀態
        isOnLaunchpad = true;
        earthRotationAngle = Math.atan2(y, x);
        const v_rot = earthRotationSpeed * R;
        vx = -v_rot * Math.sin(earthRotationAngle);
        vy = v_rot * Math.cos(earthRotationAngle);
        x = R * Math.cos(earthRotationAngle);
        y = R * Math.sin(earthRotationAngle);
        orbitTrail = [];
    }
}

// ==========================================================================
// 5. 數據面板與束縛能更新 (Telemetry HUD)
// ==========================================================================
function updateTelemetry() {
    const d = Math.sqrt(x*x + y*y);
    const h = Math.max(0, d - R) / 1000; // km
    const v = Math.sqrt(vx*vx + vy*vy) / 1000; // km/s
    
    valAltitude.innerHTML = `${h.toFixed(2)} <span class="tel-unit">km</span>`;
    valVelocity.innerHTML = `${v.toFixed(3)} <span class="tel-unit">km/s</span>`;
    
    // 逃逸速度
    const v_esc = Math.sqrt(2 * GM / d) / 1000; // km/s
    valEscapeVel.innerHTML = `${v_esc.toFixed(3)} <span class="tel-unit">km/s</span>`;
    
    // 離心率與能量計算
    const el = getOrbitalElements();
    valEccentricity.textContent = isOnLaunchpad ? "0.000" : el.e.toFixed(3);
    
    // 能量狀態
    const keJ = 0.5 * satelliteMass * (v * 1000) * (v * 1000);
    const peJ = -GM * satelliteMass / d;
    const meJ = keJ + peJ;
    
    const keGJ = keJ / 1e9;
    const peGJ = peJ / 1e9;
    const meGJ = meJ / 1e9;
    
    valKe.textContent = `${keGJ.toFixed(3)} GJ`;
    valPe.textContent = `${peGJ.toFixed(3)} GJ`;
    valMe.textContent = `${meGJ.toFixed(3)} GJ`;
    
    // 游離動能 (Ionization Kinetic Energy)
    const ionizationEnergy = -peGJ;
    valIonization.textContent = `${ionizationEnergy.toFixed(3)} GJ`;
    
    // 束縛能與狀態
    const boundEnergy = meGJ < 0 ? -meGJ : 0;
    
    if (meGJ < 0) {
        valBinding.textContent = `${boundEnergy.toFixed(3)} GJ`;
        bindingCard.classList.remove('escaped');
        escapeStatus.textContent = "狀態：受地球重力束縛 (BOUND)";
        isPerfectEscape = false;
        valFormulaEquation.textContent = `${boundEnergy.toFixed(3)} = ${ionizationEnergy.toFixed(3)} - ${keGJ.toFixed(3)} (GJ)`;
    } else {
        valBinding.textContent = "0.000 GJ";
        bindingCard.classList.add('escaped');
        valFormulaEquation.textContent = `0.000 = ${ionizationEnergy.toFixed(3)} - ${keGJ.toFixed(3)} (已游離)`;
        
        if (Math.abs(meGJ) <= 0.05) {
            escapeStatus.textContent = "狀態：完美游離 (PERFECT ESCAPE)";
            isPerfectEscape = true;
        } else {
            escapeStatus.textContent = "狀態：已脫離重力游離 (ESCAPED)";
            isPerfectEscape = false;
        }
    }

    // Auto-scale: find max absolute energy to scale the bars
    const maxVal = Math.max(Math.abs(peGJ), Math.abs(meGJ), ionizationEnergy, boundEnergy, 1.0);

    // Calculate vertical heights and top levels based on baseline (0) at 15% and well depth (PE) at 85% (total 70% depth).
    const peHeight = (Math.abs(peGJ) / maxVal) * 70;
    const meHeight = (Math.abs(meGJ) / maxVal) * 70;
    const ebHeight = (boundEnergy / maxVal) * 70;
    
    // ME level position
    let meTop;
    if (meGJ < 0) {
        meTop = 15 + meHeight;
    } else {
        meTop = 15 - meHeight;
    }

    // 1. PE Bar (always negative, extends downwards from baseline)
    if (barPe) {
        barPe.style.top = '15%';
        barPe.style.height = `${peHeight}%`;
        if (chartValPe) {
            chartValPe.textContent = `${peGJ.toFixed(3)} GJ`;
        }
    }
    
    // 2. ME Bar (can be negative or positive, starts from baseline)
    if (barMe) {
        if (meGJ < 0) {
            barMe.className = 'chart-bar bar-me negative';
            barMe.style.top = '15%';
            barMe.style.height = `${meHeight}%`;
            if (chartValMe) {
                chartValMe.textContent = `${meGJ.toFixed(3)} GJ`;
            }
        } else {
            barMe.className = 'chart-bar bar-me positive';
            barMe.style.top = `${meTop}%`;
            barMe.style.height = `${meHeight}%`;
            if (chartValMe) {
                chartValMe.textContent = `+${meGJ.toFixed(3)} GJ`;
            }
        }
    }

    // 3. KE Bar (always positive, sits below ME, goes down to PE level)
    if (barKe) {
        let keHeight;
        if (meGJ < 0) {
            keHeight = peHeight - meHeight;
        } else {
            keHeight = peHeight + meHeight;
        }
        barKe.style.top = `${meTop}%`;
        barKe.style.height = `${keHeight}%`;
        if (chartValKe) {
            chartValKe.textContent = `+${keGJ.toFixed(3)} GJ`;
        }
    }

    // 4. Eb Bar (always positive, extends downwards from baseline to ME level)
    if (barEb) {
        barEb.style.top = '15%';
        barEb.style.height = `${ebHeight}%`;
        if (chartValEb) {
            chartValEb.textContent = boundEnergy > 0 ? `+${boundEnergy.toFixed(3)} GJ` : `0.000 GJ`;
        }
    }

    // 5. K_ion Bar (always positive, extends downwards from baseline to PE level)
    if (barKion) {
        barKion.style.top = '15%';
        barKion.style.height = `${peHeight}%`;
        if (chartValKion) {
            chartValKion.textContent = `+${ionizationEnergy.toFixed(3)} GJ`;
        }
    }
    
    // 螢幕浮動 HUD 標籤
    const peTag = document.getElementById('hud-pe');
    const apTag = document.getElementById('hud-ap');
    if (isOnLaunchpad) {
        peTag.textContent = "Pe: 地表";
        apTag.textContent = "Ap: --";
    } else {
        peTag.textContent = `Pe: ${Math.max(0, el.Pe / 1000).toFixed(1)} km`;
        if (el.Ap === Infinity) {
            apTag.textContent = `Ap: 逃逸 (∞)`;
        } else {
            apTag.textContent = `Ap: ${Math.max(0, el.Ap / 1000).toFixed(1)} km`;
        }
    }
    
    // 任務成功判定
    checkMissionSuccess(h, el.e, meGJ);
}

function checkMissionSuccess(h, e, meGJ) {
    if (isOnLaunchpad || isCrashed) {
        successFrames = 0;
        return;
    }
    
    const mission = missions[currentMissionIdx];
    const cond0 = mission.checklist[0].check(h, e, meGJ);
    const cond1 = mission.checklist[1].check(h, e, meGJ);
    
    updateCheckItem(checkAlt, cond0);
    updateCheckItem(checkCirc, cond1);
    
    if (cond0 && cond1) {
        successFrames++;
        if (successFrames >= 90) { // 連續維持 1.5 秒
            triggerMissionCompleted();
        }
    } else {
        successFrames = 0;
    }
}

function triggerMissionCompleted() {
    isRunning = false;
    
    if (currentMissionIdx === 0) {
        showModal("進入低軌道 (LEO) 成功！", "您已成功將衛星送入 400 km 圓形低軌道，離心率小於 0.01。您了解了在該高度維持圓運動所需的向心力與動能。", "🚀", true);
    } else if (currentMissionIdx === 1) {
        showModal("霍曼轉移挑戰完成！", "完美的兩次軌道脈衝！您成功在近地點和遠地點精準點火，將衛星從 400 km 提升至 2000 km 目標圓軌道。", "🛰️", true);
    } else if (currentMissionIdx === 2) {
        let title = "重力逃逸成功！";
        let desc = "衛星已飛入深太空。當總力學能大於或等於 0 時，衛星的動能已大於或等於該處的游離動能 (KE ≥ K_ion)，地球重力將再也無法拉回它！";
        if (isPerfectEscape) {
            title = "🏆 完美游離成就解鎖！";
            desc = "不可思議！您的發射提供了剛好等於束縛能的額外能量，讓總力學能剛好趨近於 0 (ME ≈ 0)。衛星將在飛往恰至無窮遠處時速度歸零，此時動能恰好等於該處的游離動能！";
        }
        showModal(title, desc, "🌌", true);
    }
}

function showModal(title, desc, icon, showNext) {
    modalTitle.textContent = title;
    modalDesc.textContent = desc;
    modalIcon.textContent = icon;
    
    if (showNext) {
        modalNextBtn.classList.remove('hidden');
        if (currentMissionIdx === 2) {
            modalNextBtn.textContent = "重頭挑戰";
        } else {
            modalNextBtn.textContent = "進入下一關";
        }
    } else {
        modalNextBtn.classList.add('hidden');
    }
    
    gameModal.classList.remove('hidden');
}

// ==========================================================================
// 6. 渲染引擎 (2D Orbit Canvas)
// ==========================================================================
// --- 畫布主題顏色管理 (Canvas Theme Manager) ---
let canvasTheme = {
    gridColor: 'rgba(255, 255, 255, 0.02)',
    orbitColor: 'rgba(0, 242, 254, 0.4)',
    escapeColor: 'rgba(255, 51, 102, 0.55)',
    peColor: '#00f2fe',
    apColor: '#ff007f',
    glowAtmos0: 'rgba(59, 130, 246, 0.55)',
    glowAtmos1: 'rgba(0, 242, 254, 0.3)',
    glowAtmos2: 'rgba(0, 242, 254, 0.05)',
    glowAtmos3: 'rgba(0, 242, 254, 0)',
    earthCenter: '#1e293b',
    earthMid: '#0f172a',
    earthEdge: '#020617',
    earthOutline: 'rgba(0, 242, 254, 0.35)',
    markerText: '#ffffff',
    padBg: '#64748b',
    padBorder: '#94a3b8',
    trailColor: 'rgba(79, 172, 254, 0.4)',
    satBg: 'rgba(0, 242, 254, 0.85)',
    satCore: '#ffffff'
};

function updateCanvasTheme() {
    const isLight = document.body && document.body.classList && document.body.classList.contains('light-mode');
    if (isLight) {
        canvasTheme = {
            gridColor: 'rgba(0, 0, 0, 0.04)',
            orbitColor: 'rgba(2, 132, 199, 0.65)',
            escapeColor: 'rgba(185, 28, 28, 0.75)',
            peColor: '#0284c7',
            apColor: '#be185d',
            glowAtmos0: 'rgba(37, 99, 235, 0.45)',
            glowAtmos1: 'rgba(2, 132, 199, 0.25)',
            glowAtmos2: 'rgba(2, 132, 199, 0.04)',
            glowAtmos3: 'rgba(2, 132, 199, 0)',
            earthCenter: '#cbd5e1',
            earthMid: '#94a3b8',
            earthEdge: '#475569',
            earthOutline: 'rgba(2, 132, 199, 0.45)',
            markerText: '#0f172a',
            padBg: '#475569',
            padBorder: '#334155',
            trailColor: 'rgba(29, 78, 216, 0.55)',
            satBg: 'rgba(2, 132, 199, 0.95)',
            satCore: '#1d4ed8'
        };
    } else {
        canvasTheme = {
            gridColor: 'rgba(255, 255, 255, 0.02)',
            orbitColor: 'rgba(0, 242, 254, 0.4)',
            escapeColor: 'rgba(255, 51, 102, 0.55)',
            peColor: '#00f2fe',
            apColor: '#ff007f',
            glowAtmos0: 'rgba(59, 130, 246, 0.55)',
            glowAtmos1: 'rgba(0, 242, 254, 0.3)',
            glowAtmos2: 'rgba(0, 242, 254, 0.05)',
            glowAtmos3: 'rgba(0, 242, 254, 0)',
            earthCenter: '#1e293b',
            earthMid: '#0f172a',
            earthEdge: '#020617',
            earthOutline: 'rgba(0, 242, 254, 0.35)',
            markerText: '#ffffff',
            padBg: '#64748b',
            padBorder: '#94a3b8',
            trailColor: 'rgba(79, 172, 254, 0.4)',
            satBg: 'rgba(0, 242, 254, 0.85)',
            satCore: '#ffffff'
        };
    }
}

function drawGame() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    const cx = w / 2;
    const cy = h / 2;
    
    // 計算相機變量與縮放
    // 預設比例：畫布的 30% 代表地球半徑
    const baseScale = (Math.min(w, h) * 0.3) / R;
    const scale = baseScale * zoomFactor;
    
    // 偏移中心
    const earthCx = cx - camX * scale;
    const earthCy = cy - camY * scale;
    
    // 1. 格線背景
    ctx.strokeStyle = canvasTheme.gridColor;
    ctx.lineWidth = 1;
    const gridSize = 45;
    for (let i = 0; i < w; i += gridSize) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
    }
    for (let j = 0; j < h; j += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke();
    }
    
    // 2. 繪製任務導引虛線 (LEO 或 Hohmann 目標軌道)
    const isLight = document.body && document.body.classList && document.body.classList.contains('light-mode');
    if (currentMissionIdx === 0) {
        // 400km 軌道
        ctx.beginPath();
        ctx.arc(earthCx, earthCy, (R + 400000) * scale, 0, Math.PI * 2);
        ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.4)' : 'rgba(0, 242, 254, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (currentMissionIdx === 1) {
        // 2000km 目標軌道
        ctx.beginPath();
        ctx.arc(earthCx, earthCy, (R + 2000000) * scale, 0, Math.PI * 2);
        ctx.strokeStyle = isLight ? 'rgba(21, 128, 61, 0.45)' : 'rgba(57, 255, 20, 0.25)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // 3. 繪製預測軌道線 (克卜勒幾何)
    drawOrbitPrediction(earthCx, earthCy, scale);
    
    // 4. 大氣層藍色發光
    const earthRadiusPx = R * scale;
    const atmosRadiusPx = (R + 120000) * scale;
    const glow = ctx.createRadialGradient(earthCx, earthCy, earthRadiusPx - 5 * scale, earthCx, earthCy, atmosRadiusPx);
    glow.addColorStop(0, canvasTheme.glowAtmos0);
    glow.addColorStop(0.3, canvasTheme.glowAtmos1);
    glow.addColorStop(0.8, canvasTheme.glowAtmos2);
    glow.addColorStop(1, canvasTheme.glowAtmos3);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, atmosRadiusPx, 0, Math.PI * 2);
    ctx.fill();
    
    // 5. 地球本體與陸地
    const earthGrad = ctx.createRadialGradient(earthCx - earthRadiusPx*0.2, earthCy - earthRadiusPx*0.2, 0, earthCx, earthCy, earthRadiusPx);
    earthGrad.addColorStop(0, canvasTheme.earthCenter);
    earthGrad.addColorStop(0.7, canvasTheme.earthMid);
    earthGrad.addColorStop(1, canvasTheme.earthEdge);
    ctx.fillStyle = earthGrad;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadiusPx, 0, Math.PI * 2);
    ctx.fill();
    
    // 陸地 (繞地球自轉)
    ctx.save();
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadiusPx, 0, Math.PI * 2);
    ctx.clip();
    earthLands.forEach(land => {
        const theta = land.angle + earthRotationAngle;
        const lx = earthCx + Math.cos(theta) * earthRadiusPx * land.radiusRatio;
        const ly = earthCy + Math.sin(theta) * earthRadiusPx * land.radiusRatio;
        const lr = earthRadiusPx * land.sizeRatio;
        
        ctx.fillStyle = land.color;
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
    
    // 地球外圈亮線
    ctx.strokeStyle = canvasTheme.earthOutline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    
    // 6. 繪製發射台
    const padX = earthCx + R * Math.cos(earthRotationAngle) * scale;
    const padY = earthCy + R * Math.sin(earthRotationAngle) * scale;
    ctx.save();
    ctx.translate(padX, padY);
    ctx.rotate(earthRotationAngle);
    ctx.fillStyle = canvasTheme.padBg;
    ctx.fillRect(-6 * scale, -2 * scale, 12 * scale, 3 * scale);
    ctx.strokeStyle = canvasTheme.padBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(-6 * scale, -2 * scale, 12 * scale, 3 * scale);
    ctx.restore();
    
    // 7. 歷史軌跡尾跡
    if (orbitTrail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(cx + (orbitTrail[0].x - camX) * scale, cy + (orbitTrail[0].y - camY) * scale);
        for (let i = 1; i < orbitTrail.length; i++) {
            ctx.lineTo(cx + (orbitTrail[i].x - camX) * scale, cy + (orbitTrail[i].y - camY) * scale);
        }
        ctx.strokeStyle = canvasTheme.trailColor;
        ctx.lineWidth = 1.8;
        ctx.stroke();
    }
    
    // 8. 引擎噴射粒子
    if (particles.length > 0) {
        ctx.save();
        particles.forEach(p => {
            const px = cx + (p.x - camX) * scale;
            const py = cy + (p.y - camY) * scale;
            const alpha = 1 - (p.age / p.maxAge);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(px, py, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }
    
    // 9. 衛星本體 (Glowing Satellite)
    const satX = cx + (x - camX) * scale;
    const satY = cy + (y - camY) * scale;
    
    ctx.save();
    ctx.fillStyle = canvasTheme.satBg;
    ctx.shadowColor = isLight ? 'rgba(2, 132, 199, 0.6)' : 'var(--cyan)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(satX, satY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    ctx.fillStyle = canvasTheme.satCore;
    ctx.beginPath();
    ctx.arc(satX, satY, 2.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawOrbitPrediction(earthCx, earthCy, scale) {
    if (isOnLaunchpad) return;
    
    const r_mag = Math.sqrt(x*x + y*y);
    const v_mag = Math.sqrt(vx*vx + vy*vy);
    if (r_mag === 0 || v_mag === 0) return;
    
    const el = getOrbitalElements();
    
    if (el.e < 0.999) {
        // 橢圓或圓形：使用 Canvas ellipse 快速精準渲染
        const a = el.a;
        const b = a * Math.sqrt(1 - el.e * el.e);
        const c_shift = a * el.e;
        
        // 橢圓中心相對於地球中心的坐標
        const ecx = -c_shift * Math.cos(el.w);
        const ecy = -c_shift * Math.sin(el.w);
        
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(
            earthCx + ecx * scale,
            earthCy + ecy * scale,
            a * scale,
            b * scale,
            el.w,
            0,
            2 * Math.PI
        );
        ctx.strokeStyle = canvasTheme.orbitColor;
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // 繪製 Pe 標記
        const rp = a * (1 - el.e);
        const pex = earthCx + rp * Math.cos(el.w) * scale;
        const pey = earthCy + rp * Math.sin(el.w) * scale;
        drawMarker(pex, pey, "Pe: " + (el.Pe / 1000).toFixed(0) + " km", canvasTheme.peColor);
        
        // 繪製 Ap 標記
        const ra = a * (1 + el.e);
        const apx = earthCx - ra * Math.cos(el.w) * scale;
        const apy = earthCy - ra * Math.sin(el.w) * scale;
        drawMarker(apx, apy, "Ap: " + (el.Ap / 1000).toFixed(0) + " km", canvasTheme.apColor);
        
        ctx.restore();
    } else {
        // 拋物線或雙曲線：計算點集繪製
        ctx.save();
        ctx.beginPath();
        
        const thetaLimit = Math.acos(-1 / Math.max(1.0001, el.e));
        const maxPhi = Math.min(thetaLimit - 0.08, 2.4); // 避免角度趨近無限大
        const steps = 80;
        
        // 圓錐曲線極坐標：r = p / (1 + e * cos(phi))
        // 其中半通徑 p_latus = a * (e^2 - 1)
        const p_latus = el.a * (el.e * el.e - 1);
        
        let first = true;
        for (let i = -steps; i <= steps; i++) {
            const phi = (i / steps) * maxPhi;
            const r_p = p_latus / (1 + el.e * Math.cos(phi));
            
            const px = earthCx + r_p * Math.cos(phi + el.w) * scale;
            const py = earthCy + r_p * Math.sin(phi + el.w) * scale;
            
            if (first) {
                ctx.moveTo(px, py);
                first = false;
            } else {
                ctx.lineTo(px, py);
            }
        }
        
        ctx.strokeStyle = canvasTheme.escapeColor; // 游離狀態呈紅色虛線
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.8;
        ctx.stroke();
        
        // 繪製 Pe 標記
        const rp = el.a * (el.e - 1);
        const pex = earthCx + rp * Math.cos(el.w) * scale;
        const pey = earthCy + rp * Math.sin(el.w) * scale;
        drawMarker(pex, pey, "Pe: " + (el.Pe / 1000).toFixed(0) + " km", canvasTheme.escapeColor);
        
        ctx.restore();
    }
}

function drawMarker(px, py, text, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = canvasTheme.markerText;
    ctx.font = '11px Share Tech Mono';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText("  " + text, px, py - 12);
}

// ==========================================================================
// 7. 鏡頭邏輯 (動態相機跟隨與縮放)
// ==========================================================================
function updateCamera() {
    const d = Math.sqrt(x*x + y*y);
    
    // 設定鏡頭目標位置
    if (isCameraSatellite && !isOnLaunchpad) {
        targetCamX = x;
        targetCamY = y;
    } else {
        targetCamX = 0;
        targetCamY = 0;
    }
    
    // 設定鏡頭縮放目標
    let baseTargetZoom = 1.0;
    if (currentMissionIdx === 0) {
        baseTargetZoom = 1.0;
    } else if (currentMissionIdx === 1) {
        baseTargetZoom = 0.65;
    } else {
        // 逃逸模式：隨距離自動向外平滑縮放
        baseTargetZoom = Math.max(0.04, Math.min(0.8, 1.4 * R / d));
    }
    
    // 結合使用者手動縮放
    targetZoom = baseTargetZoom * userZoomFactor;
    
    // 二階平滑插值 (Lerp)
    camX += (targetCamX - camX) * 0.08;
    camY += (targetCamY - camY) * 0.08;
    zoomFactor += (targetZoom - zoomFactor) * 0.05;
}

function updateCameraBadge() {
    let modeText = isCameraSatellite ? "視角: 追蹤衛星" : "視角: 地球中心";
    cameraModeBadge.textContent = `${modeText} | 時間: ${timeWarp}x`;
}

function toggleCamera() {
    isCameraSatellite = !isCameraSatellite;
    updateCameraBadge();
}

function setTimeWarp(warp) {
    timeWarp = warp;
    updateCameraBadge();
    
    // 更新時間流速按鈕的選取狀態
    const activeId = `warp-${warp}-btn`;
    document.querySelectorAll('.btn-warp').forEach(btn => {
        if (btn.id === activeId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function togglePause() {
    isRunning = !isRunning;
    if (isRunning) {
        update();
    }
}

// ==========================================================================
// 8. 主循環控制 (Physics & Rendering Loop)
// ==========================================================================
function update() {
    if (isRunning) {
        // 根據時間倍速調整每影格的物理運算步數
        // 預設 1x 下，每影格進行 45 步運算 (4.5秒)，確保 Verlet 非常平滑且速度舒適
        const steps = 3 * timeWarp;
        
        for (let i = 0; i < steps; i++) {
            physicsStep();
            if (isCrashed) break;
        }
        
        // 粒子更新
        particles.forEach(p => {
            // 排氣粒子在太空中做勻速運動
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.age++;
        });
        particles = particles.filter(p => p.age < p.maxAge);
        
        // 紀錄衛星軌道軌尾
        if (!isOnLaunchpad && !isCrashed) {
            orbitTrail.push({ x: x, y: y });
            if (orbitTrail.length > maxTrailLength) {
                orbitTrail.shift();
            }
        }
        
        updateCamera();
        updateTelemetry();
        drawGame();
        
        requestAnimationFrame(update);
    }
}

// ==========================================================================
// 9. 事件監聽器 (Event Listeners)
// ==========================================================================

// 按鈕事件
progradeBtn.addEventListener('click', () => triggerBurn(true));
retrogradeBtn.addEventListener('click', () => triggerBurn(false));

resetBtn.addEventListener('click', () => {
    initMission(currentMissionIdx);
});

toggleCameraBtn.addEventListener('click', toggleCamera);

modalNextBtn.addEventListener('click', () => {
    if (currentMissionIdx === 2) {
        initMission(0); // 循環挑戰
    } else {
        initMission(currentMissionIdx + 1);
    }
});

modalReplayBtn.addEventListener('click', () => {
    initMission(currentMissionIdx);
});

// 任務選擇選單事件
missionSelector.addEventListener('change', (e) => {
    initMission(parseInt(e.target.value));
});

// 時間流速按鈕事件
document.getElementById('warp-1-btn').addEventListener('click', () => setTimeWarp(1));
document.getElementById('warp-10-btn').addEventListener('click', () => setTimeWarp(10));
document.getElementById('warp-100-btn').addEventListener('click', () => setTimeWarp(100));
document.getElementById('warp-1000-btn').addEventListener('click', () => setTimeWarp(1000));

// 視窗尺寸自我調整
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // 即時繪製一格，防白屏
    updateTelemetry();
    drawGame();
}

window.addEventListener('resize', resizeCanvas);

// 鍵盤快捷鍵
window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePause();
    } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        triggerBurn(true);
    } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        triggerBurn(false);
    } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        toggleCamera();
    } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        initMission(currentMissionIdx);
    } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        toggleHUD();
    } else if (e.key === '1') {
        setTimeWarp(1);
    } else if (e.key === '2') {
        setTimeWarp(10);
    } else if (e.key === '3') {
        setTimeWarp(100);
    } else if (e.key === '4') {
        setTimeWarp(1000);
    }
});

// 主題切換按鈕事件
const themeToggleBtn = document.getElementById('theme-toggle-btn');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        if (document.body) {
            document.body.classList.toggle('light-mode');
        }
        const isLight = document.body && document.body.classList && document.body.classList.contains('light-mode');
        themeToggleBtn.innerHTML = isLight ? '🌙 切換暗色模式' : '🌓 切換明亮模式';
        updateCanvasTheme();
        
        // 即時重繪防白屏
        updateTelemetry();
        drawGame();
    });
}

// HUD 顯示/隱藏切換函數
function toggleHUD() {
    if (document.body) {
        document.body.classList.toggle('hud-hidden');
        const isHidden = document.body.classList.contains('hud-hidden');
        const hudToggleBtn = document.getElementById('hud-toggle-btn');
        if (hudToggleBtn) {
            hudToggleBtn.innerHTML = isHidden ? '👁️ 顯示儀表板 (H)' : '👁️ 隱藏儀表板 (H)';
        }
        // 重置畫布尺寸防白屏
        resizeCanvas();
    }
}

// HUD 切換按鈕事件
const hudToggleBtn = document.getElementById('hud-toggle-btn');
if (hudToggleBtn) {
    hudToggleBtn.addEventListener('click', toggleHUD);
}

// 縮放按鈕事件
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');

if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
        userZoomFactor *= 1.25;
        userZoomFactor = Math.min(20.0, userZoomFactor);
        updateCamera();
        drawGame();
    });
}
if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
        userZoomFactor /= 1.25;
        userZoomFactor = Math.max(0.05, userZoomFactor);
        updateCamera();
        drawGame();
    });
}
if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', () => {
        userZoomFactor = 1.0;
        updateCamera();
        drawGame();
    });
}

// 綁定畫布滑鼠滾輪事件
if (canvas) {
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            userZoomFactor *= 1.12; // 向上滾動放大
        } else {
            userZoomFactor /= 1.12; // 向下滾動縮小
        }
        userZoomFactor = Math.max(0.05, Math.min(20.0, userZoomFactor));
        updateCamera();
        drawGame();
    }, { passive: false });
}

// 啟動
updateCanvasTheme();
resizeCanvas();
initMission(0);
