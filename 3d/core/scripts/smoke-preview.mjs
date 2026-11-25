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
 await page.route('**/*',route=>{if(route.request().url().startsWith(base+'/')){if(route.request().resourceType()==='script')modules.push(route.request().url());return route.continue();}external.push(route.request().url());return route.abort();});
 await page.goto(base+'/3d/lab-next/rig.html',{waitUntil:'domcontentloaded'});
 try{
  await page.waitForFunction(()=>document.getElementById('stats')?.dataset.state==='running'&&Number(document.getElementById('stats')?.dataset.tick)>2,{},{timeout:45000});
 }catch(e){throw new Error('Lab startup failed: '+await page.locator('#stats').innerText()+'; browser errors: '+errors.join('; '),{cause:e});}
 assert.equal(await page.locator('canvas').count(),1);
 await page.locator('#support-debug').check();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.supportCount)>0);
 await page.locator('#support-debug').uncheck();
 await page.locator('#pause').click();
 await page.waitForFunction(()=>document.getElementById('stats')?.textContent.includes('PAUSED'));
 await page.locator('#reset').click();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.tick)===0);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.tick)>2);
 await page.locator('#scenario').selectOption('duel');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&Number(d.hits)>0;},{},{timeout:45000});
 await page.locator('#scenario').selectOption('duel-mixed');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&Number(d.hits)>0;},{},{timeout:45000});
 await page.locator('#scenario').selectOption('duel-prone');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.posture==='prone'&&Number(d.hits)>0;},{},{timeout:45000});
 await page.locator('#scenario').selectOption('arena');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&Number(d.hits)>0&&d.targets?.split('/').length===8;},{},{timeout:45000});
 // The published catalog is built from the original 2D authored JSON,
 // not fetched from the old app or from any external website.
 await page.locator('#scenario').selectOption('location-ward');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;
  return d?.state==='running'&&d.location==='ward'&&d.authoredObjects==='5'&&Number(d.tick)>3;},{},{timeout:45000});
 await page.locator('#scenario').selectOption('location-ring');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;
  return d?.state==='running'&&d.location==='ring'&&d.authoredObjects==='0'&&Number(d.tick)>3;},{},{timeout:45000});
 await page.locator('#scenario').selectOption('location-maze');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;
  return d?.state==='running'&&d.location==='maze'&&Number(d.authoredObjects)>0&&Number(d.tick)>3;},{},{timeout:45000});
 await page.locator('#scenario').selectOption('arena-vision');
 await page.locator('#vision-debug').check();
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&Number(d.hits)>0&&d.visible?.split('/').length===8;},{},{timeout:45000});
 await page.locator('#vision-debug').uncheck();
 await page.locator('#scenario').selectOption('damage');
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.health==='3';});
 await page.locator('#damage-crit').click();
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.health==='1');
 const hitTick=Number(await page.locator('#stats').getAttribute('data-tick'));
 await page.waitForFunction(t=>Number(document.getElementById('stats')?.dataset.tick)>=t+18,hitTick);
 await page.locator('#damage-hit').click();
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.health==='0'&&d.detachedBranches==='1'&&d.branchSegments==='3';});
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.oil)>0,{},{timeout:30000});
 await page.locator('#damage-segment').selectOption('L.hand');
 await page.locator('#damage-crit').click();
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.health==='1');
 const singleHitTick=Number(await page.locator('#stats').getAttribute('data-tick'));
 await page.waitForFunction(t=>Number(document.getElementById('stats')?.dataset.tick)>=t+18,singleHitTick);
 await page.locator('#damage-hit').click();
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.settledSingles==='1'&&d.visibleCones==='0';},{},{timeout:45000});
 await page.locator('#scenario').selectOption('corpse');
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
 await page.keyboard.down('KeyW');
 try{await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.y)>.11,{},{timeout:30000});}finally{await page.keyboard.up('KeyW');}
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
 assert.match(release,/^[a-f0-9]{20}$/);
 // Real IndexedDB persistence across reload, session and arena switches.
 // A synthetic settled remain avoids spending another 60 seconds waiting for
 // a complete simulated round just to exercise browser storage.
 const floorSession='ci-floor-'+release;
 const floorUrl=base+'/3d/lab-next/rig.html?scenario=one-arm&session='+encodeURIComponent(floorSession);
 await page.goto(floorUrl,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.floorVisuals==='0';},{},{timeout:45000});
 const archived={
  schemaVersion:1,arenaId:'one-arm',
  mounds:[{id:'stored',source:'segment',x:1,z:1,radius:.35,height:.16}],
  visuals:[{id:1,fighterId:0,segmentId:'L.hand',settled:true,length:0,radius:.08,
   position:{x:1,y:.08,z:1},rotation:{x:0,y:0,z:0,w:1}}],
  oilMarks:[{id:1,fighterId:0,tick:12,point:[1,.01,1]}],
 };
 await page.evaluate(async({release,session,archived})=>{
  const storage=await import('/releases/'+release+'/3d/lab-next/floor-storage.js');
  await storage.saveFloorHistory(session,'one-arm',archived);
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
  return await storage.loadFloorHistory(session,'one-arm');
 },{release,session:floorSession});
 assert.equal(deleted,null,'clean Reset deletes persisted floor, not only in-memory meshes');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.getElementById('stats')?.dataset;return d?.state==='running'&&d.floorVisuals==='0';},{},{timeout:45000});
 assert.ok(modules.length>0);assert.ok(modules.every(url=>url.includes('/releases/'+release+'/')),JSON.stringify(modules));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Browser smoke passed: offline modules, WebGL first frame, fixed ticks, pause and reset.');
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
