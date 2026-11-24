import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const input={commands:[{fighterId:0,forward:1,turn:0,sprint:false}]};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('rig snapshot has 120 ordered capsules and finite endpoints',()=>{
 const c=new LabSimulationCore();c.initialize(createLabConfig(7));
 for(let i=0;i<180;i++)c.step(FIXED_DT,input);
 const s=c.getSnapshot();assert.equal(s.rigVersion,1);assert.equal(s.rigSegments.flat().length,120);
 s.rigSegments.forEach((parts,i)=>{assert.deepEqual(parts.map(p=>p.id),s.segmentIds[i]);for(const p of parts)assert.ok([...p.a,...p.b,p.radius].every(Number.isFinite));});
 for(const p of s.rigSegments.flat())if(p.id.endsWith('Leg'))assert.ok(Math.abs(distance(p.a,p.b)-(p.id.endsWith('upperLeg')?.49:.50))<1e-8);
});
test('rig snapshots are independent and deterministic after reset',()=>{
 const c=new LabSimulationCore(),cfg=createLabConfig(3);const run=()=>{c.initialize(cfg);for(let i=0;i<100;i++)c.step(FIXED_DT,input);return c.getSnapshot();};
 const a=run(),b=run();assert.deepEqual(a,b);a.rigSegments[0][0].a[0]=999;assert.notEqual(c.getSnapshot().rigSegments[0][0].a[0],999);
});
