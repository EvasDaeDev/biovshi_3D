import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {advanceCombatStep} from '../../lab-next/combat-step.js';
test('v1 result is immutable: wounded last survivor does not bleed out during corpse settling',async()=>{
 await RAPIER.init();
 const c=new LabSimulationCore(),w=new DebrisWorld(RAPIER);
 const base=createLabConfig(7);
 const fighters=[{...base.fighters[0],origin:[-2,0,0]},{...base.fighters[1],origin:[2,0,0]}];
 c.initialize({seed:7,fighters,combatEnabled:true});
 const idle={commands:fighters.map(f=>({fighterId:f.id,forward:0,turn:0,sprint:false}))};
 try{
  for(const segmentId of ['L.upperArm','R.upperArm','L.upperLeg','R.upperLeg'])assert.ok(c.applyDamage({fighterId:0,segmentId,amount:3.6}));
  for(const e of c.drainEvents())w.accept(e);
  advanceCombatStep(c,w,FIXED_DT,idle);
  const deadline=c.getSnapshot().oil[0].failureTick;assert.ok(deadline>0);
  assert.ok(c.incapacitate(1));
  let events=advanceCombatStep(c,w,FIXED_DT,idle);
  assert.equal(events.filter(e=>e.type==='fight-ended').length,1);
  const result=c.getSnapshot();assert.deepEqual(result.fight,{ended:true,winnerId:0});
  assert.equal(c.applyDamage({fighterId:0,segmentId:'head',amount:6}),false);
  assert.equal(c.incapacitate(0),false);
  for(let i=0;i<1100;i++){
   events=advanceCombatStep(c,w,FIXED_DT,idle);
   assert.ok(!events.some(e=>['fighter-damaged','fighter-incapacitated','fight-ended','oil-drop'].includes(e.type)));
  }
  const end=c.getSnapshot();assert.ok(end.tick>deadline);
  assert.deepEqual(end.fight,result.fight);assert.deepEqual(end.lifeStates,['active','incapacitated']);
  assert.deepEqual(end.health,result.health);assert.equal(end.oilMarks.length,result.oilMarks.length);
  assert.equal(end.bodyTerrainStates[1],true);assert.equal(w.snapshot().length,12);
 }finally{w.dispose();c.dispose();}
});
