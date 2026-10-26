const assert=require('node:assert/strict');
const tables=require('../apps/baseball-cfd/flow_tables.js');
const BA=require('../apps/baseball-cfd/physics.js');
const T=require('../apps/baseball-cfd/lib/three.min.js');
const ballVisual=require('../apps/baseball-cfd/ball.js');
const {flightPoints,displayPoints}=require('../apps/baseball-cfd/trajectory.js');
assert.ok(Math.abs(tables.fs.fpp0[25]-.4696)<1e-6,'Blasius wall shear');
assert.ok(Math.abs(tables.fs.fpp0[45]-1.232588)<1e-6,'Hiemenz wall shear');
assert.ok(Math.abs(tables.tmpl.lam[0]-.05625)<1e-12,'axisymmetric stagnation limit');
assert.ok(tables.fs.lam.every((v,i,a)=>!i||v>a[i-1]),'profile interpolation must be monotone');
console.log('JavaScript Falkner-Skan and Thwaites limits: PASS');
for(const height of [.0005,.0009,.0014]) {
  const model=new BA.Model({ball:BA.makeBall({seam_height:height})});
  const visual=ballVisual.build(T,model),vertices=visual.stitch.geometry.getAttribute('position');
  assert.equal(vertices.count,108*2*10*8,'108 double stitches');
  let max=0;for(let i=0;i<vertices.count;i++)max=Math.max(max,Math.hypot(vertices.getX(i),vertices.getY(i),vertices.getZ(i)));
  assert.ok(Math.abs((max-1)*model.ball.R-height)<.000002,'rendered crest height disagrees with the physical parameter');
  const normals=visual.stitch.geometry.getAttribute('normal').array;assert.ok(normals.every(Number.isFinite));visual.dispose();
}
console.log('108 double stitches and parameter-scaled seam heights: PASS');
const model=new BA.Model(),s=BA.pitchSummary(model,{speed_mph:93,spin_rpm:2150,break_clock:10,gyro_deg:65,ball_axis:'x',roll_deg:20});
const entry=tr=>({traj:tr.pos,plate:BA.atPlaneY(tr,BA.PLATE_FRONT_Y)[1]});
const points=flightPoints(entry(s.traj)),reference=flightPoints(entry(s.ref)),original=JSON.stringify(points);
assert.deepEqual(points.at(-1),entry(s.traj).plate);
assert.deepEqual(displayPoints(points,reference,1),points);
const scaled=displayPoints(points,reference,5);
assert.equal(JSON.stringify(points),original);
assert.deepEqual(scaled.map(p=>p[1]),points.map(p=>p[1]));
for(const axis of [0,2])assert.ok(Math.abs((scaled.at(-1)[axis]-reference.at(-1)[axis])-5*(points.at(-1)[axis]-reference.at(-1)[axis]))<1e-12);
console.log('Exact plate endpoint, display scaling and immutable solver results: PASS');
// The UI previously aimed a straight line at 2.5 ft and then let gravity pull
// every preset below it. Verify the actual integrated endpoint, not a shifted
// drawing or a separately aimed control trajectory.
const MLB=require('../apps/baseball-cfd/mlb.js'),report=[];
assert.equal(MLB.presets.length,8);
assert.equal(MLB.get('FF').pitch.raw.release_speed,101.1);
for(const p of MLB.presets){
  assert.ok(p.fit_residual_m<.002,p.id+': 50-ft coordinate reconstruction failed');
  assert.ok(Math.abs(p.derived_release_speed_mph-p.spec.speed_mph)<.12,'reported release speed and reconstructed speed disagree');
  assert.equal(p.reference.plate[1],BA.PLATE_FRONT_Y);
  const rs=BA.releaseState(p.spec),raw=p.pitch.raw;
  assert.deepEqual(rs.pos0,[raw.release_pos_x*.3048,raw.release_pos_y*.3048,raw.release_pos_z*.3048]);
  const angle=Math.atan2(rs.w[2],rs.w[0])-raw.spin_axis*Math.PI/180;
  assert.ok(Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))<1e-12,'3-D reconstruction changed the measured x-z spin projection');
  const m=new BA.Model({liftLaw:'nathan2020b',cdReference:p.CD_equivalent});
  const s=BA.pitchSummary(m,p.spec),error=Math.hypot(s.plate_x_ft*.3048-p.observed_plate[0],s.plate_z_ft*.3048-p.observed_plate[2]);
  assert.ok(error<.6096,'catastrophic discrepancy > 24 in; inspect model and coordinates');
  const empirical=BA.pitchSummary(new BA.Model({aeroReference:p.aeroReference,cdReference:p.CD_equivalent}),p.spec);
  const empiricalError=Math.hypot(empirical.plate_x_ft*.3048-p.observed_plate[0],empirical.plate_z_ft*.3048-p.observed_plate[2]);
  assert.ok(empiricalError<.0508,p.id+': aggregate-force consistency error exceeds 2 in');
  report.push({id:p.id,game:raw.game_pk,atBat:raw.at_bat_number,pitch:raw.pitch_number,velocity_mph:raw.release_speed,reconstruction_mm:p.fit_residual_m*1000,empirical_error_in:empiricalError/.0254,mechanism_error_in:error/.0254});
}
const v=[0,-40,-1],w=[-200,0,0];
const fixed=air=>new BA.Model({air,useSeam:false,liftLaw:'nathan2020b',cdReference:.35});
const sea=BA.airFromConditions(20,0,0),hot=BA.airFromConditions(35,0,0),humid=BA.airFromConditions(20,1,0),high=BA.airFromConditions(20,0,2000);
assert.ok(hot.rho<sea.rho&&humid.rho<sea.rho&&high.rho<sea.rho,'density trends are wrong');
assert.ok(hot.mu>sea.mu,'Sutherland temperature trend');
for(const key of ['p','rho','mu','nu'])assert.equal(BA.airFromConditions(20,.5,0,95000)[key],BA.airFromConditions(20,.5,2000,95000)[key],'station pressure must override altitude');
const fSea=fixed(sea).forces(v,w,null).force;
for(const air of [hot,humid,high]){const f=fixed(air).forces(v,w,null).force;assert.ok(Math.abs(BA.vec.norm(f)/BA.vec.norm(fSea)-air.rho/sea.rho)<1e-12,'aerodynamic force must scale with density at fixed coefficients');}
const m=fixed(sea),start=[0,16.5,1.8],zero=[0,0,0];
const trajectory=wind=>BA.integrate(m,start,[0,-40,0],zero,null,{dt:.001,stopY:BA.PLATE_FRONT_Y,wind});
const calm=trajectory(zero),cross=trajectory([5,0,0]),head=trajectory([0,5,0]);
assert.ok(BA.atPlaneY(cross,BA.PLATE_FRONT_Y)[1][0]>BA.atPlaneY(calm,BA.PLATE_FRONT_Y)[1][0],'crosswind sign');
assert.ok(BA.atPlaneY(head,BA.PLATE_FRONT_Y)[0]>BA.atPlaneY(calm,BA.PLATE_FRONT_Y)[0],'headwind must increase travel time');
assert.ok(Math.abs(m.forces([0,-40,0],[-200,0,0],null).CL-.336*(1-Math.exp(-6.041*200*.037/40)))<1e-12,'Nathan 2020 Eq. 10');
const p=MLB.get('CU'),aimModel=new BA.Model({liftLaw:'nathan2020b',cdReference:p.CD_equivalent});
const aimed=BA.aimPitch(aimModel,p.spec,{x_ft:0,z_ft:(p.zone.bottom+p.zone.top)/2/.3048},{wind:[3,0,0]});
assert.ok(aimed.converged,'optional educational aim must also include wind');
console.table(report.map(p=>({...p,reconstruction_mm:+p.reconstruction_mm.toFixed(3),empirical_error_in:+p.empirical_error_in.toFixed(3),mechanism_error_in:+p.mechanism_error_in.toFixed(3)})));
const fs=require('node:fs'),path=require('node:path');
const reportDir=path.resolve(process.env.BASEBALL_CFD_TEST_ARTIFACT_DIR||'scratch/baseball-cfd');fs.mkdirSync(reportDir,{recursive:true});
fs.writeFileSync(path.join(reportDir,'model-validation.json'),JSON.stringify({scope:MLB.data.scope,notIndependentValidation:true,pitches:report,environment:{density:true,viscosity:true,stationPressureOverride:true,wind:true}},null,2));
console.log('MLB reconstruction, spin projection, cited lift law, environmental response and optional aim with wind: PASS');
