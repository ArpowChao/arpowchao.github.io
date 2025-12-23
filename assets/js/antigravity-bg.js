(function() {
  const canvas = document.createElement('canvas');
  canvas.id = 'antigravity-canvas';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width, height, particles;
  let interactiveElements = [];
  const particleCount = 200;
  const mouse = { x: -1000, y: -1000 };

  function init() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    particles = [];

    updateElements();

    for (let i = 0; i < particleCount; i++) {
      const px = Math.random() * width;
      const py = Math.random() * height;
      particles.push({
        x: px,
        y: py,
        homeX: px,
        homeY: py,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: Math.random() * 1.5 + 0.3,
        baseSize: 0,
        maxOpacity: Math.random() * 0.4 + 0.15,
        friction: 0.95,
        stiffness: 0.01
      });
      particles[i].baseSize = particles[i].size;
    }
  }

  function updateElements() {
    const cards = Array.from(document.querySelectorAll('.post-preview, .project-card')).map(el => ({ 
      el, type: 'card', rect: el.getBoundingClientRect() 
    }));
    const tags = Array.from(document.querySelectorAll('.post-tag, .tag-item')).map(el => ({ 
      el, type: 'tag', rect: el.getBoundingClientRect() 
    }));
    const updates = Array.from(document.querySelectorAll('#access-lastmod li, .log-item')).map(el => ({ 
      el, type: 'update', rect: el.getBoundingClientRect() 
    }));
    const navLinks = Array.from(document.querySelectorAll('#custom-nav .nav-link')).map(el => ({ 
      el, type: 'nav', rect: el.getBoundingClientRect() 
    }));

    interactiveElements = [...cards, ...tags, ...updates, ...navLinks].map(item => ({
      type: item.type,
      x: item.rect.left,
      y: item.rect.top,
      w: item.rect.width,
      h: item.rect.height,
      centerX: item.rect.left + item.rect.width / 2,
      centerY: item.rect.top + item.rect.height / 2
    }));
  }

  function draw() {
    updateElements(); // Dynamic update every frame for perfect sync
    ctx.clearRect(0, 0, width, height);

    const mode = document.documentElement.getAttribute('data-mode') || 
                 (document.body.classList.contains('light-theme') ? 'light' : 'dark');
    const isDark = mode !== 'light';
    const baseColor = isDark ? '180, 210, 255' : '40, 100, 240';
    const time = Date.now() * 0.002;

    let hoveredEl = null;
    interactiveElements.forEach(el => {
      if (mouse.x > el.x - 5 && mouse.x < el.x + el.w + 5 &&
          mouse.y > el.y - 5 && mouse.y < el.y + el.h + 5) {
        hoveredEl = el;
      }
    });

    particles.forEach((p, i) => {
      // Find house element for this particle's neighbors
      let currentHovered = hoveredEl;
      
      const dxMouse = mouse.x - p.x;
      const dyMouse = mouse.y - p.y;
      const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
      
      let targetX = p.homeX;
      let targetY = p.homeY;
      let forceMultiplier = 0.003; 
      let currentFriction = p.friction;

      if (currentHovered) {
        forceMultiplier = 0.35; 
        currentFriction = 0.45; 
        p.opacity = p.maxOpacity + 0.3;
        
        if (currentHovered.type === 'card') {
          // --- Draw unified background highlight ON CANVAS for perfect sync ---
          if (i === 0) { // Only draw once per frame
            ctx.fillStyle = isDark ? 'rgba(180, 210, 255, 0.08)' : 'rgba(64, 128, 255, 0.06)';
            const r = 12; // Matches CSS border-radius
            const { x, y, w, h } = currentHovered;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            ctx.fill();
          }

          // --- Flowing Square Path ---
          const perimeter = 2 * (currentHovered.w + currentHovered.h);
          const speed = 0.0015;
          const progress = ( (time * perimeter * speed) + (i * 0.05 * perimeter) ) % perimeter;
          
          let tx, ty;
          if (progress < currentHovered.w) {
            tx = currentHovered.x + progress; ty = currentHovered.y;
          } else if (progress < currentHovered.w + currentHovered.h) {
            tx = currentHovered.x + currentHovered.w; ty = currentHovered.y + (progress - currentHovered.w);
          } else if (progress < 2 * currentHovered.w + currentHovered.h) {
            tx = currentHovered.x + currentHovered.w - (progress - (currentHovered.w + currentHovered.h)); ty = currentHovered.y + currentHovered.h;
          } else {
            tx = currentHovered.x; ty = currentHovered.y + currentHovered.h - (progress - (2 * currentHovered.w + currentHovered.h));
          }
          
          targetX = tx + Math.sin(time + i) * 5;
          targetY = ty + Math.cos(time + i) * 5;
          p.opacity = p.maxOpacity + 0.3;
          forceMultiplier = 0.45;
          currentFriction = 0.4;
        } else if (currentHovered.type === 'tag') {
          const angle = (time * 2) + (i * 0.5);
          targetX = currentHovered.centerX + Math.cos(angle) * (currentHovered.w / 2 + 10);
          targetY = currentHovered.centerY + Math.sin(angle) * (currentHovered.h / 2 + 10);
        } else if (currentHovered.type === 'update') {
          targetX = currentHovered.x - 12;
          targetY = currentHovered.y + (i * 17 % currentHovered.h);
        } else if (currentHovered.type === 'nav') {
          targetX = currentHovered.x + (i * 59 % currentHovered.w);
          targetY = currentHovered.y + currentHovered.h + 2;
        }
      } else if (distMouse < 220) {
        // ... existence logic ...
        const f = (220 - distMouse) / 220;
        p.size = p.baseSize * (1 + Math.sin(distMouse * 0.06 - time * 3) * 1.5 * f);
        p.opacity = p.maxOpacity + f * 0.4;
        p.vx += Math.cos(time + distMouse * 0.1) * 0.08 * f;
        p.vy += Math.sin(time + distMouse * 0.1) * 0.08 * f;
        targetX = p.x; targetY = p.y;
      } else {
        p.opacity = p.maxOpacity * 0.6;
        p.size = p.baseSize;
      }

      // 物理計算
      p.vx += (targetX - p.x) * forceMultiplier;
      p.vy += (targetY - p.y) * forceMultiplier;
      p.vx *= currentFriction;
      p.vy *= currentFriction;
      p.x += p.vx;
      p.y += p.vy;

      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${baseColor}, ${Math.min(1, p.opacity)})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  // setInterval(updateElements, 4000); // No longer needed as we update in draw()
  window.addEventListener('resize', init);
  window.addEventListener('scroll', updateElements); // Keep positions synchronized
  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  init();
  draw();
})();
