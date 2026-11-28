import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const site=resolve(dirname(fileURLToPath(import.meta.url)),'../../../_site');
const types={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.css':'text/css','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let path=resolve(site,'.'+pathname);if(pathname.endsWith('/'))path=resolve(path,'index.html');
  if(!path.startsWith(site+sep)){res.writeHead(403).end();return;}
  const bytes=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream'}).end(bytes);
 }catch{res.writeHead(404).end('Not found');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port;
const modelCatalog=JSON.parse(await readFile(resolve(site,'3d/lab-next/models/patients/catalog.json'),'utf8'));
const expectedGeometry=modelCatalog.active?'glb':'ellipsoid';
const arenaCatalog=JSON.parse(await readFile(resolve(site,'3d/lab-next/models/arenas/catalog.json'),'utf8'));
const expectedRingGeometry=arenaCatalog.ring?'glb':'native';
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1000,height:720}});
 const errors=[],external=[],modules=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text());});
 await page.route('**/*',route=>{if(route.request().url().startsWith(base+'/')){if(route.request().resourceType()==='script')modules.push(route.request().url());return route.continue();}external.push(route.request().url());return route.abort();});
 await page.goto(base+'/3d/lab-next/rig.html',{waitUntil:'domcontentloaded'});
 try{
  await page.waitForFunction(()=>document.getElementById('stats')?.dataset.state==='running'&&Number(document.getElementById('stats')?.dataset.tick)>2,{},{timeout:45000});
 }catch(e){throw new Error('Lab startup failed: '+await page.locator('#stats').innerText()+'; browser errors: '+errors.join('; '),{cause:e});}
 assert.equal(await page.locator('canvas').count(),1);
 assert.equal(await page.locator('#stats').getAttribute('data-segment-geometry'),expectedGeometry);
 assert.equal(await page.locator('#stats').getAttribute('data-camera-height'),'3');
 assert.equal(await page.locator('#stats').getAttribute('data-arena-geometry'),expectedRingGeometry);
 if(arenaCatalog.ring){
  const limits=JSON.parse(await page.locator('#stats').getAttribute('data-camera-fixture-radii'));
  assert.equal(limits.length,4);
  // Current GLB includes four named camera assemblies. Future models without
  // a fixture in a quadrant keep the native mount.
  for(let i=0;i<4;i++){
   await page.locator('#camera-mode').selectOption('corner-'+(i+1));
   await page.waitForFunction(mode=>document.getElementById('stats')?.dataset.camera===mode,'corner-'+(i+1));
   const mount=await page.locator('#stats').evaluate(el=>({x:Number(el.dataset.cameraX),z:Number(el.dataset.cameraZ),y:Number(el.dataset.cameraHeight)}));
   assert.equal(mount.y,3);
   if(limits[i]!==null)assert.ok(Math.hypot(mount.x,mount.z)<=limits[i]+1e-6,JSON.stringify({i,mount,limit:limits[i]}));
  }
  await page.locator('#camera-mode').selectOption('corner-1');
  assert.ok(Number(await page.locator('#stats').getAttribute('data-arena-visual-triangles'))>0);
  assert.ok(Number(await page.locator('#stats').getAttribute('data-arena-visual-meshes'))>0);
 }
 assert.match(await page.locator('#round-clock').textContent(),/^\d+:\d{2}$/);
 await page.waitForFunction(()=>/^\d+ FPS · CPU \d+%.*GPU/.test(document.querySelector('#frame-meter').textContent));
 assert.equal(await page.locator('#patient-hud .patient-card').count(),3);
 const openingSeed=await page.locator('#stats').getAttribute('data-seed');
 await page.locator('#reset').click();
 await page.waitForFunction(seed=>{
  const d=document.getElementById('stats')?.dataset;
  return d?.state==='running'&&d.seed!==seed&&Number(d.tick)>2;
 },openingSeed);
 assert.equal(await page.locator('#patient-hud .patient-card [data-segment]').count(),51);
 const assetRelease=await page.locator('#stats').getAttribute('data-build');
 const portraits=await page.evaluate(async release=>{
  const root='/releases/'+release+'/3d/lab-next/';
  const response=await fetch(root+'portraits/catalog.json');
  if(!response.ok)throw Error('Portrait catalog unavailable');
  const files=await response.json();
  const {loadPatientPortraits}=await import(root+'patient-portraits.js');
  const loaded=await loadPatientPortraits();
  return {expected:files.length,loaded:loaded.size};
 },assetRelease);
 assert.equal(portraits.loaded,portraits.expected,'every catalog portrait must decode');
 const audio=JSON.parse(await readFile(resolve(site,'3d/lab-next/audio/catalog.json'),'utf8'));
 assert.ok(audio.step&&audio.crit&&audio.womanPain7&&audio.detach2&&audio.victory);
 assert.ok(!audio.music&&!audio.menuMusic);
 for(const file of new Set(Object.values(audio)))assert.ok((await readFile(resolve(site,'3d/lab-next/audio',file))).length>0,file);

 if(modelCatalog.active){
  const pixels=await page.evaluate(async release=>{
   const root='/releases/'+release+'/3d/lab-next/';
   const T=await import(root+'vendor/three.module.js');
   const {loadPatientModel}=await import(root+'patient-model.js');
   const model=await loadPatientModel(),image=document.createElement('canvas');
   image.width=image.height=32;
   const ctx=image.getContext('2d');
   for(const [x,y,color] of [[0,0,'red'],[16,0,'lime'],[0,16,'blue'],[16,16,'white']]){
    ctx.fillStyle=color;ctx.fillRect(x,y,16,16);
   }
   const texture=new T.CanvasTexture(image);
   const input=new T.MeshStandardMaterial({map:texture});
   const head=model.create('head',.1541374,0,input,input);
   const face=head.getObjectByName('portrait');
   const box=face.geometry.boundingBox,center=box.getCenter(new T.Vector3());
   const {x:width,y:height}=box.getSize(new T.Vector3());
   const camera=new T.OrthographicCamera(-width/2,width/2,height/2,-height/2,.01,10);
   camera.position.copy(center);camera.position.z+=1;camera.lookAt(center);
   const scene=new T.Scene(),material=new T.MeshBasicMaterial({map:face.material.map});
   scene.add(new T.Mesh(face.geometry,material));
   const renderer=new T.WebGLRenderer(),target=new T.WebGLRenderTarget(32,32);
   try{
    renderer.setRenderTarget(target);renderer.render(scene,camera);
    return [[8,24],[24,24],[8,8],[24,8]].map(([x,y])=>{
     const pixel=new Uint8Array(4);
     renderer.readRenderTargetPixels(target,x,y,1,1,pixel);
     return [...pixel.slice(0,3)].map(value=>Number(value>127));
    });
   }finally{renderer.dispose();target.dispose();material.dispose();}
  },assetRelease);
  assert.deepEqual(pixels,[[1,0,0],[0,1,0],[0,0,1],[1,1,1]],'GLB portrait preserves top, bottom, left and right');
 }
 if(process.argv.includes('--assets-only')){
  // The initial checks already require active GLBs (no fallback), a
  // WebGL frame, working simulation, camera height, HUD and round reset.
  await page.locator('#camera-mode').selectOption('gopro');
  await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;return d.camera==='gopro'&&d.cameraEffects==='gopro';});
  await page.locator('#camera-mode').selectOption('third-person');
  await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;return d.camera==='third-person'&&d.cameraEffects==='gopro';},{},{timeout:30000});
  assert.equal(await page.locator('#gopro-angle').isEnabled(),false);
  for(const [id,geometry] of [['square','native'],['ring',expectedRingGeometry]]){
   await page.locator('#scenario').selectOption('location-'+id);
   await page.waitForFunction(([id,geometry])=>{const d=document.getElementById('stats').dataset;return d.state==='running'&&d.location===id&&d.arenaGeometry===geometry&&Number(d.tick)>3;},[id,geometry],{timeout:45000});
  }
  await page.goto(base+'/');
  await page.getByRole('link',{name:'Быстрый бой'}).click();
  await page.locator('#arena').selectOption('location-ring');
  await page.locator('#participants').selectOption('2');
  await page.locator('#start-match').click();
  await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.location==='ring'&&Number(d.tick)>3;},{},{timeout:45000});
  assert.equal(await page.locator('#stats').getAttribute('data-arena-geometry'),expectedRingGeometry);
  assert.equal(await page.locator('#stats').getAttribute('data-segment-geometry'),expectedGeometry);
  await page.goto(base+'/3d/lab-next/pose-editor.html');
  await page.waitForFunction(()=>document.getElementById('viewport')?.dataset.segments==='17',{},{timeout:45000});
  assert.equal(await page.locator('#viewport').getAttribute('data-geometry'),expectedGeometry);
  assert.ok(modules.length>0&&modules.every(url=>url.includes('/releases/'+assetRelease+'/')),JSON.stringify(modules));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('Visual-assets smoke passed: GLB, portraits, GoPro, arena switch, quick fight, pose editor.');
 }else{
 await page.locator('#support-debug').check();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.supportCount)>0);
 await page.locator('#support-debug').uncheck();
 const mounts=[];
 for(const n of [1,2,3,4]){
  await page.keyboard.press('Digit'+n);
  await page.waitForFunction(number=>document.getElementById('stats')?.dataset.camera==='corner-'+number,n);
  mounts.push(await page.locator('#stats').evaluate(el=>el.dataset.cameraX+':'+el.dataset.cameraZ));
 }
 assert.equal(new Set(mounts).size,4);
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.cameraEffects==='corner');
 await page.locator('#toggle-camera-effects').click();
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.cameraEffects==='off');
 assert.equal(await page.locator('#toggle-camera-effects').getAttribute('aria-pressed'),'false');
 await page.locator('#toggle-camera-effects').click();
 await page.locator('#camera-mode').selectOption('gopro');
 await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;return d.camera==='gopro'&&d.cameraEffects==='gopro';});
 assert.equal(await page.locator('#camera-patient').isEnabled(),true);
 for(const angle of [90,120,105]){
  await page.locator('#gopro-angle').selectOption(String(angle));
  await page.waitForFunction(want=>{
   const fov=Number(document.getElementById('stats').dataset.cameraFov);
   const horizontal=2*Math.atan(Math.tan(fov*Math.PI/360)*innerWidth/innerHeight)*180/Math.PI;
   return Math.abs(horizontal-want)<.01;
  },angle);
 }
 await page.locator('#camera-mode').selectOption('free');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.camera==='free');
 await page.locator('#camera-mode').evaluate(el=>el.blur());
 const xz=()=>page.locator('#stats').evaluate(el=>[Number(el.dataset.cameraX),Number(el.dataset.cameraZ)]);
 const startCamera=await xz();
 await page.mouse.move(540,540);
 await page.mouse.down();
 await page.mouse.move(610,550,{steps:3});
 await page.mouse.up();
 await page.keyboard.down('KeyW');
 try{
  await page.waitForFunction(([x,z])=>{const d=document.getElementById('stats').dataset;
   return Math.hypot(Number(d.cameraX)-x,Number(d.cameraZ)-z)>.08&&d.controlled==='';},startCamera);
 }finally{await page.keyboard.up('KeyW');}
 await page.locator('#control-patient').selectOption('1');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.camera==='gopro');
 const reticle=page.locator('#player-reticle');
 await reticle.waitFor({state:'visible'});
 const box=await reticle.boundingBox();
 const {width,height}=page.viewportSize();
 assert.ok(Math.abs(box.x+box.width/2-width/2)<.5&&Math.abs(box.y+box.height/2-height/2)<.5);
 assert.equal(await page.locator('#camera-mode option[value="free"]').evaluate(option=>option.disabled),true);
 await page.locator('#control-patient').selectOption('');
 await reticle.waitFor({state:'hidden'});
 await page.locator('#camera-mode').selectOption('corner-1');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>document.getElementById('stats')?.textContent.includes('PAUSED'));
 await page.locator('#reset').click();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.tick)===0);
 assert.equal(await page.locator('#round-clock').textContent(),'0:00');
 await page.locator('#scenario').selectOption('motion-review');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.patients==='2'&&d.reviewPhase==='idle'&&Number(d.tick)===0;});
 await page.locator('#playback-rate').selectOption('0.25');
 await page.locator('#frame-step').click();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.tick)===1);
 await page.locator('#frame-step').click();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.tick)===2);
 assert.equal(await page.locator('#stats').getAttribute('data-hits'),'0');
 assert.equal(await page.locator('#stats').getAttribute('data-playback'),'0.25');
 await page.locator('#playback-rate').selectOption('1');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.tick)>2);
 await page.locator('#scenario').selectOption('duel');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&Number(d.hits)>0;},{},{timeout:45000});
 await page.locator('#scenario').selectOption('duel-mixed');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&Number(d.hits)>0;},{},{timeout:45000});
 await page.locator('#scenario').selectOption('duel-prone');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.location==='ring'&&d.posture==='prone'&&Number(d.hits)>0;},{},{timeout:45000});
 assert.deepEqual(await page.locator('#scenario option[value^="location-"]').evaluateAll(options=>options.map(o=>o.value)),['location-ring','location-square']);
 await page.locator('#scenario').selectOption('location-ring');
 await page.locator('#vision-debug').check();
 await page.locator('#route-debug').check();
 await page.waitForFunction(()=>{
  const d=document.getElementById('stats')?.dataset;
  return d?.location==='ring'&&Number(d.drawnVision)>0&&Number(d.drawnRoutes)>0;
 });
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;
  return d?.state==='running'&&d.location==='ring'&&d.patients==='3'&&Number(d.hits)>0;},{},{timeout:45000});
 await page.locator('#patient-count').selectOption('2');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.location==='ring'&&d.patients==='2'&&Number(d.tick)>3;});
 assert.equal(await page.locator('#patient-hud .patient-card').count(),2);
 await page.locator('#control-patient').selectOption('1');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.controlled==='1');
 const controlStart=await page.locator('#stats').evaluate(el=>[Number(el.dataset.controlledX),Number(el.dataset.controlledZ)]);
 await page.keyboard.down('KeyW');
 try{await page.waitForFunction(([x,z])=>{const d=document.getElementById('stats')?.dataset;return Math.hypot(Number(d.controlledX)-x,Number(d.controlledZ)-z)>.035;},controlStart,{timeout:30000});}finally{await page.keyboard.up('KeyW');}
 await page.locator('#control-patient').selectOption('');
 await page.locator('#patient-count').selectOption('8');
 await page.waitForFunction(()=>{
  const d=document.getElementById('stats')?.dataset;
  return d?.state==='running'&&d.location==='ring'&&d.patients==='8'&&
    document.querySelectorAll('#patient-hud .patient-card').length===8;
 });
 await page.locator('#patient-count').selectOption('3');
 await page.locator('#vision-debug').uncheck();
 await page.locator('#route-debug').uncheck();
 await page.locator('#scenario').selectOption('location-square');
 await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;
  return d.state==='running'&&d.location==='square'&&d.authoredObjects==='1'&&Number(d.tick)>0;
 });
 assert.equal(await page.locator('#patient-count option').count(),7);
 await page.locator('#patient-count').selectOption('8');
 await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;
  return d.state==='running'&&d.location==='square'&&d.patients==='8';
 });
 await page.locator('#scenario').selectOption('damage');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.health==='4';});
 await page.locator('#damage-crit').click();
 await page.waitForFunction(geometry=>{const d=document.getElementById('stats')?.dataset;return d?.health==='1'&&d.segmentGeometry===geometry&&d.hitTint==='0:R.upperArm';},expectedGeometry);
 const firstCard=page.locator('#patient-hud [data-patient-id="0"]');
 assert.equal(await firstCard.locator('[data-segment="R.upperArm"]').getAttribute('data-state'),'damaged');
 assert.equal(await firstCard.locator('[data-segment="L.upperArm"]').getAttribute('data-state'),'healthy');
 assert.equal(await page.locator('#stats').getAttribute('data-endurance'),'32');
 const hitTick=Number(await page.locator('#stats').getAttribute('data-tick'));
 await page.waitForFunction(t=>Number(document.getElementById('stats')?.dataset.tick)>=t+18,hitTick);
 await page.locator('#damage-hit').click();
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.health==='0'&&d.detachedBranches==='1'&&d.branchSegments==='3';});
 for(const id of ['R.upperArm','R.lowerArm','R.hand'])assert.equal(await firstCard.locator('[data-segment="'+id+'"]').getAttribute('data-state'),'destroyed');
 assert.equal(await firstCard.getAttribute('data-bleeding'),'active');
 assert.ok(Number(await page.locator('#stats').getAttribute('data-max-endurance'))<35);
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.oil)>0,{},{timeout:30000});
 await page.locator('#damage-segment').selectOption('L.hand');
 await page.locator('#damage-crit').click();
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.health==='1');
 const singleHitTick=Number(await page.locator('#stats').getAttribute('data-tick'));
 await page.waitForFunction(t=>Number(document.getElementById('stats')?.dataset.tick)>=t+18,singleHitTick);
 await page.locator('#damage-hit').click();
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.settledSingles==='1'&&d.visibleCones==='0';},{},{timeout:45000});
 assert.equal(await firstCard.evaluate(el=>getComputedStyle(el,'::after').opacity),'0','ordinary bleeding does not tint the card');
 await page.locator('#damage-segment').selectOption('chest');
 await page.locator('#damage-crit').click();
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.health==='1');
 const chestHitTick=Number(await page.locator('#stats').getAttribute('data-tick'));
 await page.waitForFunction(t=>Number(document.getElementById('stats')?.dataset.tick)>=t+18,chestHitTick);
 await page.locator('#damage-crit').click();
 await page.waitForFunction(()=>document.querySelector('#patient-hud [data-patient-id="0"]')?.dataset.bleeding==='critical');
 assert.equal(await firstCard.evaluate(el=>getComputedStyle(el,'::after').backgroundColor),'rgba(160, 0, 20, 0.3)');
 await page.locator('#scenario').selectOption('corpse');
 await page.waitForFunction(()=>document.querySelector('#patient-hud [data-patient-id="1"]')?.dataset.life==='incapacitated');
 assert.equal(await page.locator('#patient-hud [data-patient-id="1"]').evaluate(el=>getComputedStyle(el,'::after').backgroundColor),'rgba(0, 0, 0, 0.7)');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.ragdollBodies==='15'&&d.ragdollJoints==='14';},{},{timeout:30000});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.incapacitated==='1'&&d.bodySegments==='17'&&Number(d.tick)>60;},{},{timeout:30000});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.settled==='1'&&Number(d.bodyCones)>0&&Number(d.bodyCones)<=4&&d.ragdollBodies==='0'&&d.ragdollJoints==='0'&&d.visibleCones==='0';},{},{timeout:45000});
 await page.locator('#terrain-debug').check();
 await page.locator('#terrain-debug').uncheck();
 await page.locator('#scenario').selectOption('fall');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.incapacitated==='0');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&['falling','down','rising'].includes(d.balance);},{},{timeout:30000});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.balance==='standing'&&Number(d.tick)>100;},{},{timeout:30000});
 await page.locator('#scenario').selectOption('terrain-hill');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.graded==='4'&&Number(d.tick)>4;},{},{timeout:45000});
 assert.equal(await page.locator('#control-patient').inputValue(),'0','hill uses selected patient zero');
 // Regression: a focused debug checkbox must not capture movement keys.
 await page.locator('#terrain-debug').focus();
 await page.keyboard.down('KeyW');
 try{
  await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.y)>.11,{},{timeout:30000});
 }catch(error){
  const diagnostic=await page.evaluate(()=>({stats:{...document.getElementById('stats').dataset},control:document.getElementById('control-patient').value,focused:document.activeElement?.id,focusType:document.activeElement?.type}));
  throw new Error('Hill traversal failed: '+JSON.stringify(diagnostic)+'; browser errors: '+errors.join('; '),{cause:error});
 }finally{await page.keyboard.up('KeyW');}
 await page.locator('#scenario').selectOption('walk');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.state==='running'&&document.getElementById('stats')?.dataset.mode==='biped');
 await page.locator('#next-round').click();
 assert.match(await page.locator('#floor-status').innerText(),/Сначала необходимо завершить бой/,'cannot archive an unfinished or noncombat round');
 assert.equal(await page.locator('#stats').getAttribute('data-floor-visuals'),'0');
 await page.keyboard.down('KeyW');
 try{await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.steps)>=3,{},{timeout:30000});}finally{await page.keyboard.up('KeyW');}
 await page.locator('#scenario').selectOption('arms');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.posture==='prone',{},{timeout:30000});
 const z=Number(await page.locator('#stats').getAttribute('data-z'));
 await page.keyboard.down('KeyW');
 try{await page.waitForFunction(start=>Number(document.getElementById('stats')?.dataset.z)<start-.06,z,{timeout:30000});}finally{await page.keyboard.up('KeyW');}
 assert.equal(await page.locator('#stats').getAttribute('data-mode'),'arm-crawl');
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.planted)>0,{},{timeout:30000});
 for(const [scenario,mode] of [['one-arm','arm-crawl'],['stump','arm-crawl'],['head','head-crawl'],['torso','torso-crawl'],['normal','biped']]){
  await page.locator('#scenario').selectOption(scenario);
  await page.waitForFunction(({mode,scenario})=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.mode===mode&&d.posture===(scenario==='normal'?'upright':'prone')&&Number(d.tick)>3;},{mode,scenario},{timeout:30000});
  if(scenario!=='normal'){
   const start=Number(await page.locator('#stats').getAttribute('data-z'));
   await page.keyboard.down('KeyW');
   try{await page.waitForFunction(z=>Number(document.getElementById('stats')?.dataset.z)<z-.015,start,{timeout:30000});}finally{await page.keyboard.up('KeyW');}
  }
 }
 await page.locator('#scenario').selectOption('one-leg');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.mode==='single-support');
 await page.keyboard.down('KeyW');
 try{await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.hop)>.025,{},{timeout:30000});}finally{await page.keyboard.up('KeyW');}
 await page.goto(base+'/3d/lab-next/rig.html?scenario=one-arm',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.mode==='arm-crawl'&&d.posture==='prone';},{},{timeout:45000});
 const release=await page.locator('#stats').getAttribute('data-build');
 const spectralBalance=await page.evaluate(async release=>{
  const root='/releases/'+release+'/3d/lab-next/';
  const {createStepTone,stepDirectionTone}=await import(root+'footstep-audio.js');
  const recording=await fetch(root+'audio/step_1.mp3');
  if(!recording.ok||(await recording.arrayBuffer()).byteLength===0)throw Error('Missing footstep recording');
  const audio=new OfflineAudioContext(2,128,44100);
  const frequencies=new Float32Array([300,3000]);
  const measure=node=>{
   const magnitude=new Float32Array(2);
   node.getFrequencyResponse(frequencies,magnitude,new Float32Array(2));
   return magnitude;
  };
  return [-2,2].map(z=>{
   const tone=createStepTone(audio),settings=stepDirectionTone([0,0,0],[0,0,-1],[-1,0,z]);
   tone.body.gain.value=settings.body;
   tone.edge.gain.value=settings.edge;
   const body=measure(tone.body),edge=measure(tone.edge);
   return body[1]*edge[1]/(body[0]*edge[0]);
  });
 },release);
 assert.ok(spectralBalance[0]>2*spectralBalance[1],JSON.stringify(spectralBalance));
 const shadowPixels=await page.evaluate(async release=>{
  const root='/releases/'+release+'/3d/lab-next/';
  const T=await import(root+'vendor/three.module.js');
  const {configureGoProShadow,segmentShadow}=await import(root+'gopro-shadow.js');
  const {createSegmentVisual}=await import(root+'segment-visual.js');
  const renderer=new T.WebGLRenderer();
  const target=new T.WebGLRenderTarget(128,128);
  const scene=new T.Scene();
  const camera=new T.OrthographicCamera(-2,2,2,-2,.1,12);
  camera.position.set(0,6,-1);
  camera.up.set(0,0,-1);
  camera.lookAt(0,0,-1);
  const lamp=new T.SpotLight(0xffffff,9,9,Math.PI/4,.25,1);
  lamp.position.set(0,2,4);
  lamp.target.position.set(0,0,-2);
  configureGoProShadow(T,renderer,lamp);
  scene.add(lamp,lamp.target,new T.AmbientLight(0xffffff,.14));
  const material=new T.MeshStandardMaterial({color:0xffffff});
  const floor=new T.Mesh(new T.PlaneGeometry(12,12),material);
  floor.rotation.x=-Math.PI/2;
  floor.receiveShadow=true;
  const column=new T.Mesh(new T.CylinderGeometry(.25,.25,1.6),material);
  column.position.set(-.55,.8,0);
  column.castShadow=true;
  const patient=segmentShadow(createSegmentVisual('L.upperLeg',.35,1.25,material));
  patient.position.set(.55,.75,0);
  scene.add(floor,column,patient);
  const points=[new T.Vector3(-.825,0,-2),new T.Vector3(.825,0,-2),new T.Vector3(0,0,-2)];
  try{
   camera.updateMatrixWorld();
   renderer.setRenderTarget(target);
   return [true,false].map(shadows=>{
    lamp.castShadow=shadows;
    renderer.render(scene,camera);
    const pixel=new Uint8Array(4);
    return points.map(p=>{
     const {x,y}=p.clone().project(camera);
     renderer.readRenderTargetPixels(target,Math.floor((x+1)*64),Math.floor((y+1)*64),1,1,pixel);
     return pixel[0];
    });
   });
  }finally{
   renderer.setRenderTarget(null);
   target.dispose();
   lamp.shadow.dispose();
   renderer.dispose();
  }
 },release);
 const [withShadows,withoutShadows]=shadowPixels;
 assert.ok(withShadows[0]+10<withoutShadows[0],JSON.stringify(shadowPixels));
 assert.ok(withShadows[1]+10<withoutShadows[1],JSON.stringify(shadowPixels));
 assert.equal(withShadows[2],withoutShadows[2]);

 const ornaments=await page.evaluate(async release=>{
  const {createSegmentVisual}=await import('/releases/'+release+'/3d/lab-next/segment-visual.js');
  return ['chest','head','R.upperArm','L.upperLeg','R.lowerArm','L.lowerLeg'].map(id=>
   createSegmentVisual(id,.1,.4,undefined).children.slice(1).map(mesh=>[mesh.name,mesh.userData.segment]));
 },release);
 assert.deepEqual(ornaments,[
  [['clavicle','chest'],['clavicle','chest']],
  [],
  [['elbow','R.upperArm']],
  [['knee','L.upperLeg']],
  [],[],
 ]);
 const faces=await page.evaluate(async release=>{
  const root='/releases/'+release+'/3d/lab-next/';
  const {createSegmentVisual}=await import(root+'segment-visual.js');
  const {assignPatientPortraits,loadPatientPortraits}=await import(root+'patient-portraits.js');
  const portraits=await loadPatientPortraits(),material=portraits.values().next().value;
  const group=createSegmentVisual('head',.1,0,undefined,material);
  const panel=group.getObjectByName('portrait'),image=material.map.image;
  const fighters=Array.from({length:8},(_,id)=>({id}));
  const first=[...assignPatientPortraits(fighters,portraits,()=>0).values()];
  const second=[...assignPatientPortraits(fighters,portraits,()=>.999).values()];
  return {count:portraits.size,first,second,front:panel.position.z,radius:group.children[0].scale.z,
   aspect:panel.scale.x/panel.scale.y,sourceAspect:image.width/image.height,side:material.side};
 },release);
 assert.ok(faces.count>=4);
 assert.equal(new Set(faces.first.slice(0,faces.count)).size,Math.min(faces.count,8));
 assert.notDeepEqual(faces.first,faces.second);
 assert.ok(faces.front>faces.radius&&faces.front-faces.radius<.002);
 assert.ok(Math.abs(faces.aspect-faces.sourceAspect)<1e-8);
 assert.equal(faces.side,0,'portrait is rendered only from the front');
 if(modelCatalog.active){
  const skin=await page.evaluate(async release=>{
   const root='/releases/'+release+'/3d/lab-next/';
   const T=await import(root+'vendor/three.module.js');
   const {loadPatientModel,paintModel,disposePatientVisual}=await import(root+'patient-model.js');
   const {loadPatientPortraits}=await import(root+'patient-portraits.js');
   const model=await loadPatientModel(),portraits=await loadPatientPortraits();
   if(!model)return null;
   const palette=new T.MeshStandardMaterial({color:0xffffff}),portrait=portraits.values().next().value;
   const a=model.create('head',.1541374,0,palette,portrait),b=model.create('head',.1541374,0,palette,portrait);
   const face=a.getObjectByName('portrait');
   const sameGeometry=a.children[0].geometry===b.children[0].geometry;
   const differentMaterial=a.children[0].material!==b.children[0].material;
   const before=b.children[0].material.color.clone();
   paintModel(a,{critical:false,strength:1},0,1,new T.Color(1,0,0));
   const tinted=a.children[0].material.color.r===1&&b.children[0].material.color.equals(before);
   const normal=face.geometry.getAttribute('normal');
   let z=0;for(let i=0;i<normal.count;i++)z+=normal.getZ(i);
   const result={sameGeometry,differentMaterial,tinted,portrait:face.material===b.getObjectByName('portrait').material&&face.material.map.image===portrait.map.image&&!face.material.map.flipY&&portrait.map.flipY,normalZ:z/normal.count};
   disposePatientVisual(a);disposePatientVisual(b);palette.dispose();return result;
  },release);
  assert.ok(skin&&skin.sameGeometry&&skin.differentMaterial&&skin.tinted&&skin.portrait&&skin.normalZ>0,JSON.stringify(skin));
 }
 assert.match(release,/^[a-f0-9]{20}$/);
 // Real IndexedDB persistence across reload, session and arena switches.
 // A synthetic settled remain avoids spending another 60 seconds waiting for
 // a complete simulated round just to exercise browser storage.
 const floorSession='ci-floor-'+release;
 const floorUrl=base+'/3d/lab-next/rig.html?scenario=one-arm&session='+encodeURIComponent(floorSession);
 await page.goto(floorUrl,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.floorVisuals==='0';},{},{timeout:45000});
 const archived={
  schemaVersion:1,arenaId:'one-arm@165',
  mounds:[{id:'stored',source:'segment',x:1,z:1,radius:.35,height:.16}],
  visuals:[{id:1,fighterId:0,segmentId:'L.hand',settled:true,length:0,radius:.08,
   position:{x:1,y:.08,z:1},rotation:{x:0,y:0,z:0,w:1}}],
  oilMarks:[{id:1,fighterId:0,tick:12,point:[1,.01,1]}],
 };
 await page.evaluate(async({release,session,archived})=>{
  const storage=await import('/releases/'+release+'/3d/lab-next/floor-storage.js');
  await storage.saveFloorHistory(session,'one-arm@165',archived);
 },{release,session:floorSession,archived});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;
  return d?.state==='running'&&d.floorVisuals==='1'&&d.floorMounds==='1'&&d.oil==='1'&&d.visibleCones==='0';},{},{timeout:45000});
 assert.match(await page.locator('#floor-status').innerText(),/Пол сохранён/);
 await page.locator('#scenario').selectOption('walk');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.floorVisuals==='0');
 await page.locator('#scenario').selectOption('one-arm');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.floorVisuals==='1');
 await page.goto(base+'/3d/lab-next/rig.html?scenario=one-arm&session='+encodeURIComponent(floorSession+'-other'),{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.floorVisuals==='0';},{},{timeout:45000});
 await page.goto(floorUrl,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.floorVisuals==='1';},{},{timeout:45000});
 await page.locator('#reset').click();
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.floorVisuals==='0';},{},{timeout:45000});
 const deleted=await page.evaluate(async({release,session})=>{
  const storage=await import('/releases/'+release+'/3d/lab-next/floor-storage.js');
  return await storage.loadFloorHistory(session,'one-arm@165');
 },{release,session:floorSession});
 assert.equal(deleted,null,'clean Reset deletes persisted floor, not only in-memory meshes');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.floorVisuals==='0';},{},{timeout:45000});
 // Real authored arenas use isolated floor histories within one session.
 await page.evaluate(async({release,session,archived})=>{
  const storage=await import('/releases/'+release+'/3d/lab-next/floor-storage.js');
  await storage.saveFloorHistory(session,'square@9m-column50-v1-165',{...archived,arenaId:'square@9m-column50-v1-165'});
 },{release,session:floorSession,archived});
 for(const [id,count] of [['square','1'],['ring','0'],['square','1']]){
  await page.locator('#scenario').selectOption('location-'+id);
  await page.waitForFunction(([arena,count])=>{const d=document.getElementById('stats').dataset;return d.state==='running'&&d.location===arena&&d.floorVisuals===count;},[id,count]);
  assert.equal(await page.locator('#stats').getAttribute('data-arena-geometry'),id==='ring'?expectedRingGeometry:'native');
 }
 await page.goto(base+'/');
 await page.getByRole('link',{name:'Быстрый бой'}).click();
 await page.locator('#arena option[value="location-square"]').waitFor({state:'attached'});
 assert.deepEqual(await page.locator('#arena option').evaluateAll(options=>options.map(o=>o.value)),['location-ring','location-square']);
 await page.locator('#arena').selectOption('location-square');
 assert.equal(await page.locator('#participants option').count(),7);
 await page.locator('#participants').selectOption('2');
 await page.locator('form').evaluate(form=>{
  const seed=document.createElement('input');seed.type='hidden';seed.name='seed';seed.value='19';form.append(seed);
 });
 await page.locator('#start-match').click();
 await page.locator('#match-preparation').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.getElementById('stats').dataset.state==='running');
 assert.equal(await page.locator('#stats').getAttribute('data-tick'),'0');
 assert.equal(await page.locator('#stats').getAttribute('data-location'),'square');
 assert.equal(await page.locator('#stats').getAttribute('data-patients'),'2');
 assert.equal(await page.locator('#scenario').isVisible(),false);
 assert.equal(await page.locator('#stats').getAttribute('data-camera-height'),'3');
 await page.waitForTimeout(500);
 assert.equal(await page.locator('#stats').getAttribute('data-tick'),'0','preparation does not step combat');
 await page.locator('#match-preparation').waitFor({state:'hidden',timeout:15000});
 await page.waitForFunction(()=>Number(document.getElementById('stats').dataset.tick)>3);
 // Check the reusable result flow with the fixed ring duel.
 await page.locator('#match-exit').click();
 await page.locator('#arena').selectOption('location-ring');
 await page.locator('#participants').selectOption('2');
 await page.locator('form').evaluate(form=>{
  const seed=document.createElement('input');seed.type='hidden';seed.name='seed';seed.value='19';form.append(seed);
 });
 // Rendering a full textured arena on SwiftShader is not a real-time clock.
 // Keep the real renderer and all simulation rules, but reduce pixel cost
 // during this long functional check. Earlier camera/asset assertions ran
 // at 1000x720. Bound BOTH simulation ticks and host wall time.
 const resultViewport=page.viewportSize();
 await page.locator('#start-match').click();
 const duelDiagnostic=()=>page.evaluate(()=>{
  const d=document.getElementById('stats')?.dataset??{};
  return {state:d.state,seed:d.seed,tick:Number(d.tick)||0,fight:d.fight,
   active:d.active,hits:d.hits,location:d.location,patients:d.patients,
   arenaGeometry:d.arenaGeometry,meshes:d.arenaVisualMeshes,triangles:d.arenaVisualTriangles,
   fps:document.getElementById('frame-meter')?.textContent,
   clock:document.getElementById('round-clock')?.textContent,
   preparation:document.getElementById('match-preparation')?.textContent,
   resultHidden:document.getElementById('match-result')?.hidden,
   stats:document.getElementById('stats')?.textContent};
 });
 try{
  await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.location==='ring'&&d.seed==='19'&&d.patients==='2';},{},{timeout:45000});
  assert.equal(await page.locator('#stats').getAttribute('data-arena-geometry'),expectedRingGeometry);
  await page.setViewportSize({width:640,height:480});
  const wallStart=Date.now();
  await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;
   return d?.state==='error'||Number(d?.tick)>=7200||d?.fight==='ended';
  },{},{timeout:240000,polling:250});
  const info=await duelDiagnostic();
  console.log('MATCH_RESULT_DIAGNOSTIC',JSON.stringify({...info,wallSeconds:(Date.now()-wallStart)/1000}));
  assert.equal(info.fight,'ended','Seed 19 must finish naturally within 120 simulated seconds: '+JSON.stringify(info));
  assert.ok(info.tick<=7200,'Exceeded simulated duel budget: '+JSON.stringify(info));
  await page.locator('#match-result').waitFor({state:'visible',timeout:10000});
 }catch(error){
  const info=await duelDiagnostic().catch(()=>({unavailable:true}));
  throw new Error('Quick-match natural result failed: '+JSON.stringify(info)+'; browser errors: '+errors.join('; '),{cause:error});
 }finally{
  if(resultViewport)await page.setViewportSize(resultViewport);
 }
 assert.match(await page.locator('#match-result-title').textContent(),/Победил пациент № [01]|Ничья/);
 assert.match(await page.locator('#match-result p').textContent(),/Время боя \d+:\d{2}/);
 await page.locator('#control-patient').selectOption('0');
 await page.locator('#match-again').click();
 await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;return d.state==='running'&&d.controlled==='0'&&d.camera==='gopro';});
 await page.locator('#match-preparation').waitFor({state:'hidden',timeout:15000});
 const replayStart=await page.locator('#stats').evaluate(e=>Number(e.dataset.controlledZ));
 await page.keyboard.down('KeyW');
 try{
  await page.waitForFunction(z=>Math.abs(Number(document.getElementById('stats').dataset.controlledZ)-z)>.05,replayStart);
 }finally{await page.keyboard.up('KeyW');}
 await page.locator('#match-exit').click();
 await page.locator('#start-match').waitFor({state:'visible'});
 await page.goto(base+'/3d/lab-next/pose-editor.html');
 await page.waitForFunction(()=>document.getElementById('viewport')?.dataset.segments==='17',{},{timeout:45000});
 const editorViewport=page.locator('#viewport'),reference=page.locator('#reference-geometry');
 assert.equal(await editorViewport.getAttribute('data-geometry'),expectedGeometry);
 assert.equal(await reference.isVisible(),expectedGeometry==='glb');
 await page.locator('#tab-lighting').click();
 assert.equal(await page.locator('#viewport').getAttribute('data-preview'),'lighting');
 await page.locator('#light-flashlight').evaluate(input=>{input.value='12';input.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('eccepry:scene-lighting:v1')).flashlight),12);
 await page.locator('#reset-lighting').click();
 await page.locator('#tab-effects').click();
 await page.locator('#effects-profile').selectOption('gopro');
 const grain=page.locator('#effect-grain'),defaultGrain=await grain.inputValue();
 await grain.evaluate(input=>{input.value='12';input.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.locator('#grain-value').textContent(),'12%');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('eccepry:camera-effects:v1')));
 assert.equal(saved.gopro.grain,.12);
 assert.equal(saved.corner.grain,.15);
 await page.reload();
 await page.locator('#tab-effects').click();
 await page.locator('#effects-profile').selectOption('gopro');
 assert.equal(await grain.inputValue(),'12');
 await page.locator('#reset-effects').click();
 assert.equal(await grain.inputValue(),defaultGrain);
 await page.locator('#tab-anatomy').click();
 await page.locator('#pose').selectOption('tPose');
 await page.waitForFunction(()=>document.getElementById('viewport')?.dataset.segments==='17');
 await page.locator('[data-view="front"]').click();
 assert.equal(await page.locator('[data-view="front"]').getAttribute('aria-pressed'),'true');
 if(expectedGeometry==='glb'){
  await reference.check();
  assert.equal(await editorViewport.getAttribute('data-geometry'),'glb-reference');
 }
 const boneLength=await page.locator('#length').inputValue();
 await page.locator('#collider-radius').fill('0.11');
 await page.locator('#collider-radius').press('Tab');
 await page.locator('#collider-length').fill('0.20');
 await page.locator('#collider-length').press('Tab');
 assert.equal(await page.locator('#length').inputValue(),boneLength);
 assert.equal(await page.locator('#collider-span').textContent(),'0,42 м');
 await page.locator('#length').fill('0.38');
 await page.locator('#length').press('Tab');
 assert.equal(await page.locator('#collider-length').inputValue(),'0.2');
 if(expectedGeometry==='glb'){
  assert.equal(await editorViewport.getAttribute('data-geometry'),'glb-reference');
  await reference.uncheck();
  assert.equal(await editorViewport.getAttribute('data-geometry'),'glb');
 }
 await page.locator('#show-bones').uncheck();
 await page.locator('#show-geometry').uncheck();
 await page.locator('#show-colliders').uncheck();
 await page.locator('#show-colliders').check();
 await page.locator('#show-bones').check();
 await page.locator('#show-geometry').check();
 await page.locator('#reset-pose').click();
 await page.locator('#radius').fill('0.14');
 await page.locator('#radius').press('Tab');
 await page.locator('#pose').selectOption('punch');
 assert.ok(await page.locator('#radius').isDisabled());
 assert.equal(await page.locator('#radius').inputValue(),'0.14');
 await page.locator('#enabled').uncheck();
 await page.waitForFunction(()=>document.getElementById('viewport')?.dataset.segments==='14');
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#export').click();
 const download=await downloadPromise, poseFile=await download.path();
 const exported=JSON.parse(await readFile(poseFile,'utf8'));
 assert.equal(exported.slots.tPose.find(part=>part.id==='L.upperArm').radius,.14);
 await page.reload();
 await page.locator('#pose').selectOption('punch');
 await page.waitForFunction(()=>document.getElementById('viewport')?.dataset.segments==='14');
 await page.locator('#reset-pose').click();
 await page.waitForFunction(()=>document.getElementById('viewport')?.dataset.segments==='17');
 await page.locator('#import').setInputFiles(poseFile);
 await page.waitForFunction(()=>document.getElementById('status')?.textContent==='Позы импортированы.');
 await page.locator('#pose').selectOption('punch');
 await page.waitForFunction(()=>document.getElementById('viewport')?.dataset.segments==='14');
 await page.evaluate(async release=>{
  const {readPoseDraft,POSE_DRAFT_KEY}=await import('/releases/'+release+'/3d/lab-next/pose-draft.js');
  const response=await fetch('/releases/'+release+'/3d/lab-next/patient-poses.json');
  const baseline=await response.json();
  const slots={...readPoseDraft(localStorage)?.slots,stance:baseline.slots.stance.map(segment=>
   segment.id==='chest'?{...segment,rotation:[(segment.rotation?.[0]??0)-.45,segment.rotation?.[1]??0,segment.rotation?.[2]??0]}:segment)};
  localStorage.setItem(POSE_DRAFT_KEY,JSON.stringify({...baseline,slots}));
 },release);
 const motionURL=base+'/3d/lab-next/rig.html?scenario=motion-review';
 const sampleReview=async suffix=>{
  await page.goto(motionURL+suffix);
  await page.waitForFunction(()=>document.getElementById('stats').dataset.state==='running');
  await page.locator('#pause').click();
  await page.locator('#reset').click();
  await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;
   return d.state==='running'&&d.tick==='0'&&d.reviewPhase==='idle'&&Number.isFinite(Number(d.thoraxPitch))&&d.thoraxPitch!=='';
  });
  return Number(await page.locator('#stats').getAttribute('data-thorax-pitch'));
 };
 const draftThorax=await sampleReview(''),stockThorax=await sampleReview('&poses=stock');
 assert.ok(draftThorax-stockThorax>10,JSON.stringify({draftThorax,stockThorax}));
 assert.ok(modules.length>0);assert.ok(modules.every(url=>url.includes('/releases/'+release+'/')),JSON.stringify(modules));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Browser smoke passed: offline modules, WebGL first frame, fixed ticks, pause and reset.');
 }
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
