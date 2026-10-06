(function () {
  'use strict';
  const P = window.OrbitPhysics, R = P.RADIUS;
  const $ = id => document.getElementById(id);
  const canvas = $('space'), ctx = canvas.getContext('2d');
  const colors = ['#007f89', '#7454ba', '#a85b15', '#ba4872', '#507c36', '#416bb8'];
  const names = { circle: '圓軌道', ellipse: '橢圓軌道', parabola: '拋物線', hyperbola: '雙曲線', radial: '徑向運動' };
  const rates = [60, 600, 1800, 3600, 7200];
  const DRAG_PIXELS_PER_KM_S = 30;
  const bodies = [];
  let width = 0, height = 0, scale = 1, zoom = 1, paused = false, time = 0;
  let selected = null, serial = 0, drag = null, previousTime = null, lastReadings = 0;
  const stars = Array.from({ length: 100 }, (_, i) => ({
    x: ((i * 73.319 + 19.73) % 100) / 100,
    y: ((i * i * 17.173 + 43.57) % 100) / 100,
    size: i % 9 === 0 ? 1.2 : .65, alpha: .13 + (i % 4) * .09
  }));
  const formatter = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
  const point = s => ({ x: width / 2 + s.x * scale, y: height / 2 - s.y * scale });
  const world = p => ({ x: (p.x - width / 2) / scale, y: (height / 2 - p.y) / scale });
  function position(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function message(text) { $('message').textContent = text; }
  function duration(seconds) {
    if (!Number.isFinite(seconds)) return '無週期';
    return seconds < 3600 ? `${(seconds / 60).toFixed(1)} min` : `${(seconds / 3600).toFixed(2)} h`;
  }
  function clock(seconds) {
    const n = Math.floor(seconds), h = Math.floor(n / 3600);
    return `${String(h).padStart(2, '0')}:${String(Math.floor(n % 3600 / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  }
  function makePrediction(body) {
    const points = [{ ...body.initial }];
    const horizon = Math.min(body.elements.period, body.impactAt, 7 * 86400);
    let t = 0, s = body.initial;
    // Sample more densely near the primary. These points are not the integrator.
    for (let k = 0; k < 2000 && t < horizon; k++) {
      const localTime = Math.sqrt(Math.hypot(s.x, s.y) ** 3 / body.mu);
      t = Math.min(horizon, t + Math.max(.05, localTime * .035));
      s = P.propagate(body.initial, t, body.mu);
      points.push(s);
    }
    return points;
  }
  function addBody(initial, color) {
    if (bodies.length >= 24) { message('已建立 24 顆星體。先移除一顆或清空星空，再繼續實驗。'); return; }
    const body = P.createBody(initial);
    const style = launchStyle();
    body.id = ++serial; body.color = color || style.color;
    body.markerRadius = style.radius;
    body.trail = [{ ...initial }]; body.prediction = makePrediction(body);
    bodies.push(body); selected = body.id;
    refreshSelect(); refreshReadings();
    $('empty-hint').hidden = true;
    message(`已建立星體 ${body.id}：${names[body.elements.kind]}，初速 ${body.elements.v.toFixed(2)} km/s。`);
    return body;
  }
  function launchStyle() {
    const chosenColor = $('body-color-choice').value;
    return { color: chosenColor === 'auto' ? colors[serial % colors.length] : chosenColor,
      radius: Number($('body-size').value) };
  }
  function trimTrail(body) {
    const limit = Number($('trail-length').value);
    if (body.trail.length > limit) body.trail.splice(0, body.trail.length - limit);
  }
  function refreshSelect() {
    $('body-select').replaceChildren();
    if (!bodies.length) {
      $('body-select').add(new Option('建立星體後開始觀測', ''));
      $('body-select').disabled = true;
    } else {
      for (const b of bodies) $('body-select').add(new Option(`星體 ${b.id} · ${names[b.elements.kind]}`, String(b.id)));
      $('body-select').disabled = false; $('body-select').value = String(selected);
    }
    $('body-count').textContent = `${bodies.length} 顆`;
    $('body-details').hidden = !bodies.length;
    $('observation-empty').hidden = !!bodies.length;
    $('empty-hint').hidden = !!bodies.length || !!drag;
  }
  function refreshReadings() {
    $('clock').textContent = `模擬時間 ${clock(time)}`;
    const b = bodies.find(b => b.id === selected);
    if (!b) return;
    const e = b.elements, s = b.state;
    $('body-color').style.background = b.color;
    $('body-kind').textContent = names[e.kind];
    const p = point(s), outside = p.x < 0 || p.x > width || p.y < 0 || p.y > height;
    $('body-status').textContent = b.status === 'impact' ? '已撞擊' : outside ? '視野外' : paused ? '已暫停' : '運動中';
    $('read-radius').textContent = `${formatter.format(Math.hypot(s.x, s.y))} km`;
    $('read-speed').textContent = `${Math.hypot(s.vx, s.vy).toFixed(3)} km/s`;
    const closedOrbit = e.kind === 'circle' || e.kind === 'ellipse';
    $('read-periapsis').textContent = `${formatter.format(e.periapsis)} km${e.periapsis < R ? '（球內）' : ''}`;
    $('read-apoapsis').textContent = Number.isFinite(e.apoapsis) ? `${formatter.format(e.apoapsis)} km` : '無遠點';
    $('read-semimajor').textContent = closedOrbit ? `${formatter.format(e.a)} km` : '不適用';
    $('read-semimajor-earth').textContent = closedOrbit ? `${(e.a / R).toFixed(3)} R⊕` : '無封閉繞行軌道';
    $('radius-definition').textContent = closedOrbit ?
      `a =（最近距離＋最遠距離）÷ 2。距離都從中央球心量起。${Number.isFinite(b.impactAt) ? '此軌道會撞擊，這裡顯示理論值。' : ''}` :
      '徑向或逃逸運動沒有封閉繞行軌道，不顯示平均軌道半徑。';
    $('read-eccentricity').textContent = e.e.toFixed(4);
    $('read-period').textContent = e.kind === 'radial' || Number.isFinite(b.impactAt) ? '撞擊前不完成繞行' : duration(e.period);
    $('read-energy').textContent = `${e.energy.toFixed(3)} km²/s²`;
    const explanations = {
      circle: '切線初速剛好等於圓軌道速度，距離與速率保持不變。',
      ellipse: '繞行時與地球的距離會改變。靠近時加速，遠離時減速。',
      parabola: '初速剛好等於起點的逃逸速度，向外離去時速度趨近零。',
      hyperbola: '初速很大。若避開球面，就能持續向遠處飛去。',
      radial: '沒有向側面移動的初速，只沿著球心與起點的連線運動。'
    };
    $('orbit-explanation').textContent = b.status === 'impact' ? '星體已接觸地球表面，停止演算。已走過的軌跡仍保留。' :
      Number.isFinite(b.impactAt) ? `${explanations[e.kind]} 這條軌跡會與地球表面相交。` : explanations[e.kind];
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Wider initial field of view makes Earth 30% smaller while preserving
    // the common physical scale of the sphere, launch positions and orbits.
    scale = Math.min(width, height) / (R * 20) * zoom;
    cancelDrag(); draw();
  }
  function arrow(a, b, color, dashed = false) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 2) return;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.4;
    ctx.setLineDash(dashed ? [4, 4] : []);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    const tip = Math.min(7, length * .3);
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - tip * Math.cos(angle - .45), b.y - tip * Math.sin(angle - .45));
    ctx.lineTo(b.x - tip * Math.cos(angle + .45), b.y - tip * Math.sin(angle + .45));ctx.closePath();ctx.fill();
  }
  function path(points, color, dashed, opacity, thickness = 1) {
    ctx.strokeStyle = color; ctx.globalAlpha = opacity; ctx.lineWidth = thickness;
    ctx.setLineDash(dashed ? [3, 6] : []); ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = point(points[i]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function planet() {
    const x = width / 2, y = height / 2, r = R * scale;
    const halo = ctx.createRadialGradient(x, y, r * .8, x, y, r * 1.8);
    halo.addColorStop(0, '#81cdda25'); halo.addColorStop(1, '#81cdda00');
    ctx.fillStyle = halo; ctx.beginPath();ctx.arc(x, y, r * 1.8, 0, 2 * Math.PI);ctx.fill();
    const sphere = ctx.createRadialGradient(x - r * .4, y - r * .4, r * .1, x + r * .2, y + r * .1, r * 1.2);
    sphere.addColorStop(0, '#b8e3ea');sphere.addColorStop(.5, '#609bb6');sphere.addColorStop(1, '#233759');
    ctx.fillStyle = sphere;ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fill();
    ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.clip();
    ctx.strokeStyle='#d6ecf236';ctx.lineWidth=.7;
    for (const f of [-.55,0,.55]) {
      ctx.beginPath();ctx.ellipse(x,y+f*r,r*Math.sqrt(1-f*f),r*.13,0,0,2*Math.PI);ctx.stroke();
      ctx.beginPath();ctx.ellipse(x,y,r*.45,r,Math.PI*f*.4,0,2*Math.PI);ctx.stroke();
    }
    ctx.restore();ctx.strokeStyle='#b8e3ea80';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
    ctx.textAlign='center';ctx.font='10px "Segoe UI", sans-serif';ctx.fillStyle='#61758a';ctx.fillText('EARTH',x,y+r+20);
  }
  function measurementGrid() {
    const minSpacing = Math.min(30, Math.min(width, height) * .08);
    const units = [.25, .5, 1, 2, 5, 10, 20, 50, 100].find(n => n * R * scale >= minSpacing) || 100;
    const spacing = units * R * scale, cx = width / 2, cy = height / 2;
    const caption = `每格 ${units} R⊕ = ${formatter.format(units * R)} km`;
    if ($('grid-scale').textContent !== caption) $('grid-scale').textContent = caption;
    ctx.save();
    // Keep the ruler clear of the scene header and bottom controls.
    ctx.beginPath();ctx.rect(0, 58, width, height - 130);ctx.clip();
    ctx.strokeStyle = '#d7e1e9';ctx.lineWidth = .7;ctx.beginPath();
    const nx = Math.ceil(cx / spacing), ny = Math.ceil(cy / spacing);
    for (let n = -nx; n <= nx; n++) {
      const x = cx + n * spacing;ctx.moveTo(x, 58);ctx.lineTo(x, height - 72);
    }
    for (let n = -ny; n <= ny; n++) {
      const y = cy + n * spacing;ctx.moveTo(0, y);ctx.lineTo(width, y);
    }
    ctx.stroke();ctx.strokeStyle = '#9fb3c2';ctx.lineWidth = 1;ctx.beginPath();
    ctx.moveTo(0, cy);ctx.lineTo(width, cy);ctx.moveTo(cx, 58);ctx.lineTo(cx, height - 72);ctx.stroke();
    ctx.fillStyle = '#61758a';ctx.font = '9px Consolas, monospace';ctx.textAlign = 'center';
    for (let n = -nx; n <= nx; n++) {
      const x = cx + n * spacing;
      if (n !== 0 && x > 16 && x < width - 16 && Math.abs(n * units) > 1.15) ctx.fillText(String(n * units), x, cy + 13);
    }
    ctx.textAlign = 'left';
    for (let n = -ny; n <= ny; n++) {
      const y = cy - n * spacing;
      if (n !== 0 && y > 72 && y < height - 84 && Math.abs(n * units) > 1.15) ctx.fillText(String(n * units), cx + 6, y + 3);
    }
    ctx.fillText('x / R⊕', width - 52, cy - 9);ctx.fillText('y / R⊕', cx + 7, 74);
    ctx.restore();
  }
  function draw() {
    ctx.clearRect(0,0,width,height);
    for (const s of stars) {
      ctx.fillStyle=`rgba(88,120,154,${s.alpha*.7})`;ctx.beginPath();ctx.arc(s.x*width,s.y*height,s.size,0,Math.PI*2);ctx.fill();
    }
    if ($('measurement-grid').checked) measurementGrid();
    else {
      ctx.strokeStyle='#7a9db522';ctx.lineWidth=1;
      for (const ratio of [2,4,6]) {
        ctx.beginPath();ctx.arc(width/2,height/2,R*ratio*scale,0,2*Math.PI);ctx.stroke();
      }
      ctx.font='9px Consolas, monospace';ctx.fillStyle='#61758a';ctx.textAlign='left';
      if (4*R*scale<width/2-20) ctx.fillText('4 R⊕',width/2+4*R*scale+5,height/2+3);
    }
    if ($('prediction').checked) for (const b of bodies) path(b.prediction,b.color,true,b.id===selected?.65:.4);
    for (const b of bodies) path(b.trail,b.color,false,b.id===selected?.95:.7,1.5);
    if ($('prediction').checked && drag?.prediction) path(drag.prediction,'#2b4259',true,.65,1.2);
    planet();
    for (const b of bodies) {
      const s=b.state, p=point(s), outside=p.x<12||p.x>width-12||p.y<55||p.y>height-55;
      if(outside){
        // An edge marker keeps escaped bodies selectable without cutting gravity off.
        const dx=p.x-width/2,dy=p.y-height/2;
        const k=Math.min((width/2-18)/Math.max(Math.abs(dx),1),(height/2-65)/Math.max(Math.abs(dy),1));
        const edge={x:width/2+dx*k,y:height/2+dy*k};
        arrow({x:edge.x-dx/Math.hypot(dx,dy)*10,y:edge.y-dy/Math.hypot(dx,dy)*10},edge,b.color);
        ctx.fillStyle=b.color;ctx.font='10px Consolas, monospace';ctx.textAlign='center';ctx.fillText(String(b.id),edge.x,edge.y+17);
        continue;
      }
      if ($('vectors').checked && b.status==='active') {
        arrow(p,{x:p.x+s.vx*7,y:p.y-s.vy*7},b.color);
        const r=Math.hypot(s.x,s.y),a=P.MU/r**2;
        arrow(p,{x:p.x-s.x/r*a*5000,y:p.y+s.y/r*a*5000},'#a85b15',true);
      }
      if(b.id===selected){ctx.strokeStyle=b.color;ctx.globalAlpha=.35;ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,b.markerRadius+6,0,2*Math.PI);ctx.stroke();ctx.globalAlpha=1;}
      ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(p.x,p.y,b.status==='impact'?Math.min(2.5,b.markerRadius):b.markerRadius,0,2*Math.PI);ctx.fill();
      ctx.fillStyle=b.color;ctx.font='10px Consolas, monospace';ctx.textAlign='left';ctx.fillText(String(b.id),p.x+b.markerRadius+8,p.y-9);
    }
    if(drag){
      const start=point(drag.start),end={x:start.x+drag.vx*DRAG_PIXELS_PER_KM_S,y:start.y-drag.vy*DRAG_PIXELS_PER_KM_S};
      ctx.strokeStyle='#61758a55';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(width/2,height/2);ctx.lineTo(start.x,start.y);ctx.stroke();ctx.setLineDash([]);
      const style=launchStyle();
      ctx.fillStyle=style.color;ctx.beginPath();ctx.arc(start.x,start.y,style.radius,0,Math.PI*2);ctx.fill();
      arrow(start,end,'#20364a');
    }
  }
  function updateDrag() {
    if(!drag)return;
    const initial={...drag.start,vx:drag.vx,vy:drag.vy};
    const body=P.createBody(initial),e=body.elements;
    drag.prediction=makePrediction(body);
    $('launch-preview').hidden=false;
    $('preview-kind').textContent=Number.isFinite(body.impactAt)?`${names[e.kind]} · 將撞擊`:names[e.kind];
    $('preview-speed').innerHTML=`${e.v.toFixed(2)} <small>km/s</small>`;
    $('preview-reference').textContent=`此處 v圓 ${e.circularSpeed.toFixed(2)} · v逃 ${e.escapeSpeed.toFixed(2)} km/s`;
    $('empty-hint').hidden=true;draw();
  }
  function cancelDrag() {
    if(drag?.pointerId!=null&&canvas.hasPointerCapture(drag.pointerId))canvas.releasePointerCapture(drag.pointerId);
    drag=null;$('launch-preview').hidden=true;$('empty-hint').hidden=!!bodies.length;
  }
  function launch() {
    if(!drag)return;
    const initial={...drag.start,vx:drag.vx,vy:drag.vy};
    cancelDrag();addBody(initial);draw();
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||drag)return;
    const start=world(position(event));
    if(Math.hypot(start.x,start.y)<=R){message('請在地球表面以外選擇起點。');return;}
    event.preventDefault();canvas.focus({preventScroll:true});
    drag={start,vx:0,vy:0,pointerId:event.pointerId};canvas.setPointerCapture(event.pointerId);updateDrag();
  });
  function dragTo(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    const p=position(event),start=point(drag.start);
    // A CSS-pixel arrow length sets speed, independent of viewport zoom.
    drag.vx=(p.x-start.x)/DRAG_PIXELS_PER_KM_S;
    drag.vy=-(p.y-start.y)/DRAG_PIXELS_PER_KM_S;updateDrag();
  }
  canvas.addEventListener('pointermove',dragTo);
  canvas.addEventListener('pointerup',event=>{if(drag?.pointerId===event.pointerId){dragTo(event);launch();}});
  canvas.addEventListener('pointercancel',()=>{cancelDrag();draw();});
  canvas.addEventListener('lostpointercapture',()=>{if(drag?.pointerId!=null){cancelDrag();draw();}});
  canvas.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();cancelDrag();draw();return;}
    if(event.key==='Enter'){event.preventDefault();if(drag)launch();else{drag={start:{x:3.4*R,y:0},vx:0,vy:0};updateDrag();message('方向鍵調整起點，Shift＋方向鍵給速度，Enter 發射。');}return;}
    const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};
    const move=moves[event.key];if(!move)return;event.preventDefault();
    if(!drag)drag={start:{x:3.4*R,y:0},vx:0,vy:0};
    if(event.shiftKey){drag.vx+=move[0]*.25;drag.vy+=move[1]*.25;}
    else{const next={x:drag.start.x+move[0]*R*.15,y:drag.start.y+move[1]*R*.15};if(Math.hypot(next.x,next.y)>R)drag.start=next;}
    updateDrag();
  });
  $('pause').addEventListener('click',()=>{
    paused=!paused;$('pause').textContent=paused?'▶ 繼續':'Ⅱ 暫停';$('run-state').textContent=paused?'已暫停':'運行中';
    previousTime=null;refreshReadings();draw();message(paused?'已暫停。可以在同一畫面建立星體，再一起開始運動。':'已繼續演算。');
  });
  $('clear').addEventListener('click',()=>{cancelDrag();bodies.length=0;selected=null;time=0;refreshSelect();refreshReadings();draw();message('星空已清空，試試新的起點與方向。');});
  $('clear-trails').addEventListener('click',()=>{
    for(const b of bodies)b.trail=[{...b.state}];
    draw();message('已清除走過的軌跡。星體會從目前位置留下新軌跡。');
  });
  $('trail-length').addEventListener('change',()=>{for(const b of bodies)trimTrail(b);draw();});
  for(const id of ['body-size','body-color-choice'])$(id).addEventListener('change',draw);
  $('body-select').addEventListener('change',()=>{selected=Number($('body-select').value);refreshReadings();draw();});
  $('remove-body').addEventListener('click',()=>{const index=bodies.findIndex(b=>b.id===selected);if(index<0)return;bodies.splice(index,1);selected=bodies.at(-1)?.id??null;refreshSelect();refreshReadings();draw();message('已移除觀測星體。');});
  $('time-rate').addEventListener('input',()=>{$('rate-output').textContent=`${rates[Number($('time-rate').value)]}×`;});
  for(const id of ['prediction','vectors'])$(id).addEventListener('change',draw);
  $('measurement-grid').addEventListener('change',()=>{$('grid-scale').hidden=!$('measurement-grid').checked;draw();});
  for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{
    cancelDrag();const kind=button.dataset.preset,r=3.4*R,vc=Math.sqrt(P.MU/r);
    const ratios={circle:1,ellipse:.8,parabola:Math.SQRT2,hyperbola:1.6};
    const color={circle:colors[0],ellipse:colors[1],parabola:colors[2],hyperbola:colors[3]};
    addBody({x:r,y:0,vx:0,vy:vc*ratios[kind]},color[kind]);draw();
  });
  function changeZoom(next){zoom=Math.max(.125,Math.min(4,next));$('zoom-reset').textContent=`${zoom.toFixed(zoom<1?2:1).replace(/\.0$/,'')}×`;resize();refreshReadings();}
  $('zoom-in').addEventListener('click',()=>changeZoom(zoom*1.4));$('zoom-out').addEventListener('click',()=>changeZoom(zoom/1.4));$('zoom-reset').addEventListener('click',()=>changeZoom(1));
  document.addEventListener('visibilitychange',()=>{previousTime=null;});
  window.addEventListener('blur',()=>{cancelDrag();previousTime=null;});
  new ResizeObserver(resize).observe(canvas);
  function tick(now){
    if(previousTime!==null&&!paused&&!document.hidden){
      const dt=Math.min((now-previousTime)/1000,.05)*rates[Number($('time-rate').value)];
      if(dt>0){time+=dt;
        for(const b of bodies){
          if(b.status!=='active')continue;
          let left=dt;
          while(left>1e-6&&b.status==='active'){
            const localTime=Math.sqrt(Math.hypot(b.state.x,b.state.y)**3/b.mu);
            const step=Math.min(left,Math.max(1,localTime*.035));
            P.advance(b,step);b.trail.push({...b.state});left-=step;
          }
          trimTrail(b);
        }
      }
    }
    previousTime=now;
    if(!paused||drag)draw();
    if(now-lastReadings>120){refreshReadings();lastReadings=now;}
    requestAnimationFrame(tick);
  }
  resize();refreshSelect();requestAnimationFrame(tick);
})();
