import test from 'node:test';
import assert from 'node:assert/strict';
import {Knockdown,KNOCKDOWN} from '../dist/rig/knockdown.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
test('knockdown threshold, grounded reaction, rise and cooldown are fixed-step',()=>{
 const k=new Knockdown();
 assert.equal(k.observe(.04,-.2,true),false);
 assert.equal(k.observe(.08,.01,true),false);
 assert.equal(k.observe(.08,-.04,true),true);
 assert.equal(k.phase,'falling');assert.equal(k.amount,0);
 for(let i=0;i<Math.ceil(KNOCKDOWN.fall/FIXED_DT);i++)k.advance(FIXED_DT,true);
 assert.equal(k.phase,'down');assert.equal(k.amount,1);
 for(let i=0;i<Math.ceil(KNOCKDOWN.hold/FIXED_DT);i++)k.advance(FIXED_DT,true);
 assert.equal(k.phase,'rising');assert.equal(k.amount,1);
 for(let i=0;i<Math.ceil(KNOCKDOWN.rise/FIXED_DT);i++)k.advance(FIXED_DT,true);
 assert.equal(k.phase,'standing');assert.equal(k.observe(.2,-1,true),false);
 for(let i=0;i<40;i++)k.advance(FIXED_DT,true);
 assert.equal(k.observe(.2,-1,true),true);
 k.advance(FIXED_DT,false);assert.equal(k.phase,'standing');
});
test('strong collision produces temporary knockdown and recovery without losing bones',()=>{
 const base=createLabConfig(7).fighters;
 const c=new LabSimulationCore();c.initialize({seed:7,labDynamicBalance:true,fighters:[{...base[0],origin:[0,0,0],yawRad:0},{...base[1],origin:[.08,0,0],yawRad:0}]});
 const input={commands:[0,1].map(fighterId=>({fighterId,forward:0,turn:0,sprint:false}))};
 const phases=new Set(),events=[],lengths=new Map(LAB_SEGMENTS.map(p=>[p.id,p.nominalLength]));
 for(let i=0;i<240;i++){
  c.step(FIXED_DT,input);const s=c.getSnapshot();phases.add(s.balanceStates[0]);events.push(...c.drainEvents());
  for(const p of s.rigSegments[0])assert.ok(Math.abs(Math.hypot(...p.a.map((v,j)=>v-p.b[j]))-lengths.get(p.id))<1e-8,p.id);
  if(s.balanceStates[0]==='down')assert.ok(s.rigSegments[0].every(p=>Math.max(p.a[1],p.b[1])<.8));
 }
 for(const phase of ['falling','down','rising','standing'])assert.ok(phases.has(phase),phase);
 assert.ok(events.some(e=>e.fighterId===0&&e.type==='fighter-knocked-down'));
 assert.ok(events.some(e=>e.fighterId===0&&e.type==='fighter-recovered'));
 assert.equal(c.getSnapshot().balanceStates[0],'standing');
});
test('unperturbed walking does not cause spontaneous knockdown',()=>{
 const f=createLabConfig(7).fighters[0],c=new LabSimulationCore();c.initialize({seed:7,labDynamicBalance:true,fighters:[f]});
 for(let i=0;i<180;i++){
  c.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:.1,sprint:false}]});
  assert.equal(c.getSnapshot().balanceStates[0],'standing');
 }
});
