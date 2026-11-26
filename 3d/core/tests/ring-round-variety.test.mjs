import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';

test('ring opening is replayable, varies with seed and avoids mirrored early strikes',async()=>{
 const {ring}=await buildLocationCatalog();
 const play=seed=>{
  const core=new LabSimulationCore();
  core.initialize(createAuthoredCombatConfig(seed,ring,8));
  try{
   const initial=core.getSnapshot().roots,turns=new Map(),windups=[],targets=[];
   for(let tick=0;tick<600;tick++){
    core.step(FIXED_DT,{commands:[]});
    if(tick<135&&tick%3===0){
     const roots=core.getSnapshot().roots;
     for(let i=0;i<8;i++){
      if(!turns.has(i)&&Math.abs(roots[i*4+3]-initial[i*4+3])>.075)turns.set(i,tick);
     }
    }
    for(const e of core.drainEvents()){
     if(e.type==='combat-target')targets.push([e.fighterId,e.targetId]);
     if(e.type==='combat-windup')windups.push([e.tick,e.fighterId,e.targetId,e.strikeKind]);
    }
   }
   return {turns:[...turns],targets,windups};
  }finally{core.dispose();}
 };
 const samples=[7,19,42].map(play);
 assert.deepEqual(play(7),samples[0]);
 assert.equal(new Set(samples.map(x=>JSON.stringify(x.targets.slice(0,12)))).size,3);
 for(const {turns,windups} of samples){
  assert.ok(turns.length===8&&new Set(turns.map(([,tick])=>tick)).size>=4);
  assert.ok(windups.length>=5,JSON.stringify({windups}));
  assert.ok(windups[4][0]-windups[0][0]>12);
  for(let i=0;i<windups.length;i++){
   const [tick,from,to]=windups[i];
   assert.ok(!windups.slice(0,i).some(([earlier,attacker,opponent])=>tick-earlier<=6&&from===opponent&&to===attacker),
    JSON.stringify({windups}));
  }
 }
});
