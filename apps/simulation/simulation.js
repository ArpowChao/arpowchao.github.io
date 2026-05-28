// Physics Simulation: Spring Collision in Multiple Reference Frames
// Built with vanilla JS and HTML Canvas for high performance

// Simulation parameters and state
const state = {
  // Physical parameters (adjustable)
  massA: 2.0,
  massB: 3.0,
  velA: 150.0,   // Initial velocity of A (world units/s)
  velB: -50.0,  // Initial velocity of B (world units/s)
  k: 15.0,     // Spring constant
  e: 0.7,      // Coefficient of restitution
  playbackSpeed: 1.0, // Simulation speed multiplier
  
  // Ball state (absolute world coordinates)
  xA: 150,
  yA: 0, // 1D motion, y is constant
  vA: 150.0,
  
  xB: 650,
  yB: 0,
  vB: -50.0,
  
  // Spring state
  springLength: 120, // Natural length in world units
  isCompressing: false,
  maxCompressionReached: 0,
  
  // Energy tracking
  heatEnergy: 0,
  initialEnergy: 0,
  
  // View mode: 'third-person', 'ball-a', 'ball-b', 'com'
  viewMode: 'third-person',
  
  // Playback control
  isRunning: false,
  time: 0,
  history: [], // For energy charts
  
  // World bounds for resetting
  worldWidth: 800,
  radiusA: 35,
  radiusB: 45
};

// Canvas references
let simCanvas, simCtx;
let chartCanvas, chartCtx;

// Chart state
const chartState = {
  maxHistoryLength: 400,
  scrollOffset: 0
};

// Colors matching style.css
const colors = {
  get bg() { return varColorText('--bg-color'); },
  get grid() { return varColorText('--grid-color'); },
  get ballA() { return '#3b82f6'; },
  get ballB() { return '#f43f5e'; },
  get spring() { return varColorText('--spring-color'); },
  get springActive() { return '#fb923c'; },
  get ke() { return '#06b6d4'; },
  get int() { return '#a855f7'; },
  get com() { return varColorText('--com-color'); },
  get mech() { return '#10b981'; },
  get heat() { return '#f97316'; }
};

// Initialize once document is loaded
window.addEventListener('DOMContentLoaded', () => {
  initCanvases();
  setupEventListeners();
  resetSimulation();
  
  // Start animation loop
  requestAnimationFrame(tick);
});

function initCanvases() {
  simCanvas = document.getElementById('simCanvas');
  simCtx = simCanvas.getContext('2d');
  
  chartCanvas = document.getElementById('chartCanvas');
  chartCtx = chartCanvas.getContext('2d');
  
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);
}

function resizeCanvases() {
  // Resize simulation canvas
  const simRect = simCanvas.parentElement.getBoundingClientRect();
  simCanvas.width = simRect.width * window.devicePixelRatio;
  simCanvas.height = simRect.height * window.devicePixelRatio;
  simCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  // Resize chart canvas
  const chartRect = chartCanvas.parentElement.getBoundingClientRect();
  chartCanvas.width = chartRect.width * window.devicePixelRatio;
  chartCanvas.height = chartRect.height * window.devicePixelRatio;
  chartCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function setupEventListeners() {
  // Bind sliders
  const sliders = [
    { id: 'mass-a', prop: 'massA', labelId: 'mass-a-val', unit: ' kg' },
    { id: 'mass-b', prop: 'massB', labelId: 'mass-b-val', unit: ' kg' },
    { id: 'vel-a', prop: 'velA', labelId: 'vel-a-val', unit: ' m/s' },
    { id: 'vel-b', prop: 'velB', labelId: 'vel-b-val', unit: ' m/s' },
    { id: 'spring-k', prop: 'k', labelId: 'spring-k-val', unit: ' N/m' },
    { id: 'coeff-e', prop: 'e', labelId: 'coeff-e-val', unit: '' },
    { id: 'sim-speed', prop: 'playbackSpeed', labelId: 'speed-val', unit: 'x' }
  ];
  
  sliders.forEach(slider => {
    const el = document.getElementById(slider.id);
    const valEl = document.getElementById(slider.labelId);
    el.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state[slider.prop] = val;
      valEl.textContent = val.toFixed(slider.prop === 'e' ? 2 : 1) + slider.unit;
      
      // If we change mass/velocity/e/k, we should probably reset or adapt initial energies
      if (!state.isRunning) {
        resetSimulation();
      }
    });
  });
  
  // View buttons
  const viewBtns = document.querySelectorAll('.view-btn');
  viewBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.viewMode = btn.dataset.view;
      document.getElementById('view-indicator').textContent = btn.textContent;
    });
  });
  
  // Action buttons
  document.getElementById('btn-play').addEventListener('click', () => {
    state.isRunning = !state.isRunning;
    document.getElementById('btn-play').innerHTML = state.isRunning ? 
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> 暫停` : 
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 開始`;
  });
  
  document.getElementById('btn-step').addEventListener('click', () => {
    state.isRunning = false;
    document.getElementById('btn-play').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 開始`;
    updatePhysics(0.016); // step 1 frame
  });
  
  document.getElementById('btn-reset').addEventListener('click', () => {
    resetSimulation();
  });

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const themeText = themeToggle.querySelector('span');
  
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    
    // Update button text and icon
    if (isLight) {
      themeText.textContent = '暗黑模式';
      // Sun icon
      themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
    } else {
      themeText.textContent = '明亮模式';
      // Moon icon
      themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
    }
  });
}

function resetSimulation() {
  state.xA = 150;
  state.xB = 650;
  
  state.vA = state.velA;
  state.vB = state.velB;
  
  state.heatEnergy = 0;
  state.isCompressing = false;
  state.maxCompressionReached = 0;
  state.time = 0;
  state.history = [];
  
  // Calculate initial energy
  const keA = 0.5 * state.massA * state.vA * state.vA;
  const keB = 0.5 * state.massB * state.vB * state.vB;
  state.initialEnergy = keA + keB;
  
  updateDigitalStats();
}

function updatePhysics(dt) {
  // Sub-stepping for integration stability (Hooke's law can be stiff)
  const substeps = 20;
  const sdt = dt / substeps;
  
  for (let step = 0; step < substeps; step++) {
    // 1D distance check
    // Tip of spring on B is B's contact edge minus natural spring length
    const springTipUncompressed = state.xB - state.radiusB - state.springLength;
    const edgeA = state.xA + state.radiusA;
    
    // Compression is positive when A enters the spring's range
    let compression = edgeA - springTipUncompressed;
    
    let force = 0;
    const relVel = state.vA - state.vB; // positive means moving closer
    
    if (compression > 0) {
      // We are in contact!
      if (!state.isCompressing && relVel > 0) {
        state.isCompressing = true;
      }
      
      // Determine active spring constant
      let activeK = state.k;
      if (relVel <= 0 && state.isCompressing) {
        // Just crossed peak compression to expansion phase. Loss happens now!
        const energyLoss = 0.5 * (state.k - state.e * state.e * state.k) * compression * compression;
        state.heatEnergy += energyLoss;
        state.isCompressing = false; // Transitioned to expansion
      }
      
      if (!state.isCompressing) {
        activeK = state.e * state.e * state.k;
      }
      
      force = activeK * compression;
      
      // Prevent extreme overlap of balls (hard boundary)
      const ballsTouchEdge = state.xB - state.radiusB;
      if (edgeA >= ballsTouchEdge) {
        // Hard collision resolution or force boost to keep them apart
        force += 500 * (edgeA - ballsTouchEdge);
      }
    } else {
      // Outside spring contact
      state.isCompressing = false;
    }
    
    // Equations of motion
    const accA = -force / state.massA;
    const accB = force / state.massB;
    
    state.vA += accA * sdt;
    state.vB += accB * sdt;
    
    state.xA += state.vA * sdt;
    state.xB += state.vB * sdt;
    
    // Keep within world bounds to let them rebound or just pass through.
  }
  
  // Auto-reset when balls go off-screen
  const margin = 80;
  if (state.xA < -state.radiusA - margin || 
      state.xA > state.worldWidth + state.radiusA + margin ||
      state.xB < -state.radiusB - margin || 
      state.xB > state.worldWidth + state.radiusB + margin) {
    resetSimulation();
    return;
  }
  
  state.time += dt;
  
  // Calculate Energies
  const keA = 0.5 * state.massA * state.vA * state.vA;
  const keB = 0.5 * state.massB * state.vB * state.vB;
  const kineticEnergy = keA + keB;
  
  const vCoM = (state.massA * state.vA + state.massB * state.vB) / (state.massA + state.massB);
  const comKineticEnergy = 0.5 * (state.massA + state.massB) * vCoM * vCoM;
  const internalKineticEnergy = 0.5 * state.massA * (state.vA - vCoM) * (state.vA - vCoM) + 
                                0.5 * state.massB * (state.vB - vCoM) * (state.vB - vCoM);
                                
  // Spring potential energy
  const springTipUncompressed = state.xB - state.radiusB - state.springLength;
  const compression = Math.max(0, (state.xA + state.radiusA) - springTipUncompressed);
  const activeK = (state.vA - state.vB > 0 || state.isCompressing) ? state.k : (state.e * state.e * state.k);
  const potentialEnergy = compression > 0 ? 0.5 * activeK * compression * compression : 0;
  
  const mechanicalEnergy = kineticEnergy + potentialEnergy;
  
  // Store history
  state.history.push({
    time: state.time,
    ke: kineticEnergy,
    com: comKineticEnergy,
    internal: internalKineticEnergy,
    mech: mechanicalEnergy,
    heat: state.heatEnergy
  });
  
  if (state.history.length > chartState.maxHistoryLength) {
    state.history.shift();
  }
  
  updateDigitalStats();
}

function getRelativeVelocities() {
  const vCoM = (state.massA * state.vA + state.massB * state.vB) / (state.massA + state.massB);
  let dispValA = state.vA;
  let dispValB = state.vB;
  
  if (state.viewMode === 'ball-a') {
    dispValA = 0;
    dispValB = state.vB - state.vA;
  } else if (state.viewMode === 'ball-b') {
    dispValA = state.vA - state.vB;
    dispValB = 0;
  } else if (state.viewMode === 'com') {
    dispValA = state.vA - vCoM;
    dispValB = state.vB - vCoM;
  }
  return { vA: dispValA, vB: dispValB };
}

function updateDigitalStats() {
  const vCoM = (state.massA * state.vA + state.massB * state.vB) / (state.massA + state.massB);
  const keA = 0.5 * state.massA * state.vA * state.vA;
  const keB = 0.5 * state.massB * state.vB * state.vB;
  const kineticEnergy = keA + keB;
  const comKineticEnergy = 0.5 * (state.massA + state.massB) * vCoM * vCoM;
  const internalKineticEnergy = kineticEnergy - comKineticEnergy;
  
  const springTipUncompressed = state.xB - state.radiusB - state.springLength;
  const compression = Math.max(0, (state.xA + state.radiusA) - springTipUncompressed);
  const activeK = (state.vA - state.vB > 0 || state.isCompressing) ? state.k : (state.e * state.e * state.k);
  const potentialEnergy = compression > 0 ? 0.5 * activeK * compression * compression : 0;
  
  const mechanicalEnergy = kineticEnergy + potentialEnergy;

  document.getElementById('stat-ke').textContent = kineticEnergy.toFixed(0) + ' J';
  document.getElementById('stat-mech').textContent = mechanicalEnergy.toFixed(0) + ' J';
  document.getElementById('stat-int').textContent = Math.max(0, internalKineticEnergy).toFixed(0) + ' J';
  document.getElementById('stat-com').textContent = comKineticEnergy.toFixed(0) + ' J';
  document.getElementById('stat-heat').textContent = state.heatEnergy.toFixed(0) + ' J';
  
  // Dynamic labels for velocities under balls (displaying relative velocity based on view mode)
  const relVels = getRelativeVelocities();
  document.getElementById('vel-a-live').textContent = relVels.vA.toFixed(1) + ' m/s';
  document.getElementById('vel-b-live').textContent = relVels.vB.toFixed(1) + ' m/s';
}

function drawSimulation() {
  const width = simCanvas.width / window.devicePixelRatio;
  const height = simCanvas.height / window.devicePixelRatio;
  
  simCtx.clearRect(0, 0, width, height);
  
  // Viewport projection shifts
  let offset = 0;
  const midX = width / 2;
  const vCoM = (state.massA * state.vA + state.massB * state.vB) / (state.massA + state.massB);
  const xCoM = (state.massA * state.xA + state.massB * state.xB) / (state.massA + state.massB);
  
  if (state.viewMode === 'ball-a') {
    offset = midX - state.xA;
  } else if (state.viewMode === 'ball-b') {
    offset = midX - state.xB;
  } else if (state.viewMode === 'com') {
    offset = midX - xCoM;
  } else {
    // Third person view: Keep world centered
    offset = midX - (state.worldWidth / 2);
  }
  
  // Draw background grid
  simCtx.strokeStyle = colors.grid;
  simCtx.lineWidth = 1;
  const gridSize = 40;
  const gridOffset = offset % gridSize;
  
  for (let x = gridOffset; x < width; x += gridSize) {
    simCtx.beginPath();
    simCtx.moveTo(x, 0);
    simCtx.lineTo(x, height - 40);
    simCtx.stroke();
  }
  
  // Draw baseline
  simCtx.strokeStyle = '#334155';
  simCtx.lineWidth = 3;
  simCtx.beginPath();
  simCtx.moveTo(0, height - 40);
  simCtx.lineTo(width, height - 40);
  simCtx.stroke();
  
  // Coordinates mapped to the screen
  const drawXA = state.xA + offset;
  const drawXB = state.xB + offset;
  const drawXCoM = xCoM + offset;
  const centerY = height - 120;
  
  // Draw Center of Mass line indicator
  simCtx.setLineDash([5, 5]);
  simCtx.strokeStyle = colors.com;
  simCtx.lineWidth = 1.5;
  simCtx.beginPath();
  simCtx.moveTo(drawXCoM, 40);
  simCtx.lineTo(drawXCoM, height - 40);
  simCtx.stroke();
  simCtx.setLineDash([]);
  
  // Label for CoM
  simCtx.fillStyle = colors.com;
  simCtx.font = '500 11px Outfit';
  simCtx.fillText('質心 CoM', drawXCoM - 24, 30);
  
  // Draw Spring on Ball B
  const springStart = drawXB - state.radiusB;
  const springTipUncompressed = state.xB - state.radiusB - state.springLength;
  const compression = Math.max(0, (state.xA + state.radiusA) - springTipUncompressed);
  const springEnd = springStart - (state.springLength - compression);
  
  drawSpring(springEnd, springStart, centerY, 20, 16, compression > 0);
  
  // Draw Ball A
  drawBall(drawXA, centerY, state.radiusA, colors.ballA, 'A', state.massA);
  
  // Draw Ball B
  drawBall(drawXB, centerY, state.radiusB, colors.ballB, 'B', state.massB);
  
  // Draw velocity vectors (relative velocity based on viewpoint)
  const relVels = getRelativeVelocities();
  drawVelocityVector(drawXA, centerY - state.radiusA - 15, relVels.vA, colors.ballA);
  drawVelocityVector(drawXB, centerY - state.radiusB - 15, relVels.vB, colors.ballB);
}

function drawBall(x, y, radius, color, label, mass) {
  // Outer glow/shadow
  simCtx.shadowBlur = 15;
  simCtx.shadowColor = color + '44';
  
  // Ball gradient
  const grad = simCtx.createRadialGradient(x - radius/3, y - radius/3, radius/10, x, y, radius);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, color);
  grad.addColorStop(1, '#0c0f16');
  
  simCtx.fillStyle = grad;
  simCtx.beginPath();
  simCtx.arc(x, y, radius, 0, Math.PI * 2);
  simCtx.fill();
  
  // Reset shadow
  simCtx.shadowBlur = 0;
  
  // Ball boundary border
  simCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  simCtx.lineWidth = 1.5;
  simCtx.beginPath();
  simCtx.arc(x, y, radius, 0, Math.PI * 2);
  simCtx.stroke();
  
  // Typography labels
  simCtx.fillStyle = '#ffffff';
  simCtx.font = 'bold 16px Outfit';
  simCtx.textAlign = 'center';
  simCtx.textBaseline = 'middle';
  simCtx.fillText(label, x, y - 5);
  
  simCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  simCtx.font = '500 11px Outfit';
  simCtx.fillText(`${mass}kg`, x, y + 12);
}

function drawSpring(startX, endX, y, heightSpring, coils, active) {
  simCtx.strokeStyle = active ? colors.springActive : colors.spring;
  simCtx.lineWidth = 3.5;
  simCtx.lineCap = 'round';
  simCtx.lineJoin = 'round';
  
  simCtx.beginPath();
  simCtx.moveTo(startX, y);
  
  const springWidth = endX - startX;
  const coilWidth = springWidth / coils;
  
  // Draw connector lines at both ends
  simCtx.lineTo(startX + coilWidth * 0.5, y);
  
  for (let i = 1; i < coils - 1; i++) {
    const cx = startX + coilWidth * 0.5 + i * coilWidth;
    const cy = y + (i % 2 === 0 ? 1 : -1) * heightSpring;
    simCtx.lineTo(cx, cy);
  }
  
  simCtx.lineTo(endX - coilWidth * 0.5, y);
  simCtx.lineTo(endX, y);
  simCtx.stroke();
  
  // Draw spring tip plate
  simCtx.fillStyle = active ? colors.springActive : '#cbd5e1';
  simCtx.fillRect(startX - 2, y - heightSpring - 2, 4, heightSpring * 2 + 4);
}

function drawVelocityVector(x, y, vel, color) {
  const scale = 0.4; // Scale vector arrows for visualization
  if (Math.abs(vel) < 0.5) return;
  
  const length = vel * scale;
  
  simCtx.strokeStyle = color;
  simCtx.fillStyle = color;
  simCtx.lineWidth = 3;
  
  simCtx.beginPath();
  simCtx.moveTo(x, y);
  simCtx.lineTo(x + length, y);
  simCtx.stroke();
  
  // Arrow head
  const arrowSize = 6;
  const dir = vel > 0 ? 1 : -1;
  simCtx.beginPath();
  simCtx.moveTo(x + length, y);
  simCtx.lineTo(x + length - dir * arrowSize, y - arrowSize);
  simCtx.lineTo(x + length - dir * arrowSize, y + arrowSize);
  simCtx.fill();
}

function drawEnergyCharts() {
  const width = chartCanvas.width / window.devicePixelRatio;
  const height = chartCanvas.height / window.devicePixelRatio;
  
  chartCtx.clearRect(0, 0, width, height);
  
  if (state.history.length === 0) return;
  
  // Find max energy to scale Y-axis dynamically
  let maxEnergy = 10; // Baseline
  state.history.forEach(pt => {
    if (pt.mech > maxEnergy) maxEnergy = pt.mech;
    if (pt.ke > maxEnergy) maxEnergy = pt.ke;
  });
  maxEnergy *= 1.15; // 15% margin at top
  
  const padLeft = 40;
  const padRight = 10;
  const padTop = 15;
  const padBottom = 25;
  
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  
  // Draw grid lines
  chartCtx.strokeStyle = '#1e293b';
  chartCtx.lineWidth = 1;
  const gridTicks = 4;
  for (let i = 0; i <= gridTicks; i++) {
    const y = padTop + chartH * (1 - i / gridTicks);
    chartCtx.beginPath();
    chartCtx.moveTo(padLeft, y);
    chartCtx.lineTo(width - padRight, y);
    chartCtx.stroke();
    
    // Label
    chartCtx.fillStyle = varColorText('--text-secondary');
    chartCtx.font = '400 9px monospace';
    chartCtx.fillText((maxEnergy * (i / gridTicks)).toFixed(1) + 'J', 5, y + 3);
  }
  
  // Drawing functions for individual lines
  function drawLine(key, colorHex, opacity = 0.08) {
    if (state.history.length === 0) return;
    
    const stepSize = chartW / (chartState.maxHistoryLength - 1);
    const startIdx = chartState.maxHistoryLength - state.history.length;
    
    // 1. Draw gradient area under the line
    if (opacity > 0) {
      chartCtx.beginPath();
      state.history.forEach((pt, idx) => {
        const x = padLeft + (startIdx + idx) * stepSize;
        const y = padTop + chartH * (1 - pt[key] / maxEnergy);
        if (idx === 0) {
          chartCtx.moveTo(x, y);
        } else {
          chartCtx.lineTo(x, y);
        }
      });
      // Close the path to the bottom of the chart
      const lastX = padLeft + (startIdx + state.history.length - 1) * stepSize;
      const firstX = padLeft + startIdx * stepSize;
      chartCtx.lineTo(lastX, padTop + chartH);
      chartCtx.lineTo(firstX, padTop + chartH);
      chartCtx.closePath();
      
      const grad = chartCtx.createLinearGradient(0, padTop, 0, padTop + chartH);
      // Construct hex + opacity string cleanly
      const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
      grad.addColorStop(0, colorHex + alphaHex);
      grad.addColorStop(1, colorHex + '00');
      
      chartCtx.fillStyle = grad;
      chartCtx.fill();
    }
    
    // 2. Draw the line itself with a subtle neon glow
    chartCtx.strokeStyle = colorHex;
    chartCtx.lineWidth = 2.5;
    chartCtx.shadowColor = colorHex + '55';
    chartCtx.shadowBlur = 4;
    chartCtx.beginPath();
    
    state.history.forEach((pt, idx) => {
      const x = padLeft + (startIdx + idx) * stepSize;
      const y = padTop + chartH * (1 - pt[key] / maxEnergy);
      
      if (idx === 0) {
        chartCtx.moveTo(x, y);
      } else {
        chartCtx.lineTo(x, y);
      }
    });
    chartCtx.stroke();
    chartCtx.shadowBlur = 0; // Reset shadow
  }
  
  // Render energy streams
  drawLine('com', colors.com, 0.05);
  drawLine('internal', colors.int, 0.05);
  drawLine('ke', colors.ke, 0.05);
  drawLine('heat', colors.heat, 0.05);
  drawLine('mech', colors.mech, 0.1);
}

// Read theme/style variables dynamically
function varColorText(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#9ca3af';
}

// Animation core loop
function tick() {
  if (state.isRunning) {
    // 60fps frame delta is roughly 0.016s * playbackSpeed
    updatePhysics(0.016 * state.playbackSpeed);
  }
  
  drawSimulation();
  drawEnergyCharts();
  
  requestAnimationFrame(tick);
}
