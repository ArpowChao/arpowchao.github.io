/**
 * Blog "Wave" Engine (Light Mode) - AUDITED FINAL VERSION
 * Features:
 * 1. SNAPPY SPRAY: Physics-based repulsion.
 * 2. POST ORBITS: Fast circular rings.
 * 3. UPDATE LINE: Vertical alignment for log items (RESTORED).
 * 4. WHITE DISSIPATION: Quick scattering trails.
 */
(function() {
  const canvas = document.getElementById('antigravity-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const killSignal = window._antigravity_stop_signal;

  let width, height, particles;
  let interactiveElements = [];
  const particleCount = 180;
  const mouse = { x: -1000, y: -1000 };

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
            x: px, y: py, homeX: px, homeY: py, vx: 0, vy: 0,
            baseSize: Math.random() * 1.4 + 0.4, history: []
        });
    }
  }

  function updateElements() {
    const selector = '.post-preview, .project-card, .card, .post-tag, .tag-item, #access-lastmod li, .log-item';
    interactiveElements = Array.from(document.querySelectorAll(selector)).map(el => {
      const rect = el.getBoundingClientRect();
      let type = 'card';
      if (el.classList.contains('post-tag') || el.classList.contains('tag-item')) type = 'tag';
      else if (el.closest('#access-lastmod') || el.classList.contains('log-item')) type = 'update';
      return { type, x: rect.left, y: rect.top, w: rect.width, h: rect.height, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
    });
  }

  function draw() {
    if (window._antigravity_stop_signal !== killSignal) return;
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(document.documentElement);
    const highlight = styles.getPropertyValue('--particle-highlight').trim() || '255, 255, 255';
    const time = Date.now() * 0.002;
    let hovered = interactiveElements.find(el => mouse.x > el.x && mouse.x < el.x + el.w && mouse.y > el.y && mouse.y < el.y + el.h);

    particles.forEach((p, i) => {
      let targetX = p.homeX, targetY = p.homeY;
      let friction = 0.88, force = 0.012;
      const dxM = mouse.x - p.x, dyM = mouse.y - p.y, distM = Math.sqrt(dxM*dxM + dyM*dyM);
      const prevX = p.x, prevY = p.y;
      
      if (hovered) {
        force = 0.35; friction = 0.45;
        if (hovered.type === 'card') {
           const perim = 2 * (hovered.w + hovered.h);
           const prog = ( (time * perim * 0.0016) + (i * 0.05 * perim) ) % perim;
           if (prog < hovered.w) { targetX = hovered.x+prog; targetY = hovered.y; }
           else if (prog < hovered.w + hovered.h) { targetX = hovered.x+hovered.w; targetY = hovered.y+(prog-hovered.w); }
           else if (prog < 2*hovered.w + hovered.h) { targetX = hovered.x+hovered.w-(prog-(hovered.w+hovered.h)); targetY = hovered.y+hovered.h; }
           else { targetX = hovered.x; targetY = hovered.y+hovered.h-(prog-(2*hovered.w+hovered.h)); }
           targetX += Math.sin(time*2.5+i)*6; targetY += Math.cos(time*2.5+i)*6;
        } else if (hovered.type === 'tag') {
           const a = (time * 2) + (i * 0.5); 
           targetX = hovered.centerX + Math.cos(a) * (hovered.w/2 + 10); 
           targetY = hovered.centerY + Math.sin(a) * (hovered.h/2 + 10);
        } else if (hovered.type === 'update') {
           // --- RESTORED: LEFT LINE ALIGNMENT ---
           targetX = hovered.x - 12; 
           targetY = hovered.y + (i * 17 % hovered.h);
        }
      } else if (distM < 160) {
        const f = (160 - distM) / 160;
        p.vx += Math.cos(time + distM * 0.05) * 0.3 * f;
        p.vy += Math.sin(time + distM * 0.05) * 0.3 * f;
        targetX = p.x; targetY = p.y;
      }
      p.vx = (p.vx + (targetX - p.x) * force) * friction;
      p.vy = (p.vy + (targetY - p.y) * force) * friction;
      p.x += p.vx; p.y += p.vy;

      const isScat = (!hovered && (distM < 160 || Math.abs(p.vx) > 0.35));
      const color = isScat ? '255, 255, 255' : highlight;
      const size = p.baseSize * (hovered || isScat ? 1.7 : 1);
      
      ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${hovered ? 0.65 : 0.35})`; ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', init);
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  init(); draw();
})();
