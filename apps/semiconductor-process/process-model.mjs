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
// Display coordinates, not physical film thicknesses or a transport calculation.
export const OXIDE = { bottom: -.0264, top: .0336, thickness: .06 };
export const RESIST = { bottom: OXIDE.top, thickness: .58 };
export const IMPLANT = { tilt: 7, sourceY: 1.9 };
export const CONTACT = { top: .48, liner: .018, deposition: .45 };
export const CU = { top: 1.24, floor: .88, barrier: .012, seed: .022, ratio: 1.75 };
CU.viaDepth = CU.floor - CONTACT.top;
CU.plating = CU.viaDepth * CU.ratio;
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
  { name:'薄氧化層', en:'SCREEN OXIDE', duration:13, view:'section',
    description:'放大晶圓局部剖面：氧在高溫下與矽反應，長出薄 SiO₂，保護表面並作為植入時的 screen oxide。',
    note:'本例的薄氧化層不作植入開窗；離子可以穿過它。氧化會消耗部分矽，虛線標出原表面；膜厚已誇大。',
    materials:[['矽 Si','#536b86'],['二氧化矽 SiO₂','#22b9de']],
    phases:[phase(0,'加熱與供氧','氧氣與矽表面反應，並非灑粉或堆積顆粒。'),phase(.16,'矽表面反應','薄氧化層在原表面上下生長，同時消耗部分矽。'),phase(.9,'保留薄保護層','青色薄層將完整保留，接下來只在光阻定義植入區。')] },
  { name:'植入光阻微影', en:'IMPLANT LITHOGRAPHY', duration:21, view:'section',
    description:'使用厚正型光阻定義植入區：塗佈、烘烤、曝光，再由顯影液移除受光區。底下薄氧化層維持完整。',
    note:'這裡把光罩圖案直接對齊剖面開口，以說明遮光關係；投影透鏡與縮小倍率省略。',
    materials:[['矽','#536b86'],['SiO₂','#22b9de'],['未曝光光阻','#a96bdd'],['已曝光光阻','#f4b45d']],
    phases:[phase(0,'塗佈厚光阻','厚紫色光阻覆蓋薄 SiO₂，作為接下來的植入遮罩。'),phase(.23,'光罩選擇曝光','只有透明開口下的光阻變橙色；曝光改變溶解性，厚度仍相同。'),phase(.53,'移開曝光裝置','曝光完成，橙色光阻尚未被移除。'),phase(.65,'顯影、沖洗','顯影只移除受光光阻，底下青色薄 SiO₂ 沒有開孔。')] },
  { name:'7° 斜向離子植入', en:'TILTED ION IMPLANT', duration:20, view:'section',
    description:'高動能離子相對表面法線傾斜 7°，穿過薄氧化層進入 Si(100)。厚光阻阻擋保護區，碰撞同時造成表面附近與內部晶格損傷。',
    note:'偏離主要晶軸可減少 channeling 的深尾；7° 是本例設定，實際角度、twist、深度依離子種類與能量調整。剖面原子排列僅為損傷示意。',
    materials:[['薄 SiO₂（不開窗）','#22b9de'],['厚光阻遮罩','#a96bdd'],['植入離子','#e394ed'],['晶格損傷','#ff9b71']],
    phases:[phase(0,'厚光阻限定植入區','兩個開口只存在於光阻；青色氧化層連續覆蓋矽。'),phase(.12,'斜向加速植入','箭頭與離子沿真實 7° 方向運動；保護區離子停在厚光阻，開口內離子穿過薄氧化層。'),phase(.45,'累積碰撞與晶格損傷','紫點停在矽內，橙色矽原子偏離原位；虛線十字標出空缺位置。'),phase(.94,'停止離子束','摻雜與損傷留下，光阻、薄氧化層仍保留，尚未退火。')] },
  { name:'去光阻與退火', en:'STRIP THEN ANNEAL', duration:18, view:'section',
    description:'植入後先去除厚光阻，再進行退火，修復受損晶格並活化摻雜。薄保護氧化層保留到後續 contact 開窗。',
    note:'先去光阻、後退火。原子回到規則位置表示損傷修復，植入原子仍在矽內；本例省略微小擴散，不以加熱另長一層膜。',
    materials:[['保留的薄 SiO₂','#22b9de'],['植入原子','#e394ed'],['晶格損傷','#ff9b71']],
    phases:[phase(0,'植入後狀態','厚光阻尚在；薄氧化層完整，植入區有晶格損傷。'),phase(.08,'去除植入光阻','灰化／清洗移除剩餘光阻，薄氧化層保留。'),phase(.46,'退火修復與活化','光阻已清除才開始加熱；晶格逐漸恢復規則排列，摻雜被活化。'),phase(.94,'保留薄氧化層','冷卻後的薄層不先剝除，下一步接觸孔蝕刻時一起打開。')] },
  { name:'W 接觸孔', en:'TUNGSTEN CONTACT', duration:25, view:'section',
    description:'沉積接觸介電層，再以另一道微影定義 contact。蝕刻同時穿過介電層與原先保留的薄氧化層，建立接觸介面、liner，填 W 並平坦化。',
    note:'本例用 W contact 接矽中的植入區，再接上層金屬。silicide／接觸介面與 Ti/TiN liner 合併簡化示意，未展開介面反應；完整元件與閘極省略。',
    materials:[['SiO₂ 介電層','#78aaba'],['接觸介面／liner','#b6bfc9'],['鎢 W','#d7e0e8']],
    phases:[phase(0,'沉積接觸介電層','薄 screen oxide 留在矽表面，上方沉積接觸介電層。'),phase(.13,'另一次接觸孔微影','顯影後光阻限定接觸孔，這次才要蝕刻氧化層。'),phase(.23,'向下蝕刻到矽','接觸孔底面下降，最後連原先薄 SiO₂ 一起打開。'),phase(.48,'去光阻、形成接觸介面','移除本次光阻，再形成簡化的接觸介面與 liner。'),phase(.64,'沉積 W 填孔','W 沿孔內表面成長並覆蓋頂面。'),phase(.83,'W CMP','移除場區多餘 W 與 liner，留下埋在介電層的 W 接點。')] },
  { name:'銅開孔與種子層', en:'CU BARRIER & SEED', duration:24, view:'section',
    description:'在 W contact 上方增加互連氧化層，另經微影與蝕刻形成溝槽、via。先覆蓋銅擴散阻障層，再整面沉積連續導電 seed layer。',
    note:'種子層必須覆蓋場區頂面、溝槽與 via 側壁及孔底。下方是 W 接點，Cu 不直接接觸 Si。本例選銅鑲嵌互連；較早期 M1 常採鋁導線。',
    materials:[['互連氧化層','#78aaba'],['W contact','#d7e0e8'],['阻障層','#8c97ae'],['Cu seed','#ffe0a3']],
    phases:[phase(0,'沉積互連氧化層','介電層長在已平坦化的 W contact 上。'),phase(.16,'微影、蝕刻溝槽','另一輪圖案轉移使溝槽底面下降；本步省略重複的曝光顯影動畫。'),phase(.30,'via 開到 W 接點','兩個 via 繼續向下，停在 W 頂面，不延伸進矽。'),phase(.50,'整面阻障層','薄阻障層覆蓋孔槽各表面，阻隔 Cu 擴散。'),phase(.67,'整面連續 seed layer','金色薄種子層沿頂面、側壁、孔底連成導電路徑，準備電鍍。')] },
  { name:'整面銅電鍍', en:'BLANKET CU PLATING', duration:20, view:'section',
    description:'Cu²⁺ 在導電 seed 表面還原成 Cu。頂面、孔底與側壁都鍍上銅，鍍層向外增厚，填滿孔槽並形成整面過鍍層。',
    note:'本例平面鍍厚設為 via 深度的 1.75 倍，位於指定的 1.5–2 倍範圍。幾何以表面 offset 呈現；實際添加劑、超填充、接縫與空洞需另做電化學模擬。',
    materials:[['氧化層','#78aaba'],['連續 Cu seed','#ffe0a3'],['電鍍銅','#e9a060'],['W contact','#d7e0e8']],
    phases:[phase(0,'seed 連接陰極','孔槽內與頂面皆已有連續導電種子層。'),phase(.08,'所有種子表面一起鍍銅','箭頭表示鍍層向表面法線增厚：孔底向上、兩側向內、場區向上。'),phase(.48,'孔槽填充、表面持續增厚','孔內空間逐漸縮小，頂面同時形成過鍍銅。'),phase(.96,'達到示例鍍厚','平面鍍厚為 via 深度的 1.75 倍；銅仍整面覆蓋，下一步才 CMP。')] },
  { name:'銅 CMP 平坦化', en:'CU CMP TO OXIDE', duration:19, view:'section',
    description:'研磨墊配合漿料移除表面多餘銅，並清除場區 seed 與阻障層。研磨面下降到互連氧化層頂面後停止，留下孔槽內的銅線。',
    note:'終點是氧化層頂面：場區不殘留導電膜，孔槽內的 Cu 與阻障層保留。這是理想平坦化示意，未求解 dishing、erosion 或終點偵測。',
    materials:[['CMP 停止面：氧化層','#78aaba'],['孔槽內 Cu','#e9a060'],['W contact','#d7e0e8']],
    phases:[phase(0,'整面過鍍銅','表面仍被 Cu、seed 與阻障層覆蓋。'),phase(.08,'移除多餘導電膜','研磨面逐步下降，孔槽內銅保留。'),phase(.94,'停止於氧化層頂面','場區重新露出氧化層，銅線與氧化層齊平；下方經 W contact 連到矽。')] }
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
  if(index===4) return {...common,dose:ramp(p,.12,.94),beam:p>=.12&&p<.94,strip:0,anneal:0,oxideOpen:0};
  if(index===5) return {...common,dose:1,beam:false,strip:ramp(p,.08,.40),anneal:ramp(p,.46,.94),oxideOpen:0};
  if(index===6) return {...common,dielectric:ramp(p,0,.13),mask:ramp(p,.13,.20),etch:ramp(p,.23,.46),strip:ramp(p,.48,.56),liner:ramp(p,.57,.63),fill:ramp(p,.64,.81),polish:ramp(p,.83,.98)};
  if(index===7) return {...common,dielectric:ramp(p,0,.12),trench:ramp(p,.16,.30),via:ramp(p,.30,.45),barrier:ramp(p,.50,.65),seed:ramp(p,.67,.96),plating:0,polish:0};
  if(index===8) return {...common,dielectric:1,trench:1,via:1,barrier:1,seed:1,plating:ramp(p,.08,.96),polish:0};
  return {...common,dielectric:1,trench:1,via:1,barrier:1,seed:1,plating:1,polish:ramp(p,.08,.94)};
}

export function resistHeight(state,open) {
  return RESIST.thickness*state.coat*(open ? 1-state.develop : 1);
}
export function sample01(seed,stream=0) {
  let x=(Math.round(seed*104729)^Math.imul(stream+1,0x9e3779b9))|0;
  x=Math.imul(x^(x>>>16),0x21f0aaad);
  x=Math.imul(x^(x>>>15),0x735a2d97);
  return ((x^(x>>>15))>>>0)/4294967296;
}
export function implantPath(xAtMask,seed=0) {
  const slope=Math.tan(IMPLANT.tilt*Math.PI/180),maskTop=RESIST.bottom+RESIST.thickness;
  let stopY=maskTop-.12,blocked=!inOpening(xAtMask);
  if(!blocked){
    const [,right]=WINDOWS.find(([l,r])=>xAtMask>l&&xAtMask<r);
    const sideY=maskTop-(right-xAtMask)/slope;
    if(sideY>RESIST.bottom){stopY=sideY;blocked=true;}
    else {
      const u=sample01(seed,1),v=sample01(seed,2);
      const normal=Math.sqrt(-2*Math.log(.001+.998*u))*Math.cos(2*Math.PI*v);
      stopY=-.27+.05*Math.max(-2.5,Math.min(2.5,normal));
    }
  }
  const atY=y=>xAtMask+(maskTop-y)*slope;
  return {blocked,start:[atY(IMPLANT.sourceY),IMPLANT.sourceY],stop:[atY(stopY),stopY],atY};
}
export function contactProfile(){return SECTIONS.map(s=>({...s,height:s.open?OXIDE.bottom:CONTACT.top}));}
export function copperProfile(s={dielectric:1,trench:1,via:1}) {
  const top=CONTACT.top+(CU.top-CONTACT.top)*s.dielectric;
  return SECTIONS.map(section=>({...section,height:Math.max(CONTACT.top,top-(section.left>=-1.8&&section.right<=1.8?(CU.top-CU.floor)*s.trench:0)-(section.open?CU.viaDepth*s.via:0))}));
}
// Rectangular surface offset, clipped to the CMP plane. All coating geometry is
// derived from this profile: top, floor AND both walls, never a bottom-only fill.
export function coatingRects(profile,outer,inner=0,ceiling=Infinity) {
  if(outer<=inner+.000001)return [];
  const left=profile[0].left,right=profile.at(-1).right;
  const xs=[...new Set(profile.flatMap(s=>[s.left,s.right,...[outer,inner].flatMap(t=>[s.left-t,s.left+t,s.right-t,s.right+t])]).map(x=>Math.max(left,Math.min(right,x))))].sort((a,b)=>a-b);
  const height=(x,t)=>Math.max(...profile.filter(s=>s.left<x+t&&s.right>x-t).map(s=>s.height))+t;
  return xs.slice(0,-1).flatMap((l,i)=>{
    const r=xs[i+1],x=(l+r)/2,bottom=height(x,inner),top=Math.min(ceiling,height(x,outer));
    return top>bottom+.000001?[{left:l,right:r,bottom,top}]:[];
  });
}
