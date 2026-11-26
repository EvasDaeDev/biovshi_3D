import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
test('damaged ragdoll does not recreate removed anatomy and leaves detached single visible',async()=>{
 await RAPIER.init();const w=new DebrisWorld(RAPIER),c=new LabSimulationCore();
 const f={...createLabConfig(7).fighters[0],origin:[0,0,0],segmentIds:createLabConfig(7).fighters[0].segmentIds.filter(id=>!/^R\.(upperLeg|lowerLeg|foot)$/.test(id))};
 c.initialize({seed:7,fighters:[f]});
 try{
  c.applyDamage({fighterId:0,segmentId:'L.hand',amount:4});
  for(const e of c.drainEvents())w.accept(e);
  c.incapacitate(0);for(const e of c.drainEvents())w.accept(e);
  const initial=w.bodySnapshot()[0];assert.equal(initial.parts.length,13);assert.equal(initial.dynamicBodies,11);assert.equal(initial.joints,10);
  for(let i=0;i<1200;i++){w.step(FIXED_DT);for(const b of w.bodySnapshot())c.setIncapacitatedPose(b.fighterId,b.parts,b.settled);}
  const b=w.bodySnapshot()[0];assert.ok(b.settled,JSON.stringify(b));assert.deepEqual(b.parts.map(p=>p.id),initial.parts.map(p=>p.id));
  assert.equal(b.dynamicBodies,0);assert.equal(b.joints,0);
  assert.ok(!b.parts.some(p=>p.id==='L.hand'||/^R\.(upperLeg|lowerLeg|foot)$/.test(p.id)));
  const singles=w.snapshot();assert.equal(singles.length,1);assert.ok(singles[0].settled);assert.equal(singles[0].segmentId,'L.hand');
  assert.equal(w.moundSnapshot().filter(m=>m.source==='segment').length,1);
 }finally{w.dispose();}
});
