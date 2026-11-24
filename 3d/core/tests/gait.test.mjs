import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const input={commands:[{fighterId:0,forward:1,turn:0,sprint:false}]};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('rig snapshot has 136 ordered capsules and finite endpoints',()=>{
 const c=new LabSimulationCore();c.initialize(createLabConfig(7));
 for(let i=0;i<180;i++)c.step(FIXED_DT,input);
 const s=c.getSnapshot();assert.equal(s.rigVersion,2);assert.equal(s.rigSegments.flat().length,136);
 s.rigSegments.forEach((parts,i)=>{assert.deepEqual(parts.map(p=>p.id),s.segmentIds[i]);for(const p of parts)assert.ok([...p.a,...p.b,p.radius].every(Number.isFinite));});
 for(const p of s.rigSegments.flat())if(p.id.endsWith('Leg'))assert.ok(Math.abs(distance(p.a,p.b)-(p.id.endsWith('upperLeg')?.49:.50))<1e-8);
});
test('rig snapshots are independent and deterministic after reset',()=>{
 const c=new LabSimulationCore(),cfg=createLabConfig(3);const run=()=>{c.initialize(cfg);for(let i=0;i<100;i++)c.step(FIXED_DT,input);return c.getSnapshot();};
 const a=run(),b=run();assert.deepEqual(a,b);a.rigSegments[0][0].a[0]=999;assert.notEqual(c.getSnapshot().rigSegments[0][0].a[0],999);
});

test('pelvis and chest are connected to leg and arm roots',()=>{
 const c=new LabSimulationCore();c.initialize(createLabConfig(7));
 for(const parts of c.getSnapshot().rigSegments){const p=Object.fromEntries(parts.map(p=>[p.id,p]));
  assert.deepEqual(p.pelvis.a,p['L.upperLeg'].a);assert.deepEqual(p.pelvis.b,p['R.upperLeg'].a);
  assert.deepEqual(p.chest.a,p['L.upperArm'].a);assert.deepEqual(p.chest.b,p['R.upperArm'].a);
  assert.ok(Math.abs(distance(p.pelvis.a,p.pelvis.b)-.34)<1e-8);
  assert.ok(Math.abs(distance(p.chest.a,p.chest.b)-.68)<1e-8);
 }
});
test('terrain lifts root and feet, copies data, and reset restores flat ground',()=>{
 const c=new LabSimulationCore(),cfg={seed:7,fighters:[createLabConfig(7).fighters[0]]};c.initialize(cfg);
 const m={x:0,z:1.4,radius:.7,height:.3};c.setTerrainMounds([m]);m.height=0;
 for(let i=0;i<60;i++)c.step(FIXED_DT,{commands:[]});
 const s=c.getSnapshot();assert.ok(Math.abs(s.roots[1]-.3)<1e-6);
 for(const p of s.rigSegments[0].filter(p=>p.id.endsWith('foot')))assert.ok(p.a[1]>.15);
 c.initialize(cfg);assert.equal(c.getSnapshot().roots[1],0);
});
