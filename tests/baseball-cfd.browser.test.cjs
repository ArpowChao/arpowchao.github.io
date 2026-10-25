// Run against a static HTTP server with BASEBALL_CFD_TEST_URL; requires Playwright.
// Dev dependency: playwright; production HTML needs no Node or Python.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const output=path.resolve(process.env.BASEBALL_CFD_TEST_ARTIFACT_DIR||'scratch/baseball-cfd');
const base=process.env.BASEBALL_CFD_TEST_URL||'http://127.0.0.1:4177/apps/baseball-cfd/index.html';
fs.mkdirSync(output,{recursive:true});
const pause=()=>new Promise(resolve=>setTimeout(resolve,120));

async function audit(page,label) {
  const failures=await page.evaluate(()=>{
    const errors=[],visible=el=>el.getClientRects().length>0;
    if(document.documentElement.scrollWidth>innerWidth+1)errors.push('page horizontal overflow');
    for(const el of document.querySelectorAll('.app,.controls,.right,.tool,.ctl label,.traj-head,.traj-toolbar,.traj-toolbar .seg,.traj-toolbar label,.traj-body,#trajLegend,#trajLegend label')){
      if(!visible(el))continue;const style=getComputedStyle(el);
      if(['grid','flex','inline-grid','inline-flex'].includes(style.display)&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))errors.push('anonymous grid/flex text: '+el.className);
      if(el.scrollWidth>el.clientWidth+2)errors.push('component overflow: '+el.className);
    }
    for(const el of document.querySelectorAll('#trajLegend span,.traj-info .note,#trajScaleNote,.traj-head h2')){
      if(!visible(el))continue;const style=getComputedStyle(el);
      if(el.getBoundingClientRect().width<120)errors.push('unreadably narrow: '+el.id+' '+el.tagName);
      if(style.writingMode!=='horizontal-tb'||style.wordBreak==='break-all')errors.push('bad typography');
      if(el.scrollWidth>el.clientWidth+2)errors.push('prose overflow: '+el.id);
    }
    return errors;
  });
  assert.deepEqual(failures,[],label+': '+failures.join(', '));
}
async function ready(page) {
  await page.waitForFunction(()=>!document.querySelector('#openTrajectory').disabled&&document.querySelector('#cmpTxt').textContent.length>0,null,{timeout:90000});
}
async function state(page) {return page.evaluate(()=>{const v=document.querySelector('#trajectoryDialog').viewer;return {camera:v.camera.position.toArray(),target:v.target.toArray(),distance:v.camera.position.distanceTo(v.target),scale:v.factor,plate:v.comparison.full.plate.slice()};});}
async function main() {
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const report={};
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});
    const errors=[],requests=[];
    context.on('request',r=>requests.push({url:r.url(),method:r.method()}));
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base,{waitUntil:'networkidle'});await ready(page);
    assert.equal(await page.evaluate(()=>BA_TABLES.source),'javascript-rk4-shooting-and-thwaites');
    assert.ok(Math.abs(await page.evaluate(()=>BA_TABLES.fs.fpp0[25])-.4696)<1e-6);
    assert.ok(page.workers().length>0,'real Web Worker was not started');
    await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
    await page.locator('#openTrajectory').click();await pause();
    assert.equal(await page.locator('#trajLegend input').count(),4);
    assert.equal(await page.locator('[data-traj-view]').count(),6);
    const redPixels=await page.evaluate(()=>{
      const v=document.querySelector('#trajectoryDialog').viewer;v.renderer.render(v.scene,v.camera);
      const c=document.createElement('canvas');c.width=v.canvas.width;c.height=v.canvas.height;
      const g=c.getContext('2d');g.drawImage(v.canvas,0,0);const pixels=g.getImageData(0,0,c.width,c.height).data;
      let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>150&&pixels[i]>pixels[i+1]*1.6&&pixels[i]>pixels[i+2]*1.4)count++;return count;
    });
    assert.ok(redPixels>1000,'the trajectory itself is missing (only endpoint markers were rendered)');
    const box=await page.locator('.traj-scene canvas').boundingBox();
    const before=await state(page),cx=box.x+box.width*.5,cy=box.y+box.height*.55;
    await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+70,cy+35,{steps:8});await page.mouse.up();await pause();
    let after=await state(page);assert.notDeepEqual(after.camera,before.camera);assert.ok(Math.abs(after.distance-before.distance)<1e-6);
    await page.mouse.wheel(0,150);await pause();const zoomed=await state(page);assert.ok(zoomed.distance>after.distance);
    await page.keyboard.down('Control');await page.mouse.down();await page.mouse.move(cx+110,cy+50,{steps:5});await page.mouse.up();await page.keyboard.up('Control');await pause();
    assert.notDeepEqual((await state(page)).target,zoomed.target);
    for(const key of ['pitcher','catcher','side','top','plate','oblique']){await page.locator(`[data-traj-view="${key}"]`).click();assert.equal(await page.locator(`[data-traj-view="${key}"]`).getAttribute('aria-pressed'),'true');}
    const table=await page.locator('#trajTable').innerText();
    await page.locator('#trajScale').selectOption('5');await pause();assert.equal(await page.locator('#trajTable').innerText(),table);
    assert.deepEqual((await state(page)).plate,before.plate);
    assert.ok(await page.evaluate(()=>{const v=document.querySelector('#trajectoryDialog').viewer;return Math.abs(v.paths.full.at(-1)[1]-v.comparison.full.plate[1])<1e-12;}));
    const check=page.locator('#trajLegend input[data-case="full"]');await check.uncheck();
    assert.equal(await page.evaluate(()=>document.querySelector('#trajectoryDialog').viewer.objects.full[0].visible),false);await check.check();
    await page.locator('[data-traj-view="plate"]').click();await pause();await page.locator('#trajectoryDialog').screenshot({path:path.join(output,'plate-comparison.png')});
    await page.locator('#trajScale').selectOption('1');await page.locator('[data-traj-view="oblique"]').click();
    await page.keyboard.press('Escape');assert.equal(await page.locator('#trajectoryDialog').evaluate(d=>d.open),false);
    const oldPlate=(await state(page)).plate;
    await page.locator('#presets button').filter({hasText:'曲球'}).click();await ready(page);await page.locator('#openTrajectory').click();await pause();
    assert.notDeepEqual((await state(page)).plate,oldPlate,'new JS calculation did not update trajectory');
    const source=await page.evaluate(()=>JSON.stringify(document.querySelector('#trajectoryDialog').viewer.comparison));
    for(const width of [320,390,768,1024,1440]) {
      await page.setViewportSize({width,height:1000});await pause();await audit(page,'modal '+width);
      assert.equal(await page.evaluate(()=>JSON.stringify(document.querySelector('#trajectoryDialog').viewer.comparison)),source);
      if(width===320||width===1440)await page.locator('#trajectoryDialog').screenshot({path:path.join(output,`trajectory-${width}.png`)});
      await page.locator('#closeTrajectory').click();await pause();await audit(page,'page '+width);
      assert.equal(await page.locator('#plotCmp').evaluate(c=>c.style.height),'300px','DPR resize multiplied the 2D canvas height');
      if(width===320)await page.locator('#stage').screenshot({path:path.join(output,'wind-tunnel-320.png')});
      await page.locator('#openTrajectory').click();await pause();
    }
    await page.setViewportSize({width:390,height:900});await pause();
    const touchBox=await page.locator('.traj-scene canvas').boundingBox(),tx=touchBox.x+touchBox.width/2,ty=touchBox.y+touchBox.height/2;
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    const oldDistance=(await state(page)).distance;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx-25,y:ty,id:1},{x:tx+25,y:ty,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx-50,y:ty,id:1},{x:tx+50,y:ty,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause();assert.ok((await state(page)).distance<oldDistance,'touch pinch did not zoom');
    assert.ok(requests.every(r=>r.method==='GET'),'server-side calculation request detected');
    assert.ok(!requests.some(r=>/\/tables\.js|\.py(?:\?|$)|\/api\//.test(r.url)),'legacy Python output/API was requested');
    assert.deepEqual(errors,[]);
    report.browser={worker:true,orbit:true,zoom:true,pan:true,pinch:true,presets:6,cases:4,liveJSRecalculation:true,viewports:[320,390,768,1024,1440],noPythonRequests:true};
    await context.close();

    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
