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
 const errors=[],external=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',route=>{if(route.request().url().startsWith(base+'/'))return route.continue();external.push(route.request().url());return route.abort();});
 await page.goto(base+'/3d/lab-next/rig.html',{waitUntil:'domcontentloaded'});
 try{
  await page.waitForFunction(()=>document.getElementById('stats')?.dataset.state==='running'&&Number(document.getElementById('stats')?.dataset.tick)>2,{},{timeout:45000});
 }catch(e){throw new Error('Lab startup failed: '+await page.locator('#stats').innerText()+'; browser errors: '+errors.join('; '),{cause:e});}
 assert.equal(await page.locator('canvas').count(),1);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>document.getElementById('stats')?.textContent.includes('PAUSED'));
 await page.locator('#reset').click();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.tick)===0);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>Number(document.getElementById('stats')?.dataset.tick)>2);
 await page.locator('#scenario').selectOption('arms');
 await page.waitForFunction(()=>document.getElementById('stats')?.dataset.posture==='prone',{},{timeout:30000});
 const z=Number(await page.locator('#stats').getAttribute('data-z'));
 await page.keyboard.down('KeyW');
 try{await page.waitForFunction(start=>Number(document.getElementById('stats')?.dataset.z)<start-.06,z,{timeout:30000});}finally{await page.keyboard.up('KeyW');}
 assert.equal(await page.locator('#stats').getAttribute('data-mode'),'arm-crawl');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Browser smoke passed: offline modules, WebGL first frame, fixed ticks, pause and reset.');
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
