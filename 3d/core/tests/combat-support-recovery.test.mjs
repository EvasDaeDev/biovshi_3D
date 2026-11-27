import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT,DAMAGE} from '../dist/index.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';

const {ring}=await buildLocationCatalog();

for(const missing of [false,true])test(`contact provokes a planted recovery with ${missing?'one intact foot':'two intact feet'}`,()=>{
 const base=createAuthoredCombatConfig(7,ring,2),core=new LabSimulationCore();
 core.initialize({...base,fighters:[
  {...base.fighters[0],origin:[0,0,0],yawRad:0,segmentIds:base.fighters[0].segmentIds.filter(id=>!missing||id!=='R.foot')},
  {...base.fighters[1],origin:[0,0,-1.25],yawRad:Math.PI}
 ]});
 const idle={commands:[0,1].map(fighterId=>({fighterId,forward:0,turn:0,sprint:false}))};
 try{
  const before=core.getSnapshot();
  assert.ok(core.applyDamage({fighterId:0,attackerId:1,segmentId:'chest',amount:DAMAGE.criticalDamage}));
  const start=core.getSnapshot();
  const leg=start.footStates[0].findIndex(f=>f.moving);
  assert.ok(leg>=0);
  if(missing)assert.equal(leg,0);
  assert.deepEqual(start.footStates[0][leg].point,before.footStates[0][leg].point);
  assert.ok(start.footStates[0][leg].target[2]>before.footStates[0][leg].point[2]+.15);
  assert.ok(core.drainEvents().some(e=>e.type==='fighter-catch-step'&&e.fighterId===0));
  let moving=false,landed;
  for(let tick=0;tick<22;tick++){
   core.step(FIXED_DT,idle);
   const s=core.getSnapshot();
   assert.equal(s.postures[0],'upright');
   moving||=s.footStates[0][leg].point[1]>before.footStates[0][leg].point[1]+.02;
   if(!s.footStates[0][leg].moving){landed=s.footStates[0][leg].point;break;}
  }
  assert.ok(moving);
  assert.ok(landed,'recovery foot must land within the bounded swing');
  assert.ok(landed[2]>before.footStates[0][leg].point[2]+.14);
 }finally{core.dispose();}
});

test('a second impact during a catch step can bring the patient down; a planted hand hastens recovery',()=>{
 const base=createAuthoredCombatConfig(7,ring,2);
 const play=missing=>{
  const core=new LabSimulationCore();
  core.initialize({...base,fighters:[
   {...base.fighters[0],origin:[0,0,0],yawRad:0,segmentIds:base.fighters[0].segmentIds.filter(id=>!missing.includes(id))},
   {...base.fighters[1],origin:[1.5,0,0],yawRad:0}
  ]});
  const idle={commands:[0,1].map(fighterId=>({fighterId,forward:0,turn:0,sprint:false}))};
  try{
   assert.ok(core.applyDamage({fighterId:0,attackerId:1,segmentId:'chest',amount:DAMAGE.criticalDamage}));
   core.step(FIXED_DT,idle);
   assert.ok(core.applyDamage({fighterId:0,attackerId:1,segmentId:'abdomen',amount:DAMAGE.criticalDamage}));
   const events=core.drainEvents(),lengths=new Map(core.getSnapshot().rigSegments[0].map(p=>[p.id,Math.hypot(...p.a.map((v,i)=>v-p.b[i]))]));
   for(let i=0;i<140;i++){
    core.step(FIXED_DT,idle);
    events.push(...core.drainEvents());
    const s=core.getSnapshot();
    assert.equal(s.lifeStates[0],'active');
    for(const p of s.rigSegments[0])assert.ok(Math.abs(Math.hypot(...p.a.map((v,i)=>v-p.b[i]))-lengths.get(p.id))<1e-6,p.id);
   }
   assert.ok(events.some(e=>e.type==='fighter-catch-step'&&e.fighterId===0));
   assert.equal(events.filter(e=>e.type==='fighter-knocked-down'&&e.fighterId===0).length,1);
   return {braced:events.filter(e=>e.type==='fighter-braced'&&e.fighterId===0),end:events.find(e=>e.type==='fighter-recovered'&&e.fighterId===0)?.tick};
  }finally{core.dispose();}
 };
 const normal=play([]),one=play(['L.hand']),none=play(['L.hand','R.hand']);
 assert.equal(normal.braced.length,1);
 assert.equal(one.braced.length,1,'an intact opposite arm can substitute');
 assert.equal(none.braced.length,0);
 assert.ok(normal.end<none.end-12);
});
