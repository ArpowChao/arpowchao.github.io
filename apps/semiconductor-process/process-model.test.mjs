import test from 'node:test';
import assert from 'node:assert/strict';
import {STEPS,SAW,cutPieces,stateAt,phaseAt,OXIDE,RESIST,IMPLANT,CONTACT,CU,resistHeight,implantPath,contactProfile,copperProfile,coatingRects} from './process-model.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} ≠ ${b}`);
const contains=(rects,x,y)=>rects.some(r=>x>r.left&&x<r.right&&y>=r.bottom&&y<=r.top);

test('切割長度守恆，完全切穿前不分離',()=>{
  const total=cutPieces().reduce((sum,p)=>sum+p.right-p.left,0)+SAW.cuts.length*SAW.kerf;
  near(total,SAW.right-SAW.left);
  for(let p=0;p<=.80;p+=.01)assert.equal(stateAt(1,p).separation,0);
  assert.equal(stateAt(1,.80).cut,1);assert.equal(stateAt(1,1).separation,1);
});
test('薄氧化層連續生長、消耗矽，厚光阻比 screen oxide 厚',()=>{
  for(let i=0;i<=100;i++){
    const s=stateAt(2,i/100);near(s.siliconTop,s.oxideBottom);
    assert.ok(s.siliconTop<=0);near(s.oxideTop-s.oxideBottom,OXIDE.thickness*s.growth);
  }
  assert.ok(RESIST.thickness>OXIDE.thickness*8);near(RESIST.bottom,OXIDE.top);
});
test('曝光保持光阻厚度，顯影才移除受光區',()=>{
  const exposed=stateAt(3,.52);assert.equal(exposed.exposure,1);
  near(resistHeight(exposed,true),RESIST.thickness);
  const developed=stateAt(3,1);assert.equal(resistHeight(developed,true),0);near(resistHeight(developed,false),RESIST.thickness);
});
test('植入全程 oxide 不開窗，束流相對法線為 7°，由厚光阻遮蔽',()=>{
  for(let p=0;p<=1;p+=.01)assert.equal(stateAt(4,p).oxideOpen,0);
  for(const x of [-2.2,0,2.2]){
    const path=implantPath(x,4);assert.equal(path.blocked,true);
    assert.ok(path.stop[1]>OXIDE.top&&path.stop[1]<RESIST.bottom+RESIST.thickness);
  }
  for(const x of [-1.5,1.3]){
    const path=implantPath(x,4);assert.equal(path.blocked,false);assert.ok(path.stop[1]<OXIDE.bottom);
    near(Math.atan2(path.stop[0]-path.start[0],path.start[1]-path.stop[1])*180/Math.PI,IMPLANT.tilt);
  }
  assert.equal(implantPath(-1.01,4).blocked,true,'斜向束流也會被光阻開口側壁擋住');
});
test('植入後先去光阻才退火，未退火前保留損傷與薄氧化層',()=>{
  assert.equal(stateAt(4,1).anneal,0);assert.equal(stateAt(4,1).strip,0);
  for(let i=0;i<=100;i++){
    const s=stateAt(5,i/100);assert.equal(s.dose,1);assert.equal(s.oxideOpen,0);assert.equal(s.beam,false);
    if(s.anneal>0)assert.equal(s.strip,1);
  }
  assert.equal(stateAt(5,1).anneal,1);
});
test('contact 蝕刻才穿透薄氧化層，去光阻後建立 liner 與 W',()=>{
  assert.equal(stateAt(6,.22).etch,0);
  const opened=stateAt(6,.47);assert.equal(opened.etch,1);assert.equal(opened.fill,0);
  near(CONTACT.top-(CONTACT.top-OXIDE.bottom)*opened.etch,OXIDE.bottom);
  for(let i=0;i<=100;i++){
    const s=stateAt(6,i/100);
    if(s.liner>0){assert.equal(s.strip,1);assert.equal(s.etch,1);}
    if(s.fill>0)assert.equal(s.liner,1);
  }
  const w=coatingRects(contactProfile(),CONTACT.liner+CONTACT.deposition,CONTACT.liner,CONTACT.top);
  assert.ok(contains(w,-1.4,.2));assert.ok(!contains(w,-2.4,.2));
  assert.ok(w.every(r=>r.top<=CONTACT.top&&r.bottom>=OXIDE.bottom));
});
test('銅 via 停在 W 頂面；先完成開孔與阻障層，再沉積 seed',()=>{
  const profile=copperProfile();
  assert.ok(profile.filter(s=>s.open).every(s=>s.height===CONTACT.top));assert.ok(CONTACT.top>OXIDE.top);
  for(let i=0;i<=100;i++){
    const s=stateAt(7,i/100);
    if(s.barrier>0){assert.equal(s.via,1);assert.equal(s.trench,1);}
    if(s.seed>0)assert.equal(s.barrier,1);
  }
});
test('連續 seed 同時覆蓋場區、trench 底、via 底與兩側壁',()=>{
  const seed=coatingRects(copperProfile(),CU.barrier+CU.seed,CU.barrier);
  for(const [x,y] of [[-2.25,CU.top+.023],[0,CU.floor+.023],[-1.4,CONTACT.top+.023],[1.4,CONTACT.top+.023],[-1.8+.023,.65],[-1-.023,.65],[1+.023,.65],[1.8-.023,.65]])assert.ok(contains(seed,x,y),`seed 漏鍍 ${x},${y}`);
});
test('電鍍是所有表面的 offset，鍍厚目標 1.75 倍 via 深度',()=>{
  assert.ok(CU.ratio>=1.5&&CU.ratio<=2);near(CU.plating,1.75*CU.viaDepth);
  const t=.1,inner=CU.barrier+CU.seed,plate=coatingRects(copperProfile(),inner+t,inner);
  for(const [x,y] of [[-2.25,CU.top+inner+.05],[-1.4,CONTACT.top+inner+.05],[-1.8+inner+.05,.65],[-1-inner-.05,.65]])assert.ok(contains(plate,x,y),`電鍍沒有沿表面增厚 ${x},${y}`);
  assert.equal(stateAt(8,1).plating,1);assert.equal(stateAt(8,1).polish,0);
});
test('Cu CMP 移除所有場區導電膜，停於 oxide，保留孔槽金屬且 Cu 不接 Si',()=>{
  const profile=copperProfile(),layers=[[0,CU.barrier],[CU.barrier,CU.barrier+CU.seed],[CU.barrier+CU.seed,CU.barrier+CU.seed+CU.plating]];
  for(let i=0;i<=100;i++){
    const s=stateAt(9,i/100),ceiling=CU.top+(CU.barrier+CU.seed+CU.plating)*(1-s.polish);
    assert.ok(ceiling>=CU.top);
    for(const [inner,outer] of layers){
      const rects=coatingRects(profile,outer,inner,ceiling);
      assert.ok(rects.every(r=>r.top<=ceiling&&r.bottom>=CONTACT.top));
      if(s.polish===1)assert.ok(rects.every(r=>r.left>=-1.8&&r.right<=1.8));
    }
  }
  const copper=coatingRects(profile,CU.barrier+CU.seed+CU.plating,CU.barrier+CU.seed,CU.top);
  assert.ok(contains(copper,0,1.15));assert.ok(contains(copper,-1.4,.7));assert.ok(!contains(copper,-1.4,OXIDE.top));
});
test('步驟交接保留同一個 W／seed／plating 結果，子工序時間標示正確',()=>{
  for(const [a,b,keys] of [[7,8,['dielectric','trench','via','barrier','seed','plating','polish']],[8,9,['dielectric','trench','via','barrier','seed','plating','polish']]])for(const key of keys)near(stateAt(a,1)[key],stateAt(b,0)[key]);
  assert.equal(STEPS.length,10);
  STEPS.forEach((step,index)=>step.phases.forEach((phase,i)=>assert.equal(phaseAt(index,phase.at).index,i)));
});