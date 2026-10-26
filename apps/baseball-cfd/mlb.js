/* Statcast 2025 coordinates: x catcher's right, y toward mound, z up.
 * vx0/vy0/vz0 and ax/ay/az refer to the 50-ft nine-parameter fit.
 * release_pos_* are rounded observations. Never treat the 50-ft velocity
 * as the release velocity or force the result into a chosen strike zone. */
(function(root){
  'use strict';
  const FT=.3048,MPH=.44704,G=9.80665;
  const data=root.BA_MLB_DATA||(typeof require!=='undefined'?require('./mlb_data.js'):null);
  const length=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  function timeAtY(r,y){
    const delta=y-50,disc=r.vy0*r.vy0+2*r.ay*delta;
    if(!(disc>0))throw Error('Statcast trajectory does not cross plane');
    return 2*delta/(r.vy0-Math.sqrt(disc));
  }
  function reconstruct(pitch){
    const r=pitch.raw,tRelease=timeAtY(r,r.release_pos_y),tPlate=timeAtY(r,17/12);
    const v50=[r.vx0,r.vy0,r.vz0],a=[r.ax,r.ay,r.az];
    const release=[r.release_pos_x,r.release_pos_y,r.release_pos_z];
    const at=t=>release.map((x,i)=>x+v50[i]*(t-tRelease)+.5*a[i]*(t*t-tRelease*tRelease));
    const velocity=t=>v50.map((v,i)=>v+a[i]*t);
    const vRelease=velocity(tRelease),V=length(vRelease),duration=tPlate-tRelease;
    const times=Array.from({length:161},(_,i)=>tRelease+duration*i/160);
    const pos=times.map(t=>at(t).map(v=>v*FT));
    const plate=at(tPlate).map(v=>v*FT);plate[1]=17/12*FT;pos[pos.length-1]=plate.slice();
    const vm=velocity((tRelease+tPlate)/2).map(v=>v*FT),Vmid=length(vm),vh=vm.map(v=>v/Vmid);
    const aAir=a.map(v=>v*FT);aAir[2]+=G;
    const ad=dot(aAir,vh),trans=aAir.map((v,i)=>v-ad*vh[i]);
    // Equivalent active spin, assuming all transverse acceleration is Magnus.
    // SSW and unknown gyro make this an estimate, not a measured 3-D axis.
    const rho=1.19887,A=Math.PI*(.074/2)**2,q=.5*rho*A*Vmid**2;
    const CL=length(trans)*.145/q,CD=-ad*.145/q;
    const effectiveS=-Math.log(Math.max(1e-6,1-CL/.336))/6.041;
    const efficiency=Math.min(1,Math.max(0,effectiveS*Vmid/(r.release_spin_rate*2*Math.PI/60*.037)));
    const spec={speed_mph:r.release_speed,spin_rpm:r.release_spin_rate,
      break_clock:((12-(r.spin_axis-180)/30)%12+12)%12,
      spin_axis_deg:r.spin_axis,handedness:r.p_throws,
      gyro_deg:Math.asin(efficiency)*180/Math.PI,
      release_height_ft:r.release_pos_z,release_side_ft:r.release_pos_x,
      extension_ft:60.5-r.release_pos_y,launch_elevation_deg:Math.asin(vRelease[2]/V)*180/Math.PI,
      launch_azimuth_deg:Math.atan2(vRelease[0],-vRelease[1])*180/Math.PI,
      ball_axis:r.pitch_type==='SI'||r.pitch_type==='CH'||r.pitch_type==='FS'?'x':'z',roll_deg:0};
    const observed=[r.plate_x*FT,17/12*FT,r.plate_z*FT];
    return {id:pitch.id,pitch,spec,velocity_release_mps:vRelease.map(v=>v*FT),derived_release_speed_mph:V*FT/MPH,
      time_release_at_50ft:tRelease,CD_equivalent:CD,CL_equivalent:CL,efficiency_estimate:efficiency,
      aeroReference:{CD,CL,side:trans.map(v=>v/length(trans))},
      reference:{traj:pos,plate,time:duration},observed_plate:observed,
      fit_residual_m:Math.hypot(plate[0]-observed[0],plate[2]-observed[2]),
      zone:{bottom:r.sz_bot*FT,top:r.sz_top*FT,halfWidth:8.5*.0254},
      game_url:'https://baseballsavant.mlb.com/gamefeed?gamePk='+r.game_pk};
  }
  const presets=data.pitches.map(reconstruct);
  const api={data,presets,reconstruct,timeAtY,get:id=>presets.find(p=>p.id===id)};
  root.BAMLB=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
