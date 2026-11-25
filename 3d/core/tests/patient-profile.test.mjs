import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT,PatientBehavior,patientTraits,statMultiplier,critChance} from '../dist/index.js';
const profile=(movement=3,critical=3,turning=3,temperament='balanced')=>({movement,critical,turning,temperament});
test('effective stat curves match v1 including fractional and capped values',()=>{
 for(const [n,m,c] of [[2,.8,0],[3,1,.15],[4,1.2,.30],[4.5,1.275,.34],[5,1.35,.38],[9,1.8,.60],[20,1.8,.60]]){
  assert.ok(Math.abs(statMultiplier(n)-m)<1e-9);assert.ok(Math.abs(critChance(n)-c)<1e-9);
 }
 assert.equal(patientTraits().criticalChance,0);assert.throws(()=>patientTraits(profile(NaN)));assert.throws(()=>patientTraits(profile(1)));
});
test('individual reaction and recovery are bounded and deterministic',()=>{
 const fast=new PatientBehavior(7,0,profile(4,2,3,'impulsive')),slow=new PatientBehavior(7,1,profile(2,4,3,'hesitant'));
 fast.notice(2,10);slow.notice(2,10);assert.equal(fast.ready(10),false);
 assert.equal(fast.ready(15),true);assert.equal(slow.ready(15),false);assert.equal(slow.ready(28),true);
 slow.notice(2,27);assert.equal(slow.ready(28),true);slow.started(28,54);assert.equal(slow.ready(82),false);assert.equal(slow.ready(96),true);
 slow.notice(3,96);assert.equal(slow.ready(96),false);assert.equal(slow.ready(114),true);
});
test('critical rolls are independent of other fighters and reproduce from seed',()=>{
 const a=new PatientBehavior(7,1,profile(3,9)),b=new PatientBehavior(7,1,profile(3,9)),other=new PatientBehavior(7,0,profile(3,9)),zero=new PatientBehavior(7,0,profile(3,2));
 const seq=Array.from({length:200},()=>{other.damage();other.damage();return a.damage();});
 assert.deepEqual(seq,Array.from({length:200},()=>b.damage()));assert.ok(seq.filter(n=>n===2).length>70&&seq.filter(n=>n===2).length<150);
 assert.ok(Array.from({length:100},()=>zero.damage()).every(n=>n===1));
});
test('movement and turning use separate effective stats, snapshots are owned',()=>{
 const f={...createLabConfig(7).fighters[0],origin:[0,0,0],yawRad:0};
 const run=p=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,profile:p}]});
 for(let i=0;i<60;i++)c.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:.5,sprint:false}]});
 return c.getSnapshot();};
 const a=run(profile(4,3,4)),b=run(profile(2,3,2));
 assert.ok(Math.hypot(a.roots[0],a.roots[2])>Math.hypot(b.roots[0],b.roots[2])*1.3);
 assert.ok(a.roots[3]>b.roots[3]*1.4);
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,profile:profile()}]});
 const s=c.getSnapshot();s.patientTraits[0].criticalChance=999;assert.equal(c.getSnapshot().patientTraits[0].criticalChance,.15);
});
test('profiled duel rolls only on actual contacts and reproduces damage events',()=>{
 const base=createLabConfig(7);
 const run=()=>{const c=new LabSimulationCore();c.initialize({seed:7,combatEnabled:true,fighters:[{...base.fighters[0],origin:[0,0,.65],yawRad:0,profile:profile(3,9,3,'impulsive')},{...base.fighters[1],origin:[0,0,-.65],yawRad:Math.PI,profile:profile(3,2,3,'hesitant')}]});
 const e=[];for(let i=0;i<1200;i++){c.step(FIXED_DT,{commands:[]});e.push(...c.drainEvents());}
 const hits=e.filter(v=>v.type==='fighter-damaged');assert.ok(hits.length>=2);
 for(const h of hits){assert.ok(e.some(v=>v.type==='strike-contact'&&v.tick===h.tick&&v.fighterId===h.fighterId&&v.attackerId===h.attackerId&&v.segmentId===h.segmentId));if(h.attackerId===1)assert.equal(h.critical,false);}
 assert.ok(hits.some(h=>h.attackerId===0&&h.critical),JSON.stringify(hits));return e;};
 assert.deepEqual(run(),run());
});
