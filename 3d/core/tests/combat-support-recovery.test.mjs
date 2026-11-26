import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
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
  assert.ok(core.applyDamage({fighterId:0,attackerId:1,segmentId:'chest',amount:2}));
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
