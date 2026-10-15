import test from 'node:test';
import assert from 'node:assert/strict';
import {STEPS,SAW,cutPieces,stateAt,phaseAt,OXIDE,RESIST,resistHeight,etchedOxideHeight,ionStop} from './process-model.mjs';

test('切割前後矽的長度守恆，切穿前薄片不分離',()=>{
  const pieces=cutPieces();
  const total=pieces.reduce((sum,p)=>sum+p.right-p.left,0)+SAW.cuts.length*SAW.kerf;
  assert.ok(Math.abs(total-(SAW.right-SAW.left))<1e-12);
  for(let p=0;p<=.80;p+=.01)assert.equal(stateAt(1,p).separation,0);
  assert.equal(stateAt(1,.80).cut,1);
  assert.equal(stateAt(1,1).separation,1);
});
test('氧化層與剩餘矽相接，並消耗原表面以下的矽',()=>{
  for(let i=0;i<=100;i++){
    const s=stateAt(2,i/100);
    assert.equal(s.siliconTop,s.oxideBottom);
    assert.ok(s.siliconTop<=0);
    assert.ok(Math.abs(s.oxideTop-s.oxideBottom-OXIDE.thickness*s.growth)<1e-12);
  }
});
test('曝光只改變光阻性質，顯影才移除曝光區',()=>{
  const exposed=stateAt(3,.52);
  assert.equal(exposed.exposure,1);
  assert.equal(resistHeight(exposed,true),RESIST.thickness);
  const developed=stateAt(3,1);
  assert.equal(resistHeight(developed,true),0);
  assert.equal(resistHeight(developed,false),RESIST.thickness);
  assert.equal(stateAt(3,.66).light,false);
  assert.equal(stateAt(3,.66).retract,1);
});
test('蝕刻只去除開口中的氧化層，去光阻在蝕刻完成後',()=>{
  const etched=stateAt(4,.70);
  assert.equal(etchedOxideHeight(etched,true),0);
  assert.equal(etchedOxideHeight(etched,false),OXIDE.thickness);
  assert.equal(etched.strip,0);
  assert.equal(stateAt(4,1).strip,1);
});
test('離子在開口處停於矽內，遮罩處停在氧化層上',()=>{
  for(const x of [-1.5,-1.3,1.3,1.5])assert.ok(ionStop(x,4)<OXIDE.bottom);
  for(const x of [-2.2,0,2.2])assert.ok(ionStop(x,4)>OXIDE.top);
  assert.equal(stateAt(5,.9).beam,false);
  assert.equal(stateAt(5,1).anneal,1);
});
test('銅在孔槽形成後填入，CMP最後只移除過鍍層',()=>{
  const beforeFill=stateAt(6,.40);
  assert.equal(beforeFill.trench,1);assert.equal(beforeFill.via,1);assert.equal(beforeFill.fill,0);
  const plated=stateAt(6,.76);
  assert.equal(plated.fill,1);assert.equal(plated.overburden,1);
  const finished=stateAt(6,1);
  assert.equal(finished.fill,1);assert.equal(finished.overburden,0);assert.equal(finished.polish,1);
});
test('所有子工序的標示由各步驟實際時間決定',()=>{
  STEPS.forEach((step,index)=>step.phases.forEach((phase,i)=>assert.equal(phaseAt(index,phase.at).index,i)));
});
