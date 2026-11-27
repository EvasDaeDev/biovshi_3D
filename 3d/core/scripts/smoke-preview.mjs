import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const site=resolve(dirname(fileURLToPath(import.meta.url)),'../../../_site');
const types={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.css':'text/css'};
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
 assert.equal(await page.locator('#stats').getAttribute('data-camera-height'),'3');
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
 await page.locator('#camera-mode').selectOption('fisheye');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.camera==='fisheye');
 assert.equal(await page.locator('#camera-patient').isEnabled(),true);
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
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.camera==='corner-4');
 assert.equal(await page.locator('#camera-mode option[value="free"]').evaluate(option=>option.disabled),true);
 await page.locator('#control-patient').selectOption('');
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
 const capacities={ring:8,ward:10,annulus:4,sluice:5,zigzag:7,columns:10,maze:10,throat:6};
 assert.deepEqual(await page.locator('#scenario option[value^="location-"]').evaluateAll(options=>options.map(o=>o.value)),Object.keys(capacities).map(id=>'location-'+id));
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
 for(const [id,capacity] of Object.entries(capacities).slice(1)){
  await page.locator('#scenario').selectOption('location-'+id);
  await page.waitForFunction(name=>{const d=document.getElementById('stats').dataset;
   return d.state==='running'&&d.location===name&&Number(d.authoredObjects)>0&&Number(d.tick)>0;
  },id);
  assert.equal(await page.locator('#patient-count option').count(),capacity-1);
 }
 await page.locator('#scenario').selectOption('location-ward');
 await page.waitForFunction(()=>document.getElementById('stats').dataset.location==='ward');
 await page.locator('#patient-count').selectOption('10');
 await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;return d.state==='running'&&d.location==='ward'&&d.patients==='10';});
 await page.locator('#scenario').selectOption('location-annulus');
 await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;return d.state==='running'&&d.location==='annulus'&&d.patients==='4';});
 await page.locator('#scenario').selectOption('damage');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.health==='4';});
 await page.locator('#damage-crit').click();
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.health==='1'&&d.segmentGeometry==='ellipsoid'&&d.hitTint==='0:R.upperArm';});
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
 const ornaments=await page.evaluate(async release=>{
  const {createSegmentVisual}=await import('/releases/'+release+'/3d/lab-next/segment-visual.js');
  return ['chest','head','R.upperArm','L.upperLeg','R.lowerArm','L.lowerLeg'].map(id=>
   createSegmentVisual(id,.1,.4,undefined).children.slice(1).map(mesh=>[mesh.name,mesh.userData.segment]));
 },release);
 assert.deepEqual(ornaments,[
  [['clavicle','chest'],['clavicle','chest']],
  [['ear','head'],['ear','head']],
  [['elbow','R.upperArm']],
  [['knee','L.upperLeg']],
  [],[],
 ]);
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
  await storage.saveFloorHistory(session,'ward@area125-v1-165',{...archived,arenaId:'ward@area125-v1-165'});
 },{release,session:floorSession,archived});
 for(const [id,count] of [['ward','1'],['annulus','0'],['ward','1']]){
  await page.locator('#scenario').selectOption('location-'+id);
  await page.waitForFunction(([arena,count])=>{const d=document.getElementById('stats').dataset;return d.state==='running'&&d.location===arena&&d.floorVisuals===count;},[id,count]);
 }
 await page.goto(base+'/');
 await page.getByRole('link',{name:'Быстрый бой'}).click();
 await page.locator('#arena').selectOption('location-throat');
 assert.equal(await page.locator('#participants option').count(),5);
 await page.locator('#participants').selectOption('2');
 await page.locator('form').evaluate(form=>{
  const seed=document.createElement('input');seed.type='hidden';seed.name='seed';seed.value='19';form.append(seed);
 });
 await page.locator('#start-match').click();
 await page.locator('#match-preparation').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.getElementById('stats').dataset.state==='running');
 assert.equal(await page.locator('#stats').getAttribute('data-tick'),'0');
 assert.equal(await page.locator('#stats').getAttribute('data-location'),'throat');
 assert.equal(await page.locator('#stats').getAttribute('data-patients'),'2');
 assert.equal(await page.locator('#scenario').isVisible(),false);
 assert.equal(await page.locator('#stats').getAttribute('data-camera-height'),'3');
 await page.waitForTimeout(500);
 assert.equal(await page.locator('#stats').getAttribute('data-tick'),'0','preparation does not step combat');
 await page.locator('#match-preparation').waitFor({state:'hidden',timeout:15000});
 await page.locator('#match-result').waitFor({state:'visible',timeout:60000});
 assert.match(await page.locator('#match-result-title').textContent(),/Победил пациент № [01]|Ничья/);
 assert.match(await page.locator('#match-result p').textContent(),/Время боя \d+:\d{2}/);
 await page.getByRole('link',{name:'В меню боя'}).click();
 await page.locator('#start-match').waitFor({state:'visible'});
 await page.goto(base+'/3d/lab-next/pose-editor.html');
 await page.waitForFunction(()=>document.getElementById('viewport')?.dataset.segments==='17');
 await page.locator('#pose').selectOption('tPose');
 await page.waitForFunction(()=>document.getElementById('viewport')?.dataset.segments==='17');
 await page.locator('[data-view="front"]').click();
 assert.equal(await page.locator('[data-view="front"]').getAttribute('aria-pressed'),'true');
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
  await page.waitForFunction(()=>{const d=document.getElementById('stats').dataset;
   return d.state==='running'&&d.reviewPhase==='idle'&&Number.isFinite(Number(d.thoraxPitch))&&d.thoraxPitch!=='';
  });
  return Number(await page.locator('#stats').getAttribute('data-thorax-pitch'));
 };
 const draftThorax=await sampleReview(''),stockThorax=await sampleReview('&poses=stock');
 assert.ok(draftThorax-stockThorax>10,JSON.stringify({draftThorax,stockThorax}));
 assert.ok(modules.length>0);assert.ok(modules.every(url=>url.includes('/releases/'+release+'/')),JSON.stringify(modules));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Browser smoke passed: offline modules, WebGL first frame, fixed ticks, pause and reset.');
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
