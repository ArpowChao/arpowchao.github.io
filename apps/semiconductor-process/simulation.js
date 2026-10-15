import * as THREE from 'three';
import { OrbitControls } from './lib/OrbitControls.js';
import { STEPS, SECTIONS, WINDOWS, OXIDE, RESIST, SAW, cutPieces, clamp, stateAt, resistHeight, etchedOxideHeight, inOpening, ionStop } from './process-model.mjs';

const $=id=>document.getElementById(id);
const colors={si:'#536b86',oxide:'#22b9de',resist:'#a96bdd',exposed:'#f4b45d',copper:'#e9a060',dielectric:'#78aaba',dopant:'#e394ed'};
let renderer,scene,camera,controls,group,model,current=0,time=0,playing=false,last=performance.now(),ready=false;
let labels=[],activePhase=-1,viewMode='3d';
const depth=1.8;

function material(color,options={}) {return new THREE.MeshStandardMaterial({color,roughness:.64,metalness:.08,...options});}
function mesh(parent,geometry,surface,position=[0,0,0]) {const item=new THREE.Mesh(geometry,surface);item.position.set(...position);parent.add(item);return item;}
function block(parent,color,options={}) {return mesh(parent,new THREE.BoxGeometry(1,1,1),typeof color==='string'?material(color,options):color);}
function sizeBox(item,left,right,bottom,top,front=0,d=depth) {
  item.visible=top-bottom>.0005&&right-left>.0005;
  item.position.set((left+right)/2,(bottom+top)/2,front-d/2);
  item.scale.set(Math.max(.0001,right-left),Math.max(.0001,top-bottom),d);
}
function cylinder(parent,r,h,color,position=[0,0,0],segments=64) {return mesh(parent,new THREE.CylinderGeometry(r,r,h,segments),typeof color==='string'?material(color):color,position);}
function ring(parent,r,t,color,y=0) {const item=mesh(parent,new THREE.TorusGeometry(r,t,10,80),typeof color==='string'?material(color):color,[0,y,0]);item.rotation.x=Math.PI/2;return item;}
function ball(parent,r,color) {return mesh(parent,new THREE.SphereGeometry(r,12,8),typeof color==='string'?new THREE.MeshBasicMaterial({color}):color);}
function tag(text,point,color='#b9e9ed',visible=()=>true) {
  const element=document.createElement('span');element.className='model-tag';element.textContent=text;element.style.setProperty('--tag-color',color);$('scene-labels').append(element);
  const item={element,point:typeof point==='function'?point:()=>point,visible};labels.push(item);return item;
}
function line(parent,points,color,dashed=false) {
  const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));
  const surface=dashed?new THREE.LineDashedMaterial({color,dashSize:.10,gapSize:.07,transparent:true,opacity:.8}):new THREE.LineBasicMaterial({color});
  const item=new THREE.Line(geometry,surface);if(dashed)item.computeLineDistances();parent.add(item);return item;
}
function sectionBase(parent) {
  const si=block(parent,colors.si);sizeBox(si,-2.8,2.8,-1.14,OXIDE.bottom);
  const support=block(parent,'#152c41');sizeBox(support,-3,3,-1.28,-1.15,0,depth+.1);
  tag('矽 Si',[-2.25,-.72,.04],colors.si);
  return si;
}
function sectionLayers(parent,color,bottom,height) {
  return SECTIONS.map(section=>{
    const item=block(parent,color);sizeBox(item,section.left,section.right,bottom,bottom+height);
    return {item,...section};
  });
}
function fullOxide(parent) {const item=block(parent,colors.oxide);sizeBox(item,-2.8,2.8,OXIDE.bottom,OXIDE.top);return item;}
function oxideMask(parent) {
  const result=sectionLayers(parent,colors.oxide,OXIDE.bottom,OXIDE.thickness);
  result.forEach(({item,open})=>{item.visible=!open;});return result;
}
function dopantDots(parent,count=70) {
  const result=[];
  WINDOWS.forEach(([left,right],region)=>{
    for(let i=0;i<count;i++) {
      const u=((i*.61803398875)%1),v=((i*.41421356237)%1);
      const x=left+.08+(right-left-.16)*u;
      const y=-.22-.38*v;
      const dot=ball(parent,.022,colors.dopant);dot.position.set(x,y,.025);
      result.push({dot,rank:(i+.5)/count,region});
    }
  });return result;
}

function buildCrystal(parent) {
  mesh(parent,new THREE.CylinderGeometry(2.1,2.1,.7,64,1,true),material('#26333f',{metalness:.5,side:THREE.DoubleSide}),[0,-.33,0]);
  cylinder(parent,2.1,.07,material('#26333f',{metalness:.5}),[0,-.66,0]);
  ring(parent,2.02,.10,'#7d91a0',.03);
  const melt=cylinder(parent,1.93,.055,material('#ffb44e',{emissive:'#e96212',emissiveIntensity:.8}),[0,.05,0]);
  const meltRing=ring(parent,1.7,.012,new THREE.MeshBasicMaterial({color:'#ffd58a'}),.085);
  const crystal=new THREE.Group();parent.add(crystal);
  const surface=material('#a7bac9',{metalness:.4,roughness:.4});
  const body=cylinder(crystal,.62,1,surface);
  for(const angle of [0,Math.PI]) line(body,[[.624*Math.cos(angle),-.49,.624*Math.sin(angle)],[.624*Math.cos(angle),.49,.624*Math.sin(angle)]],'#28d6df');
  const shoulder=mesh(crystal,new THREE.CylinderGeometry(.11,.62,1,64),surface);
  const neck=cylinder(crystal,.11,.26,surface);
  const rod=cylinder(crystal,.075,.8,material('#d5e1e9',{metalness:.7}));
  const pull=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(1.05,.6,0),1.3,'#68e2dc',.18,.12);parent.add(pull);
  let s,lastShoulder=-1;
  tag('矽熔液',[1.25,.13,1.0],'#ffbc66');
  tag('單晶生長界面',()=>[.7,s?.meltY??.05,.25]);
  tag('旋轉 ↻　向上拉 ↑',()=>[0,(s?.top??1)+.85,0]);
  return {update(state){
    const h=2.05*state.growth,meltY=.05-.12*state.growth;
    const shoulderProgress=clamp(state.growth/.15),shoulderH=.32*shoulderProgress,bottomRadius=.11+.51*shoulderProgress;
    melt.position.y=meltY;meltRing.position.y=meltY+.03;crystal.position.y=meltY+.015;crystal.rotation.y=state.angle;
    body.visible=h>.001;body.scale.set(bottomRadius/.62,Math.max(.001,h),bottomRadius/.62);body.position.y=h/2;
    const quantized=Math.round(shoulderProgress*100);
    if(quantized!==lastShoulder){shoulder.geometry.dispose();shoulder.geometry=new THREE.CylinderGeometry(.11,bottomRadius,1,64);lastShoulder=quantized;}
    shoulder.visible=shoulderH>.001;shoulder.scale.y=Math.max(.001,shoulderH);shoulder.position.y=h+shoulderH/2;
    neck.position.y=h+shoulderH+.13;rod.position.y=h+shoulderH+.66;
    pull.position.y=meltY+.35;pull.setLength(.6+state.growth*.8,.16,.1);
    s={meltY,top:meltY+h};
  }};
}

// Cross-section of the kerf still containing silicon below the moving wire.
function kerfGeometry(cutY,r=.72,width=.038) {
  let polygon=Array.from({length:96},(_,i)=>{const a=i/96*Math.PI*2;return [r*Math.cos(a),r*Math.sin(a)];});
  const clipped=[];
  polygon.forEach((b,i)=>{
    const a=polygon[(i+polygon.length-1)%polygon.length],insideA=a[1]<=cutY,insideB=b[1]<=cutY;
    if(insideA!==insideB){const q=(cutY-a[1])/(b[1]-a[1]);clipped.push([a[0]+q*(b[0]-a[0]),cutY]);}
    if(insideB)clipped.push(b);
  });
  if(clipped.length<3)return null;
  const shape=new THREE.Shape();shape.moveTo(...clipped[0]);clipped.slice(1).forEach(p=>shape.lineTo(...p));shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,curveSegments:24});
}
function buildSlicing(parent) {
  const base=block(parent,'#173046');sizeBox(base,-3.05,3.05,-.86,-.72,1.25,2.5);
  const cutXs=SAW.cuts,r=SAW.radius,centerY=.14,kerf=SAW.kerf;
  const surface=material('#a7bac9',{metalness:.3,roughness:.45});
  const intact=cylinder(parent,r,SAW.right-SAW.left,surface,[0,centerY,0]);intact.rotation.z=Math.PI/2;
  const pieces=[];
  for(const {left,right} of cutPieces()) {
    const item=cylinder(parent,r,right-left,surface,[(left+right)/2,centerY,0]);item.rotation.z=Math.PI/2;
    pieces.push({item,x:(left+right)/2});
  }
  const cutFill=cutXs.map(x=>{const item=mesh(parent,kerfGeometry(r,r,kerf),surface,[x-kerf/2,centerY,0]);item.rotation.y=Math.PI/2;item.userData.hasGeometry=true;return item;});
  const frame=new THREE.Group();parent.add(frame);
  const wires=cutXs.map(x=>{const item=cylinder(frame,.014,3.1,new THREE.MeshBasicMaterial({color:'#ffd493'}),[x,0,0],10);item.rotation.x=Math.PI/2;return item;});
  for(const z of [-1.58,1.58]) {const bar=block(frame,'#60859b');sizeBox(bar,-2.1,2.1,-.06,.06,z+.08,.16);}
  const beads=cutXs.map((x,i)=>{const item=ball(frame,.035,'#fff3cf');item.position.x=x;return {item,i};});
  let lastCut=-1,currentY=1.1,separation=0;
  tag('金剛石線鋸',()=>[2.1,currentY,.3],'#ffd493',()=>separation<.98);
  tag('切穿後才分離',[0,-.62,.86]);
  return {update(state,t){
    separation=state.separation;
    const cutY=r+.12-(r*2+.24)*state.cut;currentY=centerY+cutY;frame.position.y=currentY;
    beads.forEach(({item,i})=>{item.position.z=Math.sin(t*5+i)*1.4;});
    const quantized=Math.round(state.cut*250);
    if(quantized!==lastCut){
      cutFill.forEach(item=>{item.geometry?.dispose();const geometry=kerfGeometry(cutY,r,kerf);item.userData.hasGeometry=!!geometry;if(geometry)item.geometry=geometry;});lastCut=quantized;
    }
    cutFill.forEach(item=>item.visible=state.cut>0&&item.userData.hasGeometry);
    intact.visible=state.cut===0;
    pieces.forEach(({item,x},i)=>{item.visible=state.cut>0;item.position.x=x+(i-(pieces.length-1)/2)*.10*state.separation;});
    frame.visible=state.separation<.98;
  }};
}

function buildOxidation(parent) {
  const si=sectionBase(parent),oxide=block(parent,colors.oxide);let state;
  line(parent,[[-2.9,0,.025],[2.9,0,.025]],'#eec88a',true);
  const supply=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(0,1.45,-.8),.85,'#91dbe5',.16,.11);parent.add(supply);
  tag('O₂ ＋ 高溫',[0,1.55,-.7],'#ffb267');
  tag('氧化前表面',[2.1,0,.07],'#eec88a');
  tag('SiO₂',()=>[-2.15,(state?.oxideBottom+state?.oxideTop)/2||0,.035],colors.oxide,()=>state?.growth>.08);
  return {update(s){state=s;sizeBox(si,-2.8,2.8,-1.14,s.siliconTop);sizeBox(oxide,-2.8,2.8,s.oxideBottom,s.oxideTop);supply.visible=s.growth<.99;}};
}

function buildLithography(parent) {
  sectionBase(parent);fullOxide(parent);
  const resist=sectionLayers(parent,colors.resist,RESIST.bottom,RESIST.thickness);
  const optics=new THREE.Group();parent.add(optics);
  const quartz=block(optics,material('#a5e9f2',{transparent:true,opacity:.12,depthWrite:false}));sizeBox(quartz,-2.95,2.95,1.66,1.72,.05,depth+.1);
  SECTIONS.filter(s=>!s.open).forEach(s=>{const item=block(optics,'#253346');sizeBox(item,s.left,s.right,1.62,1.67,.05,depth+.1);});
  const source=block(optics,material('#bdabf3',{emissive:'#8563cb',emissiveIntensity:.4}));sizeBox(source,-3,3,2.48,2.60,.05,depth+.1);
  const lightMaterial=new THREE.MeshBasicMaterial({color:'#ba9cff',transparent:true,opacity:.15,depthWrite:false});
  const incoming=block(optics,lightMaterial);sizeBox(incoming,-2.8,2.8,1.73,2.47);
  const beams=WINDOWS.map(([l,r])=>{const item=block(optics,lightMaterial);sizeBox(item,l,r,RESIST.bottom+RESIST.thickness,1.62);return item;});
  const developer=new THREE.Group();parent.add(developer);
  const nozzle=block(developer,'#7a9db0');sizeBox(nozzle,-3,3,.92,1.03,-.66,.48);
  const liquid=block(developer,new THREE.MeshBasicMaterial({color:'#66d9eb',transparent:true,opacity:.17,depthWrite:false}));sizeBox(liquid,-2.88,2.88,.51,.56,.05,depth+.1);
  for(const x of [-2.2,-.6,.6,2.2]){const flow=block(developer,new THREE.MeshBasicMaterial({color:'#73e4f2',transparent:true,opacity:.36,depthWrite:false}));sizeBox(flow,x-.025,x+.025,.55,.92,-.78,.10);}
  let state;
  tag('SiO₂',[-2.2,.015,.04],colors.oxide);
  tag('保留的光阻',()=>[-2.24,.18+.15*(state?.coat||0),.04],colors.resist,()=>state?.coat>.5);
  tag('光罩：深色區遮光',()=>[0,1.85+2.6*(state?.retract||0),-.7],'#bfcad9',()=>state?.retract<.9);
  tag('橙色：已曝光、厚度不變',[1.4,.64,.08],colors.exposed,()=>state?.exposure>0&&state?.retract<.5);
  tag('顯影液',[0,1.18,-.7],'#73e4f2',()=>state?.p>=.65&&state?.p<.99);
  return {update(s){
    state=s;
    resist.forEach(({item,left,right,open})=>{
      sizeBox(item,left,right,RESIST.bottom,RESIST.bottom+resistHeight(s,open));
      item.material.color.set(colors.resist);
      if(open)item.material.color.lerp(new THREE.Color(colors.exposed),s.exposure);
    });
    optics.position.y=s.retract*2.6;optics.visible=s.retract<.99;
    incoming.visible=s.light;beams.forEach(item=>item.visible=s.light);
    developer.visible=s.p>=.65&&s.p<.99;
  }};
}

function buildEtching(parent) {
  sectionBase(parent);
  const oxide=sectionLayers(parent,colors.oxide,OXIDE.bottom,OXIDE.thickness);
  const resist=sectionLayers(parent,colors.resist,RESIST.bottom,RESIST.thickness);resist.filter(s=>s.open).forEach(s=>s.item.visible=false);
  const chamber=new THREE.Group();parent.add(chamber);
  const electrode=block(chamber,'#446278');sizeBox(electrode,-3,3,1.6,1.73,.08,depth+.16);
  const plasma=block(chamber,new THREE.MeshBasicMaterial({color:'#81bee8',transparent:true,opacity:.08,depthWrite:false}));sizeBox(plasma,-2.95,2.95,.80,1.57,.03,depth+.06);
  const arrows=Array.from({length:9},(_,i)=>{const x=-2.5+i*.625;const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(x,1.35,-.7),.6,'#84d6f0',.12,.07);chamber.add(arrow);return {arrow,x};});
  let state;
  tag('SiO₂ 遮罩',[-2.2,.015,.04],colors.oxide);
  tag('保護光阻',[-2.2,.37,.04],colors.resist,()=>state?.strip<.95);
  tag('蝕刻面向下移動',()=>[1.4,OXIDE.bottom+OXIDE.thickness*(1-(state?.etch||0))+.08,.08],'#8ce9ee',()=>state?.p>.15&&state?.p<.72);
  tag('去光阻處理',[0,1.1,-.6],colors.resist,()=>state?.p>=.72&&state?.p<.98);
  return {update(s){
    state=s;
    oxide.forEach(({item,left,right,open})=>sizeBox(item,left,right,OXIDE.bottom,OXIDE.bottom+etchedOxideHeight(s,open)));
    resist.forEach(({item,left,right,open})=>{if(!open)sizeBox(item,left,right,RESIST.bottom,RESIST.bottom+RESIST.thickness*(1-s.strip));else item.visible=false;});
    chamber.visible=s.p>=.15&&s.p<.72;
    arrows.forEach(({arrow,x})=>arrow.setLength(inOpening(x)?1.35-(OXIDE.bottom+OXIDE.thickness*(1-s.etch)):.82,.12,.07));
  }};
}

function buildDoping(parent) {
  sectionBase(parent);oxideMask(parent);const dots=dopantDots(parent);
  const beamGroup=new THREE.Group();parent.add(beamGroup);
  const head=block(beamGroup,'#446278');sizeBox(head,-3,3,1.8,1.94,0,depth);
  const ions=Array.from({length:28},(_,i)=>{
    const x=-2.66+i*.196;
    const dot=ball(beamGroup,.035,inOpening(x)?'#eab0fa':'#f8d59a');
    const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(x,1.56,-.76),.2,'#c4d9eb',.08,.035);beamGroup.add(arrow);
    return {dot,arrow,x,seed:i*.613,stop:ionStop(x,i)};
  });
  const heat=block(parent,new THREE.MeshBasicMaterial({color:'#ff8c51',transparent:true,opacity:.07,depthWrite:false}));sizeBox(heat,-3,3,-1.12,.8,.06,depth+.12);
  let state;
  tag('遮罩擋住離子',[-2.25,.30,.04],colors.oxide);
  tag('摻雜在矽內部',[-1.4,-.63,.06],colors.dopant,()=>state?.dose>.12);
  tag('退火：修復、活化',[0,1.1,-.7],'#ffb481',()=>state?.anneal>0);
  return {update(s,t){
    state=s;beamGroup.visible=s.beam;heat.visible=s.anneal>0&&s.anneal<.99;
    ions.forEach(({dot,arrow,x,seed,stop})=>{
      const cycle=(t*1.1+seed)%1;
      dot.position.set(x,1.63-(1.63-stop)*cycle,-.76);
      arrow.position.y=dot.position.y+.27;arrow.visible=cycle<.86;
    });
    dots.forEach(({dot,rank})=>{dot.visible=rank<=s.dose;dot.material.color.set(s.anneal>.65?'#f1b8f1':colors.dopant);});
  }};
}

function buildMetal(parent) {
  sectionBase(parent);const dots=dopantDots(parent,45);dots.forEach(({dot})=>dot.visible=true);
  const lower=sectionLayers(parent,colors.dielectric,OXIDE.bottom,.59);
  const upper=[[-2.8,-1.8,false],[-1.8,1.8,true],[1.8,2.8,false]].map(([left,right,channel])=>({item:block(parent,colors.dielectric),left,right,channel}));
  const viaCopper=WINDOWS.map(([left,right])=>({item:block(parent,material(colors.copper,{metalness:.6,roughness:.34})),left,right}));
  const trenchCopper=block(parent,material(colors.copper,{metalness:.6,roughness:.34}));
  const excess=block(parent,material(colors.copper,{metalness:.6,roughness:.34}));
  const padGroup=new THREE.Group();parent.add(padGroup);
  const pad=cylinder(padGroup,1.42,.20,material('#a7bac2',{roughness:.9}));
  ring(padGroup,1.05,.018,'#4e6777',.105);
  line(padGroup,[[-1.15,.11,0],[1.15,.11,0]],'#4e6777');
  let state;
  tag('介電絕緣層',[2.24,.40,.04],colors.dielectric,()=>state?.dielectric>.5);
  tag('導通孔內的銅',[-1.4,.17,.04],colors.copper,()=>state?.fill>.15);
  tag('銅線：連接兩個接點',[0,.70,.04],colors.copper,()=>state?.fill>.85);
  tag('CMP 研磨墊',()=>[padGroup.position.x,padGroup.position.y+.27,-.6],'#c8d9e2',()=>state?.p>=.77&&state?.p<.995);
  return {update(s,t){
    state=s;const grownTop=OXIDE.bottom+.94*s.dielectric;
    lower.forEach(({item,left,right,open})=>{
      const top=Math.min(.45,grownTop);
      sizeBox(item,left,right,OXIDE.bottom,OXIDE.bottom+(top-OXIDE.bottom)*(open?1-s.via:1));
    });
    upper.forEach(({item,left,right,channel})=>{
      const h=Math.max(0,Math.min(.8,grownTop)-.45);
      sizeBox(item,left,right,.45,.45+h*(channel?1-s.trench:1));
    });
    const viaFill=clamp(s.fill/.6),trenchFill=clamp((s.fill-.6)/.4);
    viaCopper.forEach(({item,left,right})=>sizeBox(item,left,right,OXIDE.bottom,OXIDE.bottom+.59*viaFill));
    sizeBox(trenchCopper,-1.8,1.8,.45,.45+.35*trenchFill);
    sizeBox(excess,-2.8,2.8,.8,.8+.18*s.overburden);
    padGroup.visible=s.p>=.77&&s.p<.995;
    padGroup.position.set(-3.5+7*s.polish,.8+.18*s.overburden+.103,-.9);padGroup.rotation.y=t*2;
  }};
}

const builders=[buildCrystal,buildSlicing,buildOxidation,buildLithography,buildEtching,buildDoping,buildMetal];
function disposeGroup(item) {
  const geometries=new Set(),materials=new Set();
  item.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.remove(item);
}
function resetView(mode='3d') {
  viewMode=mode;
  camera.zoom=1;camera.updateProjectionMatrix();
  const section=STEPS[current].view==='section';
  const target=section?new THREE.Vector3(0,.55,-.65):new THREE.Vector3(0,current===0?1.05:.20,0);
  controls.target.copy(target);
  camera.position.copy(target).add(mode==='front'?new THREE.Vector3(0,.02,12):section?new THREE.Vector3(5.8,4.0,9.8):new THREE.Vector3(6.8,5.1,9.5));
  controls.update();$('front-view').setAttribute('aria-pressed',String(mode==='front'));
}
function showPhase(index) {
  const phase=STEPS[current].phases[index];time=(phase.at+.001)*STEPS[current].duration;setPlaying(false);renderModel();
}
function setStage(index) {
  current=Math.max(0,Math.min(STEPS.length-1,index));time=0;activePhase=-1;setPlaying(false);
  labels.forEach(label=>label.element.remove());labels=[];
  if(ready){if(group)disposeGroup(group);group=new THREE.Group();scene.add(group);model=builders[current](group);resetView();}
  const step=STEPS[current];
  $('info-title').textContent=step.name;$('info-en').textContent=step.en;$('info-description').textContent=step.description;$('info-keypoint').textContent=step.note;
  const count=`${String(current+1).padStart(2,'0')} / ${String(STEPS.length).padStart(2,'0')}`;
  $('stage-counter').textContent=count;$('info-step').textContent=`STEP ${count}`;
  $('view-type').textContent=step.view==='section'?'局部放大剖面 · 厚度誇大':'設備與材料示意';
  $('front-view').hidden=step.view!=='section';
  $('layer-list').replaceChildren(...step.materials.map(([name,color])=>{const item=document.createElement('span');item.className='layer-chip';item.style.setProperty('--chip-color',color);item.textContent=name;return item;}));
  $('phase-list').replaceChildren(...step.phases.map((phase,i)=>{const button=document.createElement('button');button.type='button';button.textContent=`${i+1}  ${phase.title}`;button.addEventListener('click',()=>showPhase(i));return button;}));
  [...$('stage-list').querySelectorAll('button')].forEach((button,i)=>{button.classList.toggle('active',i===current);button.setAttribute('aria-current',i===current?'step':'false');});
  $('previous').disabled=current===0;$('next').disabled=current===STEPS.length-1;
  renderModel();
}
function setPlaying(value) {
  playing=value&&ready;
  $('play-icon').textContent=playing?'Ⅱ':'▶';$('play-label').textContent=playing?'暫停':'播放本步';
  $('play').setAttribute('aria-label',playing?'暫停播放':'播放本步');
}
function togglePlaying(){if(!playing&&time>=STEPS[current].duration)time=0;setPlaying(!playing);}
function renderModel() {
  const p=clamp(time/STEPS[current].duration),state=stateAt(current,p);
  model?.update(state,time);
  $('timeline-fill').style.width=`${p*100}%`;$('timeline-track').style.setProperty('--progress',`${p*100}%`);
  $('timeline-scrub').value=String(p*100);$('progress-label').textContent=`${Math.round(p*100)}%`;
  if(activePhase!==state.phase.index){
    activePhase=state.phase.index;$('scene-label').textContent=state.phase.title;$('phase-detail').textContent=state.phase.detail;
    [...$('phase-list').children].forEach((button,i)=>{button.classList.toggle('active',i===activePhase);button.setAttribute('aria-current',i===activePhase?'step':'false');});
  }
}
function updateLabels() {
  const rect=$('viewer').getBoundingClientRect();
  labels.forEach(label=>{
    const point=new THREE.Vector3(...label.point()).project(camera);
    const visible=label.visible()&&point.z>-1&&point.z<1&&Math.abs(point.x)<.96&&Math.abs(point.y)<.92;
    label.element.hidden=!visible;
    if(visible)label.element.style.transform=`translate(${(point.x+1)/2*rect.width}px,${(1-point.y)/2*rect.height}px) translate(-50%,-50%)`;
  });
}
function initUi() {
  STEPS.forEach((step,i)=>{const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='stage-button';button.innerHTML=`<span class="stage-number">${String(i+1).padStart(2,'0')}</span><span><span class="stage-name">${step.name}</span><span class="stage-en">${step.en}</span></span>`;button.addEventListener('click',()=>setStage(i));li.append(button);$('stage-list').append(li);});
  $('previous').addEventListener('click',()=>setStage(current-1));$('next').addEventListener('click',()=>setStage(current+1));
  $('play').addEventListener('click',togglePlaying);
  $('replay').addEventListener('click',()=>{time=0;setPlaying(true);renderModel();});
  $('timeline-scrub').addEventListener('input',event=>{setPlaying(false);time=Number(event.target.value)/100*STEPS[current].duration;renderModel();});
  $('reset-view').addEventListener('click',()=>resetView());$('front-view').addEventListener('click',()=>resetView(viewMode==='front'?'3d':'front'));
  window.addEventListener('keydown',event=>{
    if(event.target.closest('button,input,select,textarea,a,[contenteditable]'))return;
    if(event.key==='ArrowRight'){event.preventDefault();setStage(current+1);}
    if(event.key==='ArrowLeft'){event.preventDefault();setStage(current-1);}
    if(event.code==='Space'){event.preventDefault();togglePlaying();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);last=performance.now();});
}
function initScene() {
  scene=new THREE.Scene();
  camera=new THREE.OrthographicCamera(-4,4,3,-3,.1,80);
  camera.position.set(6.8,6.15,9.5);
  renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  controls=new OrbitControls(camera,$('scene'));controls.enableDamping=true;controls.enablePan=false;controls.minZoom=.65;controls.maxZoom=2.2;controls.maxPolarAngle=Math.PI*.49;
  scene.add(new THREE.HemisphereLight('#e6f5ff','#35465c',1.6));
  const key=new THREE.DirectionalLight('#ffffff',2.1);key.position.set(4,7,7);scene.add(key);
  const rim=new THREE.DirectionalLight('#84cbdc',1.0);rim.position.set(-5,3,-4);scene.add(rim);
  const grid=new THREE.GridHelper(16,24,'#244453','#17303d');grid.position.y=-1.32;grid.material.transparent=true;grid.material.opacity=.30;scene.add(grid);
  new ResizeObserver(()=>{
    const width=$('viewer').clientWidth,height=$('viewer').clientHeight,aspect=width/height;
    const span=Math.max(6.1,7.7/aspect);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();renderer.setSize(width,height,false);
  }).observe($('viewer'));
  $('scene').addEventListener('webglcontextlost',event=>{event.preventDefault();setPlaying(false);$('viewer-error').hidden=false;});
  ready=true;
}
function frame(now) {
  const delta=Math.min((now-last)/1000,.15);last=now;
  if(playing){
    time+=delta*Number($('speed').value);
    if(time>=STEPS[current].duration){
      if($('auto-advance').checked&&current<STEPS.length-1){setStage(current+1);setPlaying(true);}
      else{time=STEPS[current].duration;setPlaying(false);}
    }
    renderModel();
  }
  if(ready){controls.update();updateLabels();renderer.render(scene,camera);}
  requestAnimationFrame(frame);
}
initUi();
try{initScene();setStage(0);requestAnimationFrame(frame);}
catch(error){console.error('半導體模擬初始化失敗',error);ready=false;setStage(0);$('viewer-error').hidden=false;['play','replay','timeline-scrub','reset-view','front-view'].forEach(id=>$(id).disabled=true);}
