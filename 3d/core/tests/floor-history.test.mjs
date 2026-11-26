import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {LabSimulationCore,createLabConfig,FIXED_DT,createFloorHistory,readFloorHistory,FLOOR_VERSION} from '../dist/index.js';

const bare={source:'segment',x:0,z:0,radius:.5,height:.2};
const visual={id:0,fighterId:0,segmentId:'L.hand',settled:true,length:0,radius:.083,
 position:{x:0,y:.083,z:0},rotation:{x:0,y:0,z:0,w:1}};

test('versioned P4 floor JSON is scoped, deep-copied and rejects invalid or dynamic anatomy',()=>{
 const loose=createFloorHistory('ward',[bare],[visual],[{fighterId:0,id:0,tick:8,point:[0,.01,0]}]);
 assert.equal(loose.schemaVersion,FLOOR_VERSION);
 assert.equal(loose.mounds[0].id,'floor:m:0');
 assert.equal(loose.visuals[0].id,'floor:v:0');
 const saved=readFloorHistory(JSON.parse(JSON.stringify(loose)),'ward');
 assert.deepEqual(saved,loose);
 saved.mounds[0].x=999;saved.visuals[0].position.x=999;saved.oilMarks[0].point[0]=999;
 assert.equal(loose.mounds[0].x,0);assert.equal(loose.visuals[0].position.x,0);
 assert.equal(loose.oilMarks[0].point[0],0);
 assert.throws(()=>readFloorHistory(loose,'ring'),/Invalid floor/);
 assert.throws(()=>readFloorHistory({...loose,schemaVersion:2},'ward'),/Invalid floor/);
 assert.throws(()=>readFloorHistory({...loose,mounds:[{...bare,height:.4}]},'ward'),/Invalid archived floor mound/);
 assert.throws(()=>readFloorHistory({...loose,visuals:[{...visual,settled:false}]},'ward'),/Invalid archived visual anatomy/);
 assert.throws(()=>readFloorHistory({...loose,visuals:[{...visual,rotation:{x:0,y:0,z:0,w:0}}]},'ward'),/Unnormalized/);
 assert.throws(()=>readFloorHistory({...loose,oilMarks:[{fighterId:0,point:[NaN,0,0]}]},'ward'),/Invalid archived oil/);
 assert.deepEqual(createFloorHistory('ward',[],[],[]).mounds,[]);
});

test('Rapier round reset preserves exact old body/branch/single visuals and static walkable cones',async()=>{
 await RAPIER.init();
 const config=createLabConfig(7),c=new LabSimulationCore(),w=new DebrisWorld(RAPIER);
 c.initialize({seed:7,fighters:[{...config.fighters[0],origin:[0,0,0]}]});
 try{
  assert.equal(c.applyDamage({fighterId:0,segmentId:'L.hand',amount:3}),true);
  assert.equal(c.applyDamage({fighterId:0,segmentId:'R.upperLeg',amount:3}),true);
  for(const e of c.drainEvents())w.accept(e);
  assert.equal(c.incapacitate(0),true);
  for(const e of c.drainEvents())w.accept(e);
  assert.throws(()=>w.exportSettledFloor('ward'),/while physics bodies are falling/);
  for(let i=0;i<1500;i++){
   w.step(FIXED_DT);
   if(w.bodySnapshot().every(b=>b.settled)&&w.snapshot().every(d=>d.settled))break;
  }
  const body=w.bodySnapshot()[0];
  const pools=w.bodyPoolSnapshot();assert.equal(pools.length,1);assert.ok(pools[0].radius>0);
  assert.ok(body.settled,JSON.stringify(body.motion));
  assert.ok(w.snapshot().every(d=>d.settled));
  const expectedVisualCount=w.snapshot().length+body.parts.length;
  const originalMounds=w.moundSnapshot();
  const saved=w.exportSettledFloor('ward',[{id:0,fighterId:0,tick:12,point:[.3,.01,.4]}]);
  assert.equal(saved.visuals.length,expectedVisualCount);
  assert.equal(saved.mounds.length,originalMounds.length);
  assert.ok(saved.visuals.some(d=>d.segmentId==='L.hand'));
  assert.ok(saved.visuals.some(d=>d.segmentId==='chest'));
  assert.ok(saved.visuals.some(d=>d.segmentId==='R.lowerLeg'));
  assert.ok(saved.mounds.every(m=>m.height<=.300001));
  const json=JSON.parse(JSON.stringify(saved));
  const next=new DebrisWorld(RAPIER);
  try{
   next.reset([],json,'ward');
   assert.equal(next.bodySnapshot().length,0,'saved corpses are not reactivated ragdolls');
   assert.equal(next.branchSnapshot().length,0,'saved branches are plain rendered remains');
   assert.equal(next.snapshot().length,expectedVisualCount);
   assert.equal(next.moundSnapshot().length,saved.mounds.length);
   assert.deepEqual(next.moundSnapshot(),saved.mounds);
   assert.deepEqual(next.archivedOilSnapshot(),saved.oilMarks);
   assert.ok(next.world.colliders.len()>=saved.mounds.length+5,'old low cones are real Rapier colliders');
   assert.throws(()=>next.reset([],json,'ring'),/Invalid floor version/);
   assert.deepEqual(next.moundSnapshot(),saved.mounds,'invalid import must not destroy the current world');
   const hit={type:'segment-detached',fighterId:0,tick:1,detachedPose:{id:'R.hand',a:[2,1.2,0],b:[2,1.2,0],radius:.083}};
   next.accept(hit);
   const fresh=next.snapshot().find(d=>d.segmentId==='R.hand'&&!d.settled);
   assert.equal(typeof fresh.id,'number');
   assert.equal(new Set(next.snapshot().map(d=>d.id)).size,next.snapshot().length,'old and new mesh IDs are disjoint');
   const initial=next.snapshot().length;
   for(let i=0;i<950;i++)next.step(FIXED_DT);
   assert.equal(next.snapshot().length,initial,'archived geometry is never deleted by later rounds');
   assert.ok(next.snapshot().every(d=>d.settled));
   const later=next.exportSettledFloor('ward',[{id:0,fighterId:0,tick:5,point:[1,.01,0]}]);
   assert.equal(later.visuals.length,expectedVisualCount+1);
   assert.equal(later.oilMarks.length,3);assert.equal(later.oilMarks.filter(o=>o.radius!==undefined).length,1);
   next.reset([],later,'ward');
   assert.equal(next.snapshot().length,expectedVisualCount+1);
   next.reset();
   assert.equal(next.snapshot().length,0,'explicit clean reset keeps former diagnostic semantics');
   assert.equal(next.moundSnapshot().length,0);
   assert.equal(next.archivedOilSnapshot().length,0);
  }finally{next.dispose();}
 }finally{w.dispose();c.dispose();}
});
