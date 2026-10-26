// Reproducible selection of individual tracked MLB pitches, never synthetic averages.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=path.resolve(__dirname,'../scratch/statcast-2025-06-01.csv');
function csv(text){let rows=[],row=[],v='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){v+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(v);v='';}else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(v);if(row.some(Boolean))rows.push(row);row=[];v='';}else v+=c;}if(v||row.length){row.push(v);rows.push(row);}const headers=rows.shift();return rows.map(r=>Object.fromEntries(headers.map((k,i)=>[k,r[i]])));}
const raw=fs.readFileSync(input,'utf8'),rows=csv(raw.replace(/^\uFEFF/,''));
const numeric=['pitcher','game_pk','at_bat_number','pitch_number','release_speed','release_pos_x','release_pos_y','release_pos_z','release_extension','vx0','vy0','vz0','ax','ay','az','plate_x','plate_z','sz_bot','sz_top','release_spin_rate','spin_axis'];
const valid=rows.filter(r=>numeric.every(k=>r[k]!==''&&Number.isFinite(+r[k]))&&r.p_throws==='R');
const choices=[['FF','四縫線速球','Martinez, Justin'],['SI','二縫線伸卡','Martinez, Justin'],['ST','橫掃滑球','Taillon, Jameson'],['SL','滑球','Castillo, Luis'],['CU','曲球','Morton, Charlie'],['CH','變速球','Paddack, Chris'],['FS','指叉球','Bradley, Taj'],['FC','卡特球','Taillon, Jameson']];
const pitches=choices.map(([type,label,pitcher])=>{
  const group=valid.filter(r=>r.pitch_type===type&&r.player_name===pitcher);
  if(!group.length)throw Error('Missing pitcher/type '+pitcher+' '+type);
  const speed=group.map(r=>+r.release_speed).sort((a,b)=>a-b),median=speed[Math.floor(speed.length/2)];
  const strikes=group.filter(r=>Math.abs(+r.plate_x)<.65&&+r.plate_z>+r.sz_bot+.1&&+r.plate_z<+r.sz_top-.1);
  const candidates=strikes.length?strikes:group;
  candidates.sort((a,b)=>Math.abs(+a.release_speed-median)-Math.abs(+b.release_speed-median)||+a.at_bat_number-+b.at_bat_number||+a.pitch_number-+b.pitch_number);
  const r=type==='FF'?group.find(r=>+r.release_speed===101.1&&+r.at_bat_number===66&&+r.pitch_number===1):candidates[0];
  if(!r)throw Error('Missing selected fastball');
  return {id:type,label,sample_count:group.length,selection:type==='FF'?'指定當日 101.1 mph called strike 個案':'當日該投手球種、好球帶內、最接近當日球速中位數的單球；並非聯盟平均',raw:Object.fromEntries(['game_date','player_name','pitch_type','pitch_name','p_throws','description',...numeric].map(k=>[k,numeric.includes(k)?+r[k]:r[k]]))};
});
const data={version:1,source:'MLB Baseball Savant Statcast Search',source_url:'https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&player_type=pitcher&game_date_gt=2025-06-01&game_date_lt=2025-06-01&hfGT=R%7C&group_by=name&sort_col=pitches&sort_order=desc&min_pitches=0',documentation:'https://baseballsavant.mlb.com/csv-docs',retrieved:'2026-10-26',source_sha256:crypto.createHash('sha256').update(raw).digest('hex'),scope:'2025-06-01 MLB 例行賽的八顆右投個案，不代表聯盟平均或典型值',pitches};
fs.writeFileSync(path.resolve(__dirname,'../apps/baseball-cfd/mlb_data.js'),'// Official observations only. All coordinate conversions run in mlb.js.\n(function(root){const data='+JSON.stringify(data,null,2)+';root.BA_MLB_DATA=data;if(typeof module!=="undefined")module.exports=data;})(typeof window!=="undefined"?window:globalThis);\n');
console.log(pitches.map(p=>({id:p.id,pitcher:p.raw.player_name,speed:p.raw.release_speed,releaseHeight:p.raw.release_pos_z,game:p.raw.game_pk,atBat:p.raw.at_bat_number,pitch:p.raw.pitch_number,n:p.sample_count})));
