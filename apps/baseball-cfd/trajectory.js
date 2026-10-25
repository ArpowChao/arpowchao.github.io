/* Interactive trajectory comparison. Physics is supplied by worker.js;
 * this module only clips/interpolates and renders those JavaScript results. */
(function(root) {
  'use strict';
  const CASES=[['full','完整模型（旋轉＋縫線）','#e0313f'],['noSeam','有旋轉、無縫線效應','#0a84ff'],
    ['noSpin','無旋轉','#8e8e93'],['seamOnly','無旋轉、有縫線（不轉的球）','#ff9f0a']];
  function flightPoints(entry) {
    return entry.traj.filter(p=>p[1]>entry.plate[1]).map(p=>p.slice()).concat([entry.plate.slice()]);
  }
  function referenceAtY(reference,y,axis) {
    if(y>=reference[0][1]) return reference[0][axis];
    if(y<=reference.at(-1)[1]) return reference.at(-1)[axis];
    let low=0,high=reference.length-1;
    while(high-low>1) {const mid=(low+high)>>1;if(reference[mid][1]>=y)low=mid;else high=mid;}
    const w=(reference[low][1]-y)/(reference[low][1]-reference[high][1]);
    return reference[low][axis]*(1-w)+reference[high][axis]*w;
  }
  function displayPoints(points,reference,factor) {
    if(factor===1)return points.map(p=>p.slice());
    return points.map(p=>p.map((v,a)=>{if(a===1)return v;const b=referenceAtY(reference,p[1],a);return b+factor*(v-b);}));
  }
  class Viewer {
    constructor(dialog) {
      const T=root.THREE;
      this.T=T;this.dialog=dialog;this.host=dialog.querySelector('.traj-scene');
      this.scene=new T.Scene();this.dataGroup=new T.Group();this.scene.add(this.dataGroup);
      this.camera=new T.PerspectiveCamera(45,1,.01,500);this.target=new T.Vector3();
      this.renderer=new T.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
      this.canvas=this.renderer.domElement;this.canvas.tabIndex=0;
      this.canvas.setAttribute('aria-label','3D 球路。拖曳旋轉、滾輪縮放；方向鍵旋轉、加減鍵縮放、Home 重設。');
      this.host.append(this.canvas);
      this.preset='oblique';this.factor=1;this.comparison=null;this.paths={};this.markers=[];this.labels=[];this.visibility={};
      this.resolution=new T.Vector2(1,1);
      const dot=document.createElement('canvas');dot.width=dot.height=64;
      const dg=dot.getContext('2d');dg.fillStyle='#fff';dg.beginPath();dg.arc(32,32,27,0,Math.PI*2);dg.fill();
      this.dotTexture=new T.CanvasTexture(dot);
      const grid=[];
      for(let x=-3;x<=3;x++) grid.push([x,0,0],[x,18,0]);
      for(let y=0;y<=18;y++) grid.push([-3,y,0],[3,y,0]);
      this.grid=new T.LineSegments(new T.BufferGeometry().setFromPoints(grid.map(p=>this.toT(p))),new T.LineBasicMaterial({color:0xdce1e9}));
      this.scene.add(this.grid);
      const py=17/12*.3048,inch=.0254;
      const zone=[[-8.5,18],[8.5,18],[8.5,42],[-8.5,42],[-8.5,18]].map(([x,z])=>this.toT([x*inch,py,z*inch]));
      this.zone=new T.Line(new T.BufferGeometry().setFromPoints(zone),new T.LineBasicMaterial({color:0x6c7484}));
      this.scene.add(this.zone);
      for(const [pos,text] of [[[.27,py,1.15],'好球帶'],[[2.65,0,.05],'x 捕手右方'],[[-2.7,17,.05],'y 往投手丘'],[[0,0,2.5],'z 高度 (m)']]) this.addLabel(pos,text);
      const legend=dialog.querySelector('#trajLegend');
      for(const [key,label,color] of CASES) {
        const row=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');
        check.type='checkbox';check.checked=true;check.dataset.case=key;text.textContent=label;row.style.color=color;row.append(check,text);legend.append(row);
        check.addEventListener('change',()=>{this.visibility[key]=check.checked;this.setVisible(key,check.checked);this.draw();});
        this.visibility[key]=true;
      }
      dialog.querySelectorAll('[data-traj-view]').forEach(b=>b.addEventListener('click',()=>this.setCamera(b.dataset.trajView)));
      dialog.querySelector('#trajScale').addEventListener('change',e=>{this.factor=+e.target.value;this.rebuild();this.setCamera(this.preset);});
      this.bindInput();
      this.observer=new ResizeObserver(()=>{if(dialog.open){this.resize();this.draw();}});this.observer.observe(this.host);
      dialog.addEventListener('close',()=>{if(this.frame){cancelAnimationFrame(this.frame);this.frame=null;}});
      this.setTheme(document.documentElement.dataset.theme!=='dark');
    }
    toT(p) {return new this.T.Vector3(p[0],p[2],-p[1]);}
    addLabel(pos,text) {
      const sprite=new this.T.Sprite(new this.T.SpriteMaterial({transparent:true,depthTest:false}));
      sprite.position.copy(this.toT(pos));sprite.userData={text,pixels:14};sprite.renderOrder=10;
      this.labels.push(sprite);this.scene.add(sprite);
    }
    setTheme(light) {
      const T=this.T;this.light=light;this.scene.background=new T.Color(light?0xf9fafd:0x101319);
      this.grid.material.color.set(light?0xdce1e9:0x343c49);this.zone.material.color.set(light?0x6c7484:0xadb7ca);
      for(const sprite of this.labels) {
        const c=document.createElement('canvas');c.width=320;c.height=48;const g=c.getContext('2d');
        g.font='24px "Microsoft JhengHei",sans-serif';g.fillStyle=light?'#525e70':'#c4cedf';g.fillText(sprite.userData.text,6,33);
        if(sprite.material.map)sprite.material.map.dispose();sprite.material.map=new T.CanvasTexture(c);sprite.material.needsUpdate=true;
      }
      this.draw();
    }
    setPending() {this.dialog.querySelector('#trajStatus').textContent='參數已變更，正在重新計算；目前仍顯示上一組球路。';}
    setData(comparison) {
      const first=!this.comparison;this.comparison=comparison;this.rebuild();
      const names=['完整模型','無縫線效應','無旋轉','僅縫線'];
      this.dialog.querySelector('#trajTable').innerHTML='<thead><tr><th>軌跡</th><th>x</th><th>z</th></tr></thead><tbody>'+CASES.map(([key,,color],i)=>
        `<tr><td style="color:${color}">${names[i]}</td><td>${(comparison[key].plate[0]/.0254).toFixed(1)}</td><td>${(comparison[key].plate[2]/.0254).toFixed(1)}</td></tr>`).join('')+'</tbody>';
      this.dialog.querySelector('#trajStatus').textContent=`完整模型飛行時間：${comparison.full.time.toFixed(3)} s。座標單位為公尺；好球帶尺寸與 2D 圖一致。`;
      if(first)this.setCamera('oblique');else this.draw();
    }
    clearData() {
      for(const object of [...this.dataGroup.children]) {
        object.geometry?.dispose();object.material?.dispose();this.dataGroup.remove(object);
      }
      this.markers=[];
    }
    makeLine(points,key,color) {
      // Screen-space ribbon: consistently readable line width on WebGL/ANGLE,
      // where native line widths above one pixel are often unsupported.
      const T=this.T,starts=[],ends=[],corners=[],positions=[],distances=[],indices=[];
      let distance=0;
      for(let i=0;i<points.length-1;i++) {
        const a=this.toT(points[i]),b=this.toT(points[i+1]),length=a.distanceTo(b),base=i*4;
        for(const [along,side] of [[0,-1],[0,1],[1,-1],[1,1]]) {
          starts.push(...a.toArray());ends.push(...b.toArray());corners.push(along,side);
          positions.push(...(along?b:a).toArray());distances.push(distance+along*length);
        }
        indices.push(base,base+1,base+2,base+2,base+1,base+3);distance+=length;
      }
      const geometry=new T.BufferGeometry();
      for(const [name,array,size] of [['position',positions,3],['aStart',starts,3],['aEnd',ends,3],['aCorner',corners,2],['aDistance',distances,1]]) geometry.setAttribute(name,new T.Float32BufferAttribute(array,size));
      geometry.setIndex(indices);
      const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{uResolution:{value:this.resolution},uWidth:{value:key==='full'?3.2:2.1},uColor:{value:new T.Color(color)},uDashed:{value:key==='noSpin'?1:0}},
        vertexShader:`attribute vec3 aStart;attribute vec3 aEnd;attribute vec2 aCorner;attribute float aDistance;
          uniform vec2 uResolution;uniform float uWidth;varying float vSide;varying float vDistance;
          void main(){vec4 a=projectionMatrix*modelViewMatrix*vec4(aStart,1.);vec4 b=projectionMatrix*modelViewMatrix*vec4(aEnd,1.);
          vec2 delta=(b.xy/max(abs(b.w),.0001)-a.xy/max(abs(a.w),.0001))*uResolution;
          vec2 normal=vec2(-delta.y,delta.x)/max(length(delta),.0001);vec4 p=mix(a,b,aCorner.x);
          p.xy+=normal*uWidth/uResolution*aCorner.y*p.w;gl_Position=p;vSide=aCorner.y;vDistance=aDistance;}`,
        fragmentShader:`uniform vec3 uColor;uniform float uDashed;varying float vSide;varying float vDistance;
          void main(){if(uDashed>.5&&mod(vDistance,.24)>.14)discard;float alpha=1.-smoothstep(.65,1.,abs(vSide));gl_FragColor=vec4(uColor,alpha);}`});
      const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=key==='full'?3:2;return mesh;
    }
    rebuild() {
      if(!this.comparison)return;
      this.clearData();this.paths={};this.objects={};const reference=flightPoints(this.comparison.noSpin);
      for(const [key,,color] of CASES) {
        const points=displayPoints(flightPoints(this.comparison[key]),reference,this.factor);this.paths[key]=points;
        const line=this.makeLine(points,key,color);
        const marker=new this.T.Sprite(new this.T.SpriteMaterial({map:this.dotTexture,color,depthTest:false}));
        marker.position.copy(this.toT(points.at(-1)));marker.userData.pixels=9;marker.renderOrder=6;
        this.dataGroup.add(line,marker);this.markers.push(marker);this.objects[key]=[line,marker];this.setVisible(key,this.visibility[key]);
      }
      this.dialog.querySelector('#trajScaleNote').textContent=this.factor===1?'真實比例：三個座標軸使用相同的公尺尺度。':
        `顯示差異放大 ×${this.factor}：只放大相對無旋轉球路的 x／z 差異；表格與物理計算值不變。`;
      this.draw();
    }
    setVisible(key,on) {for(const object of this.objects?.[key]||[])object.visible=on;}
    setCamera(kind) {
      if(!this.comparison)return;
      this.preset=kind;let points=Object.values(this.paths).flat();
      if(kind==='plate')points=points.filter(p=>p[1]<this.comparison.full.plate[1]+2);
      const box=new this.T.Box3().setFromPoints(points.map(p=>this.toT(p))),size=box.getSize(new this.T.Vector3());box.getCenter(this.target);
      const angle=Math.atan(Math.tan(this.camera.fov*Math.PI/360)*Math.min(1,this.camera.aspect));
      const radius=Math.max(.75,size.length()/2),distance=radius/Math.sin(angle)*1.18;
      const [az,el]={oblique:[-35,20],pitcher:[90,3],catcher:[-90,3],side:[0,0],top:[-90,89.9],plate:[-60,18]}[kind];
      const a=az*Math.PI/180,e=el*Math.PI/180;
      this.camera.position.copy(this.target).add(this.toT([distance*Math.cos(e)*Math.cos(a),distance*Math.cos(e)*Math.sin(a),distance*Math.sin(e)]));
      this.camera.up.set(0,1,0);this.camera.lookAt(this.target);
      this.dialog.querySelectorAll('[data-traj-view]').forEach(b=>{b.classList.toggle('on',b.dataset.trajView===kind);b.setAttribute('aria-pressed',String(b.dataset.trajView===kind));});this.draw();
    }
    orbit(dx,dy) {
      const s=new this.T.Spherical().setFromVector3(this.camera.position.clone().sub(this.target));
      s.theta-=dx*.008;s.phi=Math.min(Math.PI-.02,Math.max(.02,s.phi-dy*.008));
      this.camera.position.copy(this.target).add(new this.T.Vector3().setFromSpherical(s));this.camera.lookAt(this.target);this.draw();
    }
    zoom(ratio) {
      const offset=this.camera.position.clone().sub(this.target);offset.setLength(Math.max(.35,Math.min(180,offset.length()*ratio)));
      this.camera.position.copy(this.target).add(offset);this.draw();
    }
    pan(dx,dy) {
      this.camera.updateMatrixWorld();const unit=2*this.camera.position.distanceTo(this.target)*Math.tan(this.camera.fov*Math.PI/360)/Math.max(1,this.host.clientHeight);
      const delta=new this.T.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0).multiplyScalar(-dx*unit)
        .addScaledVector(new this.T.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1),dy*unit);
      this.target.add(delta);this.camera.position.add(delta);this.draw();
    }
    bindInput() {
      const pointers=new Map();let previousPinch=null;
      const pinch=()=>{const [a,b]=[...pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
      this.canvas.addEventListener('pointerdown',e=>{e.preventDefault();this.canvas.focus();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.canvas.setPointerCapture(e.pointerId);if(pointers.size===2)previousPinch=pinch();});
      this.canvas.addEventListener('pointermove',e=>{
        const old=pointers.get(e.pointerId);if(!old)return;
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.size===2){const p=pinch();if(previousPinch){this.zoom(previousPinch.distance/Math.max(p.distance,1));this.pan(p.x-previousPinch.x,p.y-previousPinch.y);}previousPinch=p;}
        else if(pointers.size===1){if(e.ctrlKey||e.shiftKey||e.buttons===2||e.buttons===4)this.pan(e.clientX-old.x,e.clientY-old.y);else this.orbit(e.clientX-old.x,e.clientY-old.y);}
      });
      const release=e=>{pointers.delete(e.pointerId);previousPinch=null;};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(event,release);
      this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
      this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(Math.max(-200,Math.min(200,e.deltaY))*.0015));},{passive:false});
      this.canvas.addEventListener('keydown',e=>{const moves={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]};
        if(moves[e.key]){e.preventDefault();this.orbit(...moves[e.key]);}else if(['+','=','-','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')this.setCamera('oblique');else this.zoom(e.key==='-'?1.12:.89);}});
    }
    resize() {
      const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
      const ratio=Math.min(1,this.camera.aspect)/Math.min(1,w/h);
      if(Math.abs(ratio-1)>.00001)this.camera.position.sub(this.target).multiplyScalar(ratio).add(this.target);
      this.renderer.setSize(w,h);this.resolution.set(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    }
    draw() {
      if(!this.dialog.open||this.frame)return;
      this.frame=requestAnimationFrame(()=>{this.frame=null;this.resize();this.camera.updateMatrixWorld();
        for(const sprite of [...this.markers,...this.labels]){
          const p=sprite.position.clone().applyMatrix4(this.camera.matrixWorldInverse);
          const height=2*Math.max(.01,-p.z)*Math.tan(this.camera.fov*Math.PI/360)*sprite.userData.pixels/Math.max(1,this.host.clientHeight);
          sprite.scale.set(height*(sprite.userData.text?320/48:1),height,1);
          if(sprite.userData.text){
            const ndc=sprite.position.clone().project(this.camera),x=(ndc.x+1)*this.host.clientWidth/2,y=(1-ndc.y)*this.host.clientHeight/2;
            sprite.visible=ndc.z>-1&&ndc.z<1&&x>50&&x<this.host.clientWidth-50&&y>12&&y<this.host.clientHeight-12;
          }
        }
        this.renderer.render(this.scene,this.camera);
      });
    }
    open() {if(!this.dialog.open)this.dialog.showModal();this.resize();this.draw();this.canvas.focus();}
  }
  const api={Viewer,CASES,flightPoints,displayPoints};
  if(typeof module!=='undefined')module.exports=api;else root.BATrajectory=api;
})(typeof window!=='undefined'?window:globalThis);
