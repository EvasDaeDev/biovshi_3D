import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {mobilityFor} from '../dist/rig/mobility.js';
const f=createLabConfig(7).fighters[0],legs=s=>/\.(upperLeg|lowerLeg|foot)$/.test(s),arms=s=>/\.(upperArm|lowerArm|hand)$/.test(s);
const legless=f.segmentIds.filter(s=>!legs(s)),headOnly=legless.filter(s=>!arms(s)),torso=headOnly.filter(s=>s!=='head'&&s!=='neck');
const make=ids=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,segmentIds:ids}]});return c;};
const step=(c,n,forward=1)=>{for(let i=0;i<n;i++)c.step(FIXED_DT,{commands:[{fighterId:0,forward,turn:0,sprint:true}]});return c.getSnapshot();};
const minY=p=>Math.min(p.a[1],p.b[1])-p.radius;
test('legless patient transitions down and only starts translating after fall',()=>{
 const c=make(legless),a=step(c,15);assert.equal(a.postures[0],'falling');assert.ok(Math.abs(a.roots[2]-f.origin[2])<1e-6);
 const b=step(c,60);assert.equal(b.postures[0],'prone');assert.ok(b.roots[2]<f.origin[2]);
 assert.ok(b.rigSegments[0].every(p=>Math.max(p.a[1],p.b[1])<.65&&minY(p)>-1e-8));
 assert.ok(Math.min(...b.rigSegments[0].map(minY))<.001);
});
test('available arms including stumps, head, and torso provide different locomotion modes',()=>{
 const one=legless.filter(s=>!s.startsWith('R.')||!arms(s)),stump=headOnly.concat('L.upperArm');
 assert.equal(mobilityFor(stump).mode,'arm-crawl');
 for(const [ids,mode] of [[legless,'arm-crawl'],[one,'arm-crawl'],[stump,'arm-crawl'],[headOnly,'head-crawl'],[torso,'torso-crawl']]){
  const c=make(ids),s=step(c,240);assert.equal(s.mobilityModes[0],mode);assert.ok(s.roots[2]<f.origin[2]-.03);assert.equal(s.postures[0],'prone');
  assert.ok(s.rigSegments[0].every(p=>[...p.a,...p.b].every(Number.isFinite)&&minY(p)>-1e-8));
 }
 const c=make(['head']),s=step(c,240);assert.equal(s.mobilityModes[0],'unsupported');assert.ok(Math.abs(s.roots[2]-f.origin[2])<1e-6);
});
test('settled crawl pose preserves arm bone lengths and stops on idle',()=>{
 const c=make(legless);const s=step(c,180),parts=s.rigSegments[0];
 for(const p of parts.filter(p=>p.id.endsWith('Arm')))assert.ok(Math.abs(Math.hypot(...p.a.map((v,i)=>v-p.b[i]))-(p.id.endsWith('upperArm')?.36:.32))<1e-8);
 step(c,180,0);const a=c.getSnapshot();const b=step(c,120,0);assert.ok(Math.abs(a.roots[2]-b.roots[2])<.001);
});
