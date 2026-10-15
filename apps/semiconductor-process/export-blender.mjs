// Emit the same final cut-section solids used by the browser, in Three.js axes.
import {SECTIONS,WINDOWS,OXIDE,CONTACT,CU,contactProfile,copperProfile,coatingRects,implantPath} from './process-model.mjs';
const solids=[],markers=[];
const add=(name,color,left,right,bottom,top)=>solids.push({name,color,size:[right-left,top-bottom,1.8],position:[(left+right)/2,(bottom+top)/2,-.9]});
add('Silicon substrate','#536b86',-2.8,2.8,-1.14,OXIDE.bottom);
for(const s of SECTIONS){
  if(!s.open){
    add('Retained screen oxide','#22b9de',s.left,s.right,OXIDE.bottom,OXIDE.top);
    add('Contact oxide','#78aaba',s.left,s.right,OXIDE.top,CONTACT.top);
  }
}
const coat=(name,color,profile,outer,inner,ceiling)=>coatingRects(profile,outer,inner,ceiling).forEach(r=>add(name,color,r.left,r.right,r.bottom,r.top));
coat('Contact interface and liner','#b6bfc9',contactProfile(),CONTACT.liner,0,CONTACT.top);
coat('W contact','#d7e0e8',contactProfile(),CONTACT.liner+CONTACT.deposition,CONTACT.liner,CONTACT.top);
for(const s of copperProfile())if(s.height>CONTACT.top)add('Interconnect oxide','#78aaba',s.left,s.right,CONTACT.top,s.height);
coat('Cu diffusion barrier','#8c97ae',copperProfile(),CU.barrier,0,CU.top);
coat('Cu seed','#ffe0a3',copperProfile(),CU.barrier+CU.seed,CU.barrier,CU.top);
coat('Embedded Cu interconnect','#e9a060',copperProfile(),CU.barrier+CU.seed+CU.plating,CU.barrier+CU.seed,CU.top);
WINDOWS.forEach(([left,right])=>{for(let i=0;i<45;i++){
  const path=implantPath(left+.10+(right-left-.26)*(i*.61803398875%1),i*.41421356237);
  markers.push({position:[...path.stop,.025],radius:.022,color:'#e394ed'});
}});
process.stdout.write(JSON.stringify({solids,markers},null,2));
