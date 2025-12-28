/**
 * Physics Lab "Prism" Engine (Fixed Singleton) - ADAPTIVE TRAILS VERSION
 * Features:
 * 1. ADAPTIVE TRAILS: Streaks appear ONLY when orbiting cards, not during convergence.
 * 2. STARFIELD IDLE: Background is static to prevent "bug-like" movement.
 * 3. DYNAMIC SYNC: Updates element positions every 40 frames and on scroll.
 */
(function() {
  const canvas = document.getElementById('antigravity-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const killSignal = window._antigravity_stop_signal;
  
  let width, height, particles;
  let interactiveElements = [];
  const particleCount = 200;
  const mouse = { x: -1000, y: -1000 };
  let tick = 0;

  function init() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    particles = [];
    updateElements();
    for (let i = 0; i < particleCount; i++) {
        const px = Math.random() * width; const py = Math.random() * height;
        particles.push({
            x: px, y: py, homeX: px, homeY: py,
            baseSize: Math.random() * 1.5 + 0.5, history: []
        });
    }
  }

  function updateElements() {
    const selector = '.project-card, .nav-item, .cta-btn, .log-item, #app-search, #back-to-top';
    const list = Array.from(document.querySelectorAll(selector)).map(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || getComputedStyle(el).display === 'none') return null;
      let type = 'item';
      const text = el.innerText || "";
      if (text.includes('返回部落格')) type = 'back';
      else if (el.classList.contains('project-card') || el.id === 'app-search' || el.classList.contains('nav-item') || el.classList.contains('log-item')) type = 'card';
      else if (el.closest('#category-sidebar') && !el.classList.contains('nav-item')) type = 'sidebar';
      return { 
        type, x: rect.left, y: rect.top, w: rect.width, h: rect.height,
        centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2
      };
    }).filter(Boolean);
    interactiveElements = list;
  }

  function draw() {
    if (window._antigravity_stop_signal !== killSignal) return;
    tick++; if (tick % 40 === 0) updateElements();

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    const styles = getComputedStyle(document.documentElement);
    const spectral = ['--spectral-red', '--spectral-orange', '--spectral-white'].map(v => styles.getPropertyValue(v).trim() || '255, 255, 255');
    const time = Date.now() * 0.002;

    let hovered = interactiveElements.find(el => mouse.x > el.x && mouse.x < el.x + el.w && mouse.y > el.y && mouse.y < el.y + el.h);

    particles.forEach((p, i) => {
      let targetX = p.homeX, targetY = p.homeY;
      let easing = 0.04; 
      let active = false;

      if (hovered) {
        const dxH = hovered.centerX - p.x;
        const dyH = hovered.centerY - p.y;
        const distH = Math.sqrt(dxH*dxH + dyH*dyH);
        
        if (distH < 500) { 
            easing = 0.24;
            if (hovered.type === 'card') {
               active = true; 
               const perim = 2 * (hovered.w + hovered.h);
               const prog = ( (time * perim * 0.04) + (i * 0.05 * perim) ) % perim;
               let tx, ty;
               if (prog < hovered.w) { tx = hovered.x+prog; ty = hovered.y; }
               else if (prog < hovered.w + hovered.h) { tx = hovered.x+hovered.w; ty = hovered.y+(prog-hovered.w); }
               else if (prog < 2*hovered.w + hovered.h) { tx = hovered.x+hovered.w-(prog-(hovered.w+hovered.h)); ty = hovered.y+hovered.h; }
               else { tx = hovered.x; ty = hovered.y+hovered.h-(prog-(2*hovered.w+hovered.h)); }
               targetX = tx; targetY = ty;
            } else if (hovered.type === 'back') {
               const spread = hovered.w - 10;
               targetX = hovered.x + 5 + ( (i * 17) % spread );
               targetY = hovered.y + hovered.h + 8;
            } else if (hovered.type === 'sidebar') {
               targetX = hovered.x + 8;
               targetY = hovered.y + ( (i * 13) % (hovered.h - 4) ) + 2;
            } else {
               targetX = hovered.centerX; targetY = hovered.centerY;
            }
        }
      }

      const distToTarget = Math.sqrt(Math.pow(targetX - p.x, 2) + Math.pow(targetY - p.y, 2));
      p.x += (targetX - p.x) * easing;
      p.y += (targetY - p.y) * easing;

      // History Management
      p.history.push({x: p.x, y: p.y});
      if (p.history.length > 18) p.history.shift();
      
      // GATHERING GUARD: Clear history if far from target to hide heavy convergence lines
      if (distToTarget > 20) {
          p.history = [{x: p.x, y: p.y}];
      }

      const color = spectral[Math.floor((p.x + p.y + time) % 3)];
      const size = p.baseSize * (active ? 1.8 : 1);

      // Render: Trails ONLY when active (card orbit) AND close to path
      if (active && p.history.length > 1) {
          ctx.beginPath(); ctx.moveTo(p.history[0].x, p.history[0].y);
          for (let j = 1; j < p.history.length; j++) ctx.lineTo(p.history[j].x, p.history[j].y);
          ctx.strokeStyle = `rgba(${color}, 0.55)`; ctx.lineWidth = size * 0.8; ctx.stroke();
      }
      
      ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${active ? 0.8 : 0.4})`; ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', init);
  window.addEventListener('scroll', updateElements);
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  init(); draw();
})();
