/**
 * Blog "Mist" Engine (Dark Mode) - REFINED CLEAN PHYSICS
 * 採用用戶提供的物理回歸邏輯，但去除滑鼠噴散力並簡化渲染。
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
            x: px, y: py, homeX: px, homeY: py,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            baseSize: Math.random() * 1.5 + 0.6,
            opacity: Math.random() * 0.4 + 0.15,
            friction: 0.95 
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
    
    const time = Date.now() * 0.001;
    const styles = getComputedStyle(document.documentElement);
    const highlight = styles.getPropertyValue('--particle-highlight').trim() || '255, 255, 255';
    
    let hovered = interactiveElements.find(el => mouse.x > el.x && mouse.x < el.x + el.w && mouse.y > el.y && mouse.y < el.y + el.h);

    particles.forEach((p, i) => {
      let targetX = p.homeX, targetY = p.homeY;
      let forceMultiplier = 0.0015; 
      let currentFriction = p.friction;
      let colorMode = highlight;

      if (hovered) {
        forceMultiplier = 0.35; 
        currentFriction = 0.45;
        
        if (hovered.type === 'card') {
          const perim = 2 * (hovered.w + hovered.h);
          const prog = ( (time * perim * 0.04) + (i * 0.05 * perim) ) % perim;
          let tx, ty;
          if (prog < hovered.w) { tx = hovered.x+prog; ty = hovered.y; }
          else if (prog < hovered.w + hovered.h) { tx = hovered.x+hovered.w; ty = hovered.y+(prog-hovered.w); }
          else if (prog < 2*hovered.w + hovered.h) { tx = hovered.x+hovered.w-(prog-(hovered.w+hovered.h)); ty = hovered.y+hovered.h; }
          else { tx = hovered.x; ty = hovered.y+hovered.h-(prog-(2*hovered.w+hovered.h)); }
          targetX = tx + Math.sin(time + i) * 7;
          targetY = ty + Math.cos(time + i) * 7;
        } else if (hovered.type === 'tag') {
          const a = (time * 0.8) + (i * 0.4);
          targetX = hovered.centerX + Math.cos(a) * (hovered.w/2 + 15);
          targetY = hovered.centerY + Math.sin(a) * (hovered.h/2 + 15);
        } else if (hovered.type === 'update') {
          targetX = hovered.x - 14; 
          targetY = hovered.y + ((i * 19) % Math.max(1, hovered.h));
        }
      } else {
        targetX = p.homeX + Math.sin(time*0.5 + i) * 5;
        targetY = p.homeY + Math.cos(time*0.4 + i) * 5;
        if (Math.abs(p.vx) > 0.15) colorMode = '255, 255, 255';
      }

      p.vx += (targetX - p.x) * forceMultiplier;
      p.vy += (targetY - p.y) * forceMultiplier;
      p.vx *= currentFriction;
      p.vy *= currentFriction;
      p.x += p.vx;
      p.y += p.vy;

      const size = p.baseSize * (hovered ? 1.8 : 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colorMode}, ${hovered ? 0.65 : 0.35})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', init);
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  init(); draw();
})();
