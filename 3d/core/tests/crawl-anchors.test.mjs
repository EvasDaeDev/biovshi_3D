import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const f=createLabConfig(7).fighters[0],legless=f.segmentIds.filter(s=>!/\.(upperLeg|lowerLeg|foot)$/.test(s));
const setup=ids=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,segmentIds:ids}]});return c;};
const step=(c,forward=1)=>{c.step(FIXED_DT,{commands:[{fighterId:0,forward,turn:0,sprint:false}]});return c.getSnapshot();};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('world-space planted hand remains stationary during body translation',()=>{
 for(const ids of [legless,legless.filter(s=>!s.startsWith('R.'))]){
  const c=setup(ids);let prev=c.getSnapshot(),locked=0,recovery=0,moved=0;
  for(let i=0;i<300;i++){
   const s=step(c);
   for(const a of s.crawlAnchors[0]){
    if(a.phase==='recover')recovery++;
    if(!a.valid)continue;
    const p=s.rigSegments[0].find(p=>p.id===a.segmentId);
    assert.ok(distance(p.b,a.point)<.002);
    const old=prev.crawlAnchors[0].find(v=>v.segmentId===a.segmentId);
    if(old?.valid&&distance(old.point,a.point)<1e-8&&Math.abs(prev.roots[2]-s.roots[2])>1e-6)locked++;
   }
   if(Math.abs(prev.roots[2]-s.roots[2])>1e-6)moved++;
   prev=s;
  }
  assert.ok(locked>15&&recovery>10&&moved>30);
 }
});
test('single-arm recovery pauses forward travel and retains nominal arm lengths',()=>{
 const c=setup(legless.filter(s=>!s.startsWith('R.')));let prev=c.getSnapshot(),paused=0;
 for(let i=0;i<240;i++){
  const s=step(c),a=s.crawlAnchors[0][0];
  if(a?.phase==='recover'&&prev.crawlAnchors[0][0]?.phase==='recover'){assert.ok(Math.abs(s.roots[2]-prev.roots[2])<1e-6);paused++;}
  for(const p of s.rigSegments[0].filter(p=>p.id.endsWith('Arm')))assert.ok(Math.abs(distance(p.a,p.b)-(p.id.endsWith('upperArm')?.36:.32))<1e-8);
  prev=s;
 }
 assert.ok(paused>10);
});
test('forearm stump can plant; no phantom hand and snapshots own anchor data',()=>{
 const c=setup(legless.filter(s=>!s.startsWith('R.')&&s!=='L.hand'));let found=false;
 for(let i=0;i<180;i++){
  const s=step(c);const a=s.crawlAnchors[0][0];
  if(a?.valid){assert.equal(a.segmentId,'L.lowerArm');assert.ok(!s.rigSegments[0].some(p=>p.id==='L.hand'));a.point[0]=999;assert.notEqual(c.getSnapshot().crawlAnchors[0][0].point[0],999);found=true;break;}
 }
 assert.ok(found);
});
