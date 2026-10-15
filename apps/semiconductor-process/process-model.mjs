export const clamp = x => Math.max(0, Math.min(1, x));
export const ramp = (p, a, b) => clamp((p - a) / (b - a));
export const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
export const WINDOWS = [[-1.8, -1], [1, 1.8]];
export const SECTIONS = [
  { left: -2.8, right: -1.8, open: false },
  { left: -1.8, right: -1, open: true },
  { left: -1, right: 1, open: false },
  { left: 1, right: 1.8, open: true },
  { left: 1.8, right: 2.8, open: false }
];
export const OXIDE = { bottom: -.14, top: .18, thickness: .32 };
export const RESIST = { bottom: .18, thickness: .30 };
export const inOpening = x => WINDOWS.some(([left,right]) => x > left && x < right);
export const SAW={left:-2.1,right:2.1,radius:.85,kerf:.025,cuts:Array.from({length:14},(_,i)=>-1.82+i*.28)};
export function cutPieces() {
  const bounds=[SAW.left,...SAW.cuts,SAW.right];
  return bounds.slice(0,-1).map((left,i)=>({left:left+(i?SAW.kerf/2:0),right:bounds[i+1]-(i<SAW.cuts.length?SAW.kerf/2:0)}));
}

const phase = (at, title, detail) => ({ at, title, detail });
export const STEPS = [
  { name:'單晶拉晶', en:'CRYSTAL GROWTH', duration:16, view:'equipment',
    description:'晶種接觸矽熔液後，一邊旋轉、一邊往上拉。固液交界持續長出新的單晶，形成晶錠。',
    note:'表面青色追蹤線用來辨認旋轉；它不是實際晶錠上的塗料。',
    materials:[['矽熔液','#ffad48'],['單晶矽','#a7bac9']],
    phases:[phase(0,'接觸熔液','晶種位於熔液表面，開始建立單晶的生長界面。'),phase(.13,'旋轉、向上拉','拉桿確實向上移動；下端持續接觸熔液，新晶體在交界處長出。'),phase(.86,'形成晶錠','晶錠逐漸加長。這裡省略實際的控溫、直徑回授及收尾段。')] },
  { name:'線鋸切片', en:'WIRE SAWING', duration:15, view:'equipment',
    description:'平行的金剛石線沿切割平面穿過晶錠。完整切穿後，晶圓薄片才彼此分離。',
    note:'切口會從上往下形成；薄片保持原本的尺寸，不會憑空縮放長出來。後續仍需研磨、拋光與清洗。',
    materials:[['矽晶錠／晶圓','#a7bac9'],['線鋸','#f8d08b']],
    phases:[phase(0,'線鋸就位','晶錠與所有未切除材料完整相接。'),phase(.12,'逐漸切穿','線鋸往下進給，切縫由上向下延伸。線上的亮點表示線材往復運動。'),phase(.80,'切穿後分開','所有切面穿透晶錠後，才把各薄片拉開，便於看見切割結果。')] },
  { name:'熱氧化', en:'THERMAL OXIDATION', duration:13, view:'section',
    description:'現在放大晶圓的一小塊剖面。氧在高溫下與矽反應，二氧化矽從原本的矽表面生長。',
    note:'氧化會消耗部分矽；虛線是氧化前的表面。薄膜厚度已放大，不表示實際尺寸。',
    materials:[['矽 Si','#536b86'],['二氧化矽 SiO₂','#22b9de']],
    phases:[phase(0,'加熱與供氧','O₂ 與加熱環境由標示呈現，沒有粉末落到晶圓上。'),phase(.16,'矽表面反應','氧化層向原表面上下兩側成長；下方的矽同時被消耗。'),phase(.9,'形成絕緣薄膜','青色層是 SiO₂，灰藍色是剩餘的矽。')] },
  { name:'曝光與顯影', en:'EXPOSE & DEVELOP', duration:21, view:'section',
    description:'使用正型光阻：先塗佈、烘烤，再透過光罩曝光。曝光只改變溶解性；接著由顯影液移除受光區。',
    note:'這裡把光罩圖案直接對齊剖面開口，以說明遮光關係；投影透鏡與縮小倍率省略。',
    materials:[['矽','#536b86'],['SiO₂','#22b9de'],['未曝光光阻','#a96bdd'],['已曝光光阻','#f4b45d']],
    phases:[phase(0,'塗佈光阻','紫色光阻覆蓋整個氧化層表面，完成後再曝光。'),phase(.23,'光罩選擇曝光','光在不透明區被擋住；只有兩個透明開口下方的光阻變成橙色，厚度不變。'),phase(.53,'移開曝光裝置','曝光完成，光罩與光源退出。橙色光阻還在，尚未形成孔洞。'),phase(.65,'顯影、沖洗','顯影液帶走可溶的橙色光阻；只有受光區的厚度下降，紫色保護區留下。')] },
  { name:'蝕刻與去光阻', en:'ETCH & STRIP', duration:18, view:'section',
    description:'以乾式蝕刻為例，反應性物種移除開口底部暴露的 SiO₂。光阻保護其餘區域，完成後才去除光阻。',
    note:'孔洞由上往下刻進氧化層。光阻去除是後續另一道處理，不會把受保護的氧化層一起消失。',
    materials:[['矽','#536b86'],['SiO₂','#22b9de'],['保護光阻','#a96bdd']],
    phases:[phase(0,'保護區與開口','兩個光阻開口露出青色氧化層；此時氧化層還是完整的。'),phase(.15,'蝕刻開口底部','只移除開口中的氧化層，刻蝕面逐漸下降到矽表面。'),phase(.72,'去除剩餘光阻','氧化層開口完成後，再移除頂端紫色光阻。'),phase(.95,'留下氧化遮罩','青色遮罩與暴露的矽區域清楚可見。')] },
  { name:'離子植入與退火', en:'IMPLANT & ANNEAL', duration:18, view:'section',
    description:'加速離子撞向晶圓。遮罩阻擋其下方區域；開口中的離子進入矽內部，之後以退火修復損傷並活化摻雜。',
    note:'剖面紫色標記代表矽內部的摻雜分布，不是表面顏料。離子停止深度與遮罩厚度為教學示意。',
    materials:[['矽','#536b86'],['阻擋用 SiO₂','#22b9de'],['矽內摻雜區','#e394ed']],
    phases:[phase(0,'遮罩限定位置','氧化層覆蓋區會擋住此示例的離子束；兩個開口露出矽。'),phase(.13,'離子進入矽內','箭頭表示運動方向。撞到遮罩的離子停在遮罩上，通過開口的離子停在矽內。'),phase(.78,'退火活化','離子束關閉。加熱處理修復晶格損傷、活化摻雜；沒有再堆上一層薄膜。')] },
  { name:'銅互連與平坦化', en:'COPPER INTERCONNECT', duration:23, view:'section',
    description:'以銅鑲嵌互連示例：在介電層形成溝槽與導通孔，填入銅，再以 CMP 去除表面多餘銅，留下埋在絕緣層內的連線。',
    note:'此步接續已完成的元件區，省略中間多次製程及阻障／種子層；不是把前面兩個摻雜區直接當成完整電晶體。',
    materials:[['元件所在矽層','#536b86'],['介電絕緣層','#78aaba'],['銅 Cu','#e9a060']],
    phases:[phase(0,'介電層覆蓋元件','介電層先隔開導線與下方元件；示意兩個預定連接的端點。'),phase(.13,'再微影、蝕刻孔槽','經另一輪圖案轉移，形成上方溝槽與下方兩個導通孔。'),phase(.40,'填銅與過鍍層','銅填滿孔槽，並覆蓋整個頂面；連線不是在表面直接畫出來的。'),phase(.77,'CMP 移除多餘銅','研磨墊移動並去除頂面過鍍銅，孔槽內的銅保留，形成絕緣層中的互連。')] }
];

export function phaseAt(index,p) {
  const phases=STEPS[index].phases;
  let result=0;
  phases.forEach((item,i)=>{if(p>=item.at)result=i;});
  return { ...phases[result], index:result };
}

export function stateAt(index,progress) {
  const p=clamp(progress);
  const common={p,phase:phaseAt(index,p)};
  if(index===0) return {...common,growth:smooth(ramp(p,.08,.90)),angle:p*Math.PI*6};
  if(index===1) return {...common,cut:smooth(ramp(p,.12,.79)),separation:smooth(ramp(p,.81,1))};
  if(index===2) {
    const growth=ramp(p,.15,.91);
    return {...common,growth,siliconTop:OXIDE.bottom*growth,oxideBottom:OXIDE.bottom*growth,oxideTop:OXIDE.top*growth};
  }
  if(index===3) return {...common,coat:ramp(p,0,.20),exposure:ramp(p,.25,.51),develop:ramp(p,.66,.98),retract:smooth(ramp(p,.54,.64)),light:p>=.25&&p<=.51};
  if(index===4) return {...common,etch:ramp(p,.16,.69),strip:ramp(p,.75,.97)};
  if(index===5) return {...common,dose:ramp(p,.13,.76),beam:p>=.13&&p<.78,anneal:ramp(p,.79,1)};
  return {...common,dielectric:ramp(p,0,.12),trench:ramp(p,.15,.25),via:ramp(p,.25,.39),fill:ramp(p,.41,.67),overburden:ramp(p,.67,.76)*(1-ramp(p,.79,.98)),polish:ramp(p,.79,.98)};
}

export function resistHeight(state,open) {
  return RESIST.thickness*state.coat*(open ? 1-state.develop : 1);
}
export function etchedOxideHeight(state,open) {
  return OXIDE.thickness*(open ? 1-state.etch : 1);
}
export function ionStop(x,seed=0) {
  return inOpening(x) ? -.27-.12*(.5+.5*Math.sin(seed*7.3)) : OXIDE.top+.035;
}
