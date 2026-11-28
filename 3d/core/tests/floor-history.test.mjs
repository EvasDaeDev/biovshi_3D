import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {RemainsCooling} from '../../lab-next/remains-cooling.js';
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
  assert.equal(c.applyDamage({fighterId:0,segmentId:'L.hand',amount:4}),true);
  assert.equal(c.applyDamage({fighterId:0,segmentId:'R.upperLeg',amount:4}),true);
  for(const e of c.drainEvents())w.accept(e);
  assert.equal(c.incapacitate(0),true);
  for(const e of c.drainEvents())w.accept(e);
  assert.throws(()=>w.exportSettledFloor('ward'),/while physics bodies are falling/);
  const cooling=new RemainsCooling(),settledParts=new Map();
  let bodySettled=null;
  for(let tick=1;tick<=1500;tick++){
   w.step(FIXED_DT);
   const settled=w.bodySnapshot()[0].settled,parts=w.snapshot();
   cooling.record({fighterIds:[0],bodyTerrainStates:[settled],tick},parts);
   if(settled)bodySettled??=tick;
   else assert.equal(cooling.body(0,tick),1);
   for(const part of parts){
    if(part.settled&&!settledParts.has(part.id))settledParts.set(part.id,tick);
    if(!part.settled)assert.equal(cooling.part(part.id,tick),1);
   }
   if(settled&&parts.every(d=>d.settled))break;
  }
  const fades=(sample,start)=>{
   assert.equal(sample(start-1),1);
   assert.equal(sample(start),1);
   assert.ok(sample(start+1)<1);
   assert.ok(Math.abs(sample(start+60)-.70)<1e-10);
   assert.ok(sample(start+119)>.40);
   assert.equal(sample(start+120),.40);
   assert.equal(sample(start+240),.40);
  };
  assert.ok(bodySettled>0);
  fades(tick=>cooling.body(0,tick),bodySettled);
  assert.equal(settledParts.size,4);
  for(const [id,tick] of settledParts)fades(t=>cooling.part(id,t),tick);
  cooling.reset();
  assert.equal(cooling.body(0,bodySettled+120),1);
  const body=w.bodySnapshot()[0];
  const pools=w.bodyPoolSnapshot();assert.equal(pools.length,1);assert.ok(pools[0].radius>0);
  assert.ok(body.settled,JSON.stringify(body.motion));
  assert.ok(w.snapshot().every(d=>d.settled));
  const expectedVisualCount=w.snapshot().length+body.parts.length;
  const originalMounds=w.moundSnapshot();
  const saved=w.exportSettledFloor('ward',[{id:0,fighterId:0,tick:12,point:[.3,.01,.4]}],new Map([[0,'01.webp']]));
  assert.equal(saved.visuals.length,expectedVisualCount);
  assert.equal(saved.mounds.length,originalMounds.length);
  assert.ok(saved.visuals.some(d=>d.segmentId==='L.hand'));
  assert.ok(saved.visuals.some(d=>d.segmentId==='chest'));
  assert.equal(saved.visuals.find(d=>d.segmentId==='head').portrait,'01.webp');
  assert.ok(saved.visuals.some(d=>d.segmentId==='R.lowerLeg'));
  assert.ok(saved.mounds.every(m=>m.height<=.300001));
  const json=JSON.parse(JSON.stringify(saved));
  const next=new DebrisWorld(RAPIER);
  try{
   next.reset([],json,'ward');
   assert.equal(next.bodySnapshot().length,0,'saved corpses are not reactivated ragdolls');
   assert.equal(next.branchSnapshot().length,0,'saved branches are plain rendered remains');
   assert.equal(next.snapshot().length,expectedVisualCount);
   assert.ok(next.snapshot().every(d=>cooling.part(d.id,0)===.40));
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
   const later=next.exportSettledFloor('ward',[{id:0,fighterId:0,tick:5,point:[1,.01,0]}],new Map([[0,'02.webp']]));
   assert.equal(later.visuals.length,expectedVisualCount+1);
   assert.equal(later.visuals.find(d=>d.segmentId==='head').portrait,'01.webp');
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

test('destroying the pelvis or spine drops one physical lower body and preserves the upper body',async()=>{
 await RAPIER.init();
 const lower=['pelvis','L.upperLeg','L.lowerLeg','L.foot','R.upperLeg','R.lowerLeg','R.foot'];
 for(const target of ['pelvis','abdomen']){
  const config=createLabConfig(7),core=new LabSimulationCore(),world=new DebrisWorld(RAPIER);
  const expected=target==='abdomen'?lower.filter(id=>id!=='L.foot'):lower;
  try{
   core.initialize({seed:7,fighters:[{...config.fighters[0],segmentIds:config.fighters[0].segmentIds
    .filter(id=>target!=='abdomen'||id!=='L.foot')}]});
   const damage=amount=>core.applyDamage({fighterId:0,segmentId:target,amount});
   const advance=()=>{core.step(FIXED_DT,{commands:[{fighterId:0,forward:0,turn:0,sprint:false}]});world.step(FIXED_DT);};
   assert.ok(damage(3));
   assert.ok(!core.drainEvents().some(event=>event.type==='segment-detached'));
   assert.ok(core.getSnapshot().segmentIds[0].includes('pelvis'));
   for(let i=0;i<17;i++)advance();
   assert.ok(damage(2));
   const cuts=core.drainEvents().filter(event=>event.type==='segment-detached');
   assert.equal(cuts.length,1);
   assert.equal(cuts[0].segmentId,'pelvis');
   assert.deepEqual(cuts[0].detachedParts.map(part=>part.id),expected);
   world.accept(cuts[0]);
   const snapshot=core.getSnapshot();
   assert.equal(snapshot.lifeStates[0],'active');
   assert.equal(snapshot.mobilityModes[0],'arm-crawl');
   assert.deepEqual(snapshot.oil[0].wounds,['pelvis']);
   assert.ok(expected.every(id=>!snapshot.segmentIds[0].includes(id)));
   assert.ok(['abdomen','chest','head','L.hand','R.hand'].every(id=>snapshot.segmentIds[0].includes(id)));
   for(let i=0;i<900&&!world.branchSnapshot()[0]?.settled;i++)advance();
   const branches=world.branchSnapshot();
   assert.equal(branches.length,1);
   assert.ok(branches[0].settled);
   assert.deepEqual(world.exportSettledFloor('ward').visuals.map(part=>part.segmentId),expected);
   assert.equal(core.getSnapshot().postures[0],'prone');
  }finally{core.dispose();world.dispose();}
 }
});
