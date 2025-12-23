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
    const cards = Array.from(document.querySelectorAll('.card-wrapper, .post-preview, .project-card')).map(el => ({ 
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

    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    interactiveElements = [...cards, ...tags, ...updates, ...navLinks].map(item => ({
      type: item.type,
      x: item.rect.left + scrollX,
      y: item.rect.top + scrollY,
      w: item.rect.width,
      h: item.rect.height,
      centerX: item.rect.left + scrollX + item.rect.width / 2,
      centerY: item.rect.top + scrollY + item.rect.height / 2
    }));
  }

  function draw() {
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
      const dxMouse = mouse.x - p.x;
      const dyMouse = mouse.y - p.y;
      const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
      
      let targetX = p.homeX;
      let targetY = p.homeY;
      let forceMultiplier = 0.003; 
      let currentFriction = p.friction;

      if (hoveredEl) {
        // --- 超強吸引力 + 高阻尼 = 瞬間到位無震盪 ---
        forceMultiplier = 0.35; 
        currentFriction = 0.45; 
        p.opacity = p.maxOpacity + 0.3;
        
        if (hoveredEl.type === 'card') {
          // --- Flowing Square Path instead of rigid box or circle ---
          const perimeter = 2 * (hoveredEl.w + hoveredEl.h);
          const speed = 0.0015;
          const progress = ( (time * perimeter * speed) + (i * 0.05 * perimeter) ) % perimeter;
          
          let tx, ty;
          if (progress < hoveredEl.w) {
            tx = hoveredEl.x + progress; ty = hoveredEl.y;
          } else if (progress < hoveredEl.w + hoveredEl.h) {
            tx = hoveredEl.x + hoveredEl.w; ty = hoveredEl.y + (progress - hoveredEl.w);
          } else if (progress < 2 * hoveredEl.w + hoveredEl.h) {
            tx = hoveredEl.x + hoveredEl.w - (progress - (hoveredEl.w + hoveredEl.h)); ty = hoveredEl.y + hoveredEl.h;
          } else {
            tx = hoveredEl.x; ty = hoveredEl.y + hoveredEl.h - (progress - (2 * hoveredEl.w + hoveredEl.h));
          }
          
          // Add some organic "floating" vibration
          targetX = tx + Math.sin(time + i) * 5;
          targetY = ty + Math.cos(time + i) * 5;
          p.opacity = p.maxOpacity + 0.3;
          forceMultiplier = 0.45; // Faster snap
          currentFriction = 0.4;  // Better stability
        } else if (hoveredEl.type === 'tag') {
          const angle = (time * 2) + (i * 0.5);
          targetX = hoveredEl.centerX + Math.cos(angle) * (hoveredEl.w / 2 + 10);
          targetY = hoveredEl.centerY + Math.sin(angle) * (hoveredEl.h / 2 + 10);
        } else if (hoveredEl.type === 'update') {
          targetX = hoveredEl.x - 12;
          targetY = hoveredEl.y + (i * 17 % hoveredEl.h);
        } else if (hoveredEl.type === 'nav') {
          targetX = hoveredEl.x + (i * 59 % hoveredEl.w);
          targetY = hoveredEl.y + hoveredEl.h + 2;
        }
      } else if (distMouse < 220) {
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

  setInterval(updateElements, 4000);
  window.addEventListener('resize', init);
  window.addEventListener('scroll', updateElements); // Keep positions synchronized
  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX + (window.scrollX || window.pageXOffset);
    mouse.y = e.clientY + (window.scrollY || window.pageYOffset);
  });

  init();
  draw();
})();
