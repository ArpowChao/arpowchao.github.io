import * as THREE from 'three';
import { OrbitControls } from './lib/OrbitControls.js';
import { STEPS, SECTIONS, WINDOWS, OXIDE, RESIST, IMPLANT, CONTACT, CU, SAW, cutPieces, clamp, stateAt, resistHeight, implantPath, contactProfile, copperProfile, coatingRects } from './process-model.mjs';

const $=id=>document.getElementById(id);
const colors={si:'#536b86',oxide:'#22b9de',resist:'#a96bdd',exposed:'#f4b45d',copper:'#e9a060',dielectric:'#78aaba',dopant:'#e394ed',damage:'#ff9b71',w:'#d7e0e8',barrier:'#8c97ae',seed:'#ffe0a3'};
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
function dopantDots(parent,count=70) {
  const result=[];
  WINDOWS.forEach(([left,right],region)=>{
    for(let i=0;i<count;i++) {
      const u=((i*.61803398875)%1);
      const path=implantPath(left+.10+(right-left-.26)*u,i*.41421356237);
      const [x,y]=path.stop;
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
  const liquid=block(developer,new THREE.MeshBasicMaterial({color:'#66d9eb',transparent:true,opacity:.17,depthWrite:false}));sizeBox(liquid,-2.88,2.88,.65,.69,.05,depth+.1);
  for(const x of [-2.2,-.6,.6,2.2]){const flow=block(developer,new THREE.MeshBasicMaterial({color:'#73e4f2',transparent:true,opacity:.36,depthWrite:false}));sizeBox(flow,x-.025,x+.025,.69,.92,-.78,.10);}
  let state;
  tag('SiO₂',[-2.2,.015,.04],colors.oxide);
  tag('厚光阻',()=>[-2.24,RESIST.bottom+RESIST.thickness*.65*(state?.coat||0),.04],colors.resist,()=>state?.coat>.5);
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

// Front cut-face markers show lattice displacement, not a deposited film.
function lattice(parent) {
  const sites=[];
  WINDOWS.forEach(([left,right])=>{
    for(let col=0;col<6;col++)for(let row=0;row<5;row++){
      const x=left+.12+col*.105,y=-.10-row*.125,rank=((col*7+row*11)%29)/30;
      const atom=ball(parent,.016,colors.si);
      const vacancy=line(parent,[[x-.025,y-.025,.04],[x+.025,y+.025,.04],[x,y,.04],[x-.025,y+.025,.04],[x+.025,y-.025,.04]],colors.damage);
      sites.push({atom,vacancy,x,y,rank,col,row});
    }
  });
  return {update(dose,repair){sites.forEach(({atom,vacancy,x,y,rank,col,row})=>{
    const damaged=dose>rank,amount=damaged?1-repair:0;
    atom.position.set(x+.046*Math.sin(col*5+row)*amount,y+.045*Math.cos(col+row*7)*amount,.045);
    atom.material.color.set(amount>.08?colors.damage:'#9bb6cc');vacancy.visible=amount>.08;
  });}};
}
function patternedResist(parent) {
  return sectionLayers(parent,colors.resist,RESIST.bottom,RESIST.thickness).filter(s=>{
    if(s.open)s.item.visible=false;return !s.open;
  });
}
function buildImplant(parent) {
  sectionBase(parent);fullOxide(parent);
  patternedResist(parent);
  const dots=dopantDots(parent),crystal=lattice(parent);
  const beamGroup=new THREE.Group();parent.add(beamGroup);
  const head=block(beamGroup,'#446278');sizeBox(head,-2.9,2.9,2.0,2.13,0,depth);
  const direction=new THREE.Vector3(Math.sin(IMPLANT.tilt*Math.PI/180),-Math.cos(IMPLANT.tilt*Math.PI/180),0);
  const ions=Array.from({length:38},(_,i)=>{
    const path=implantPath(-2.68+i*.143,i),dot=ball(beamGroup,.032,path.blocked?'#f8d59a':colors.dopant);
    const arrow=new THREE.ArrowHelper(direction,new THREE.Vector3(),.23,'#d1dcf4',.07,.035);beamGroup.add(arrow);
    return {dot,arrow,path,seed:i*.613};
  });
  // Both lines share their origin: this is a true 7 degree angle, not an exaggerated beam.
  line(parent,[[.1,1.88,.08],[.1,.76,.08]],'#8497a9',true);
  line(parent,[[.1,1.88,.08],[.1+Math.tan(IMPLANT.tilt*Math.PI/180)*1.12,.76,.08]],'#e9b9fa');
  let state;
  tag('厚光阻擋住離子',[-2.25,.43,.04],colors.resist);
  tag('連續薄 SiO₂',[-2.18,.015,.06],colors.oxide);
  tag('法線 ↕　偏離 7°',[.15,2.30,-.3],'#dfc1f1');
  tag('Si(100) 內部：摻雜＋損傷',[-.03,-.83,.06],colors.damage,()=>state?.dose>.1);
  return {update(s,t){
    state=s;beamGroup.visible=s.beam;
    ions.forEach(({dot,arrow,path,seed})=>{
      const cycle=(t*1.1+seed)%1;
      const x=path.start[0]+(path.stop[0]-path.start[0])*cycle,y=path.start[1]+(path.stop[1]-path.start[1])*cycle;
      dot.position.set(x,y,.065);arrow.position.set(x-direction.x*.28,y-direction.y*.28,.065);arrow.visible=cycle<.83;
    });
    dots.forEach(({dot,rank})=>dot.visible=rank<=s.dose);crystal.update(s.dose,0);
  }};
}
function buildAnneal(parent) {
  sectionBase(parent);fullOxide(parent);
  const resist=patternedResist(parent),dots=dopantDots(parent),crystal=lattice(parent);
  const heat=block(parent,new THREE.MeshBasicMaterial({color:'#ff8c51',transparent:true,opacity:.08,depthWrite:false}));sizeBox(heat,-2.95,2.95,-1.12,.12,.06,depth+.12);
  const lamps=new THREE.Group();parent.add(lamps);
  for(const x of [-2,-1,0,1,2]){const lamp=cylinder(lamps,.08,1.9,material('#ffbb70',{emissive:'#ff6a26',emissiveIntensity:1}),[x,1.45,-.9],16);lamp.rotation.x=Math.PI/2;}
  let state;
  tag('薄 SiO₂ 保留',[-2.15,.015,.07],colors.oxide);
  tag('先去光阻',[0,.95,-.5],colors.resist,()=>state?.strip<1);
  tag('再退火：修復晶格、活化摻雜',[0,1.85,-.5],'#ffbb83',()=>state?.anneal>0&&state?.anneal<1);
  tag('矽內摻雜區',[-1.4,-.73,.06],colors.dopant);
  return {update(s){
    state=s;resist.forEach(({item,left,right})=>sizeBox(item,left,right,RESIST.bottom,RESIST.bottom+RESIST.thickness*(1-s.strip)));
    crystal.update(1,s.anneal);dots.forEach(({dot})=>dot.material.color.set(s.anneal>.8?'#f5ccff':colors.dopant));
    heat.visible=lamps.visible=s.anneal>0&&s.anneal<1;
  }};
}
function surfaceCoating(parent,color) {
  const surface=material(color,{metalness:.55,roughness:.38}),pool=[];
  return {update(profile,outer,inner=0,ceiling=Infinity){
    const rects=coatingRects(profile,outer,inner,ceiling);
    while(pool.length<rects.length)pool.push(block(parent,surface));
    pool.forEach((item,i)=>{const r=rects[i];if(r)sizeBox(item,r.left,r.right,r.bottom,r.top);else item.visible=false;});
  }};
}
function finishedContacts(parent) {
  sectionBase(parent);dopantDots(parent,40);
  SECTIONS.forEach(s=>{
    if(!s.open){const oxide=block(parent,colors.oxide);sizeBox(oxide,s.left,s.right,OXIDE.bottom,OXIDE.top);
      const ild=block(parent,colors.dielectric);sizeBox(ild,s.left,s.right,OXIDE.top,CONTACT.top);}
  });
  const profile=contactProfile();
  surfaceCoating(parent,'#b6bfc9').update(profile,CONTACT.liner,0,CONTACT.top);
  surfaceCoating(parent,colors.w).update(profile,CONTACT.liner+CONTACT.deposition,CONTACT.liner,CONTACT.top);
}
function cmpPad(parent) {
  const group=new THREE.Group();parent.add(group);
  cylinder(group,1.42,.20,material('#a7bac2',{roughness:.9}));ring(group,1.05,.018,'#4e6777',.105);
  line(group,[[-1.15,.11,0],[1.15,.11,0]],'#4e6777');
  return group;
}
function buildContact(parent) {
  sectionBase(parent);dopantDots(parent,40);
  const oxides=sectionLayers(parent,colors.oxide,OXIDE.bottom,OXIDE.thickness);
  const dielectric=sectionLayers(parent,colors.dielectric,OXIDE.top,CONTACT.top-OXIDE.top);
  const resist=SECTIONS.filter(s=>!s.open).map(s=>({...s,item:block(parent,colors.resist)}));
  const liner=surfaceCoating(parent,'#b6bfc9'),tungsten=surfaceCoating(parent,colors.w),pad=cmpPad(parent);
  const etchArrows=WINDOWS.map(([l,r])=>{const a=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3((l+r)/2,1.2,-.7),.7,'#7ee3ec',.12,.07);parent.add(a);return a;});
  let state;
  tag('薄 SiO₂：contact 才開窗',[-2.05,.01,.06],colors.oxide,()=>state?.fill<.3);
  tag('接觸介電層',[2.20,.30,.06],colors.dielectric,()=>state?.dielectric>.5);
  tag('接觸介面／liner',[-1.4,-.04,.08],'#b6bfc9',()=>state?.liner>.5);
  tag('W contact',[1.4,.28,.08],colors.w,()=>state?.fill>.7);
  tag('W CMP',[0,1.4,-.4],colors.w,()=>state?.polish>0&&state?.polish<1);
  return {update(s,t){
    state=s;
    const front=CONTACT.top-(CONTACT.top-OXIDE.bottom)*s.etch;
    oxides.forEach(({item,left,right,open})=>sizeBox(item,left,right,OXIDE.bottom,open?Math.min(OXIDE.top,front):OXIDE.top));
    dielectric.forEach(({item,left,right,open})=>sizeBox(item,left,right,OXIDE.top,Math.min(OXIDE.top+(CONTACT.top-OXIDE.top)*s.dielectric,open?front:CONTACT.top)));
    resist.forEach(({item,left,right})=>sizeBox(item,left,right,CONTACT.top,CONTACT.top+.23*s.mask*(1-s.strip)));
    etchArrows.forEach(a=>{a.visible=s.p>=.23&&s.p<.47;a.setLength(1.2-front,.12,.07);});
    const profile=contactProfile(),ceiling=CONTACT.top+(CONTACT.liner+CONTACT.deposition)*(1-s.polish);
    liner.update(profile,CONTACT.liner*s.liner,0,ceiling);
    tungsten.update(profile,CONTACT.liner+CONTACT.deposition*s.fill,CONTACT.liner,ceiling);
    pad.visible=s.polish>0&&s.polish<1;pad.position.set(-3.2+6.4*s.polish,ceiling+.103,-.9);pad.rotation.y=t*2;
  }};
}
function copperBase(parent) {
  finishedContacts(parent);
  const sections=SECTIONS.map(s=>({...s,item:block(parent,colors.dielectric)}));
  const barrier=surfaceCoating(parent,colors.barrier),seed=surfaceCoating(parent,colors.seed),copper=surfaceCoating(parent,colors.copper);
  return {update(s){
    const profile=copperProfile(s);
    sections.forEach((section,i)=>sizeBox(section.item,section.left,section.right,CONTACT.top,profile[i].height));
    const b=CU.barrier*s.barrier,se=CU.seed*s.seed,pl=CU.plating*s.plating;
    const ceiling=CU.top+(CU.barrier+CU.seed+CU.plating)*(1-s.polish);
    barrier.update(profile,b,0,ceiling);seed.update(profile,b+se,b,ceiling);copper.update(profile,b+se+pl,b+se,ceiling);
  }};
}
function buildSeed(parent) {
  const base=copperBase(parent);let state;
  const arrows=WINDOWS.map(([l,r])=>{const a=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3((l+r)/2,1.95,-.7),.7,'#8ae5ee',.12,.07);parent.add(a);return a;});
  tag('下方 W 接點',[1.4,.22,.06],colors.w);
  tag('互連氧化層',[2.24,.98,.06],colors.dielectric,()=>state?.dielectric>.5);
  tag('阻障 → seed：頂面、側壁、孔底',[0,1.9,-.6],colors.seed,()=>state?.barrier>0);
  tag('via 底部停在 W',[-1.4,.56,.06],colors.w,()=>state?.via>.95&&state?.seed<.1);
  return {update(s){state=s;base.update(s);arrows.forEach(a=>{a.visible=s.p>=.16&&s.p<.46;const front=s.p<.30?CU.top-(CU.top-CU.floor)*s.trench:CU.floor-CU.viaDepth*s.via;a.setLength(1.95-front,.12,.07);});}};
}
function buildPlating(parent) {
  const base=copperBase(parent);let state;
  // Arrows point OUT of each seeded surface, showing the coating offset.
  const vectors=[{x:-2.25,y:CU.top,dx:0,dy:1},{x:-1.8,y:.7,dx:1,dy:0},{x:-1,y:.7,dx:-1,dy:0},{x:1,y:.7,dx:1,dy:0},{x:1.8,y:.7,dx:-1,dy:0},{x:-1.4,y:CONTACT.top,dx:0,dy:1},{x:1.4,y:CONTACT.top,dx:0,dy:1},{x:0,y:CU.floor,dx:0,dy:1}];
  const arrows=vectors.map(v=>{const a=new THREE.ArrowHelper(new THREE.Vector3(v.dx,v.dy,0),new THREE.Vector3(),.16,'#ffd79a',.07,.045);parent.add(a);return {a,...v};});
  tag('整面過鍍銅',()=>[-2.08,CU.top+CU.barrier+CU.seed+CU.plating*(state?.plating||0)+.06,.06],colors.copper,()=>state?.plating>.12);
  tag('Cu²⁺ + 2e⁻ → Cu',[0,2.5,-.5],colors.copper);
  tag('下方 W 接點',[1.4,.22,.06],colors.w);
  return {update(s){state=s;base.update(s);const thickness=CU.barrier+CU.seed+CU.plating*s.plating;
    arrows.forEach(({a,x,y,dx,dy})=>{a.visible=s.plating>0&&s.plating<.97&&(dy===1||thickness<.32);a.position.set(x+dx*thickness,y+dy*thickness,.07);});
  }};
}
function buildCopperCMP(parent) {
  const base=copperBase(parent),pad=cmpPad(parent);let state;
  line(parent,[[-2.9,CU.top,.10],[2.9,CU.top,.10]],'#83e8e2',true);
  tag('氧化層頂面＝CMP 終點',[2.0,CU.top+.025,.12],colors.dielectric);
  tag('W contact 接 Si',[1.4,.20,.06],colors.w);
  tag('孔槽內 Cu 保留',[0,1.05,.06],colors.copper,()=>state?.polish>.8);
  tag('移除場區 Cu／seed／barrier',()=>[pad.position.x,pad.position.y+.32,-.5],colors.copper,()=>state?.polish>0&&state?.polish<1);
  return {update(s,t){state=s;base.update(s);
    const ceiling=CU.top+(CU.barrier+CU.seed+CU.plating)*(1-s.polish);
    pad.visible=s.polish>0&&s.polish<1;pad.position.set(-3+6*s.polish,ceiling+.103,-.9);pad.rotation.y=t*2;
  }};
}

const builders=[buildCrystal,buildSlicing,buildOxidation,buildLithography,buildImplant,buildAnneal,buildContact,buildSeed,buildPlating,buildCopperCMP];
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
  updateReadout(state);
  $('timeline-fill').style.width=`${p*100}%`;$('timeline-track').style.setProperty('--progress',`${p*100}%`);
  $('timeline-scrub').value=String(p*100);$('progress-label').textContent=`${Math.round(p*100)}%`;
  if(activePhase!==state.phase.index){
    activePhase=state.phase.index;$('scene-label').textContent=state.phase.title;$('phase-detail').textContent=state.phase.detail;
    [...$('phase-list').children].forEach((button,i)=>{button.classList.toggle('active',i===activePhase);button.setAttribute('aria-current',i===activePhase?'step':'false');});
  }
}
let lastReadout='';
function updateReadout(s) {
  const percent=n=>`${Math.round(n*100)}%`;
  const metrics=[
    [['拉出長度',percent(s.growth||0)],['晶錠旋轉','隨拉桿旋轉'],['生長位置','固液交界']],
    [['切穿進度',percent(s.cut||0)],['分離進度',percent(s.separation||0)],['切割方式','平行金剛石線']],
    [['氧化進度',percent(s.growth||0)],['用途','薄保護／screen'],['植入前開窗','不開窗']],
    [['光阻','厚正型光阻'],['顯影進度',percent(s.develop||0)],['薄 SiO₂','完整保留']],
    [['離法線傾角','7° · 本例設定'],['植入劑量進度',percent(s.dose||0)],['遮罩／薄氧化層','厚光阻／連續']],
    [['去光阻',percent(s.strip||0)],['修復／活化',percent(s.anneal||0)],['薄 SiO₂','保留到 contact']],
    [['接觸孔蝕刻',percent(s.etch||0)],['W 填孔',percent(s.fill||0)],['W 平坦化',percent(s.polish||0)]],
    [['via 蝕刻',percent(s.via||0)],['阻障層',percent(s.barrier||0)],['seed 覆蓋',percent(s.seed||0)]],
    [['平面電鍍厚度',`${(CU.ratio*(s.plating||0)).toFixed(2)} × via 深度`],['目標鍍厚','1.75 × · 本例設定'],['成長表面','頂面＋孔底＋側壁']],
    [['CMP 進度',percent(s.polish||0)],['終點','氧化層頂面'],['接觸路徑','Cu → W → Si']]
  ][current];
  const html=metrics.map(([name,value])=>`<div><dt>${name}</dt><dd>${value}</dd></div>`).join('');
  if(html!==lastReadout){$('process-readout').innerHTML=html;lastReadout=html;}
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
