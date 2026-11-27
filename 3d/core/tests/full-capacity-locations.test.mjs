import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLegacyLocationFixtures} from './legacy-location-fixtures.mjs';
import {createAuthoredCombatConfig,LabSimulationCore,PolygonNavigation,FIXED_DT} from '../dist/index.js';

let cached;
const getCatalog=async()=>cached??=await buildLegacyLocationFixtures();
const minPairDistance=points=>Math.min(...points.flatMap((a,i)=>points.slice(i+1).map(b=>Math.hypot(a[0]-b[0],a[2]-b[2]))));

test('P4 all eight authored arenas preserve four v1 starter positions and expose their full safe capacity',async()=>{
 const catalog=await getCatalog(),expected={ward:10,ring:3,annulus:4,sluice:5,zigzag:7,columns:10,maze:10,throat:6};
 assert.deepEqual(Object.fromEntries(Object.entries(catalog).map(([id,l])=>[id,l.capacity])),expected);
 for(const [name,location] of Object.entries(catalog)){
  const spots=location.spawnSlots,nav=new PolygonNavigation(location);
  assert.equal(spots.length,location.capacity,name);
  assert.deepEqual(spots.slice(0,Math.min(4,location.capacity)),location.spawns.slice(0,Math.min(4,location.capacity)),name+' changed legacy starts');
  assert.ok(minPairDistance(spots)>=.649999,name+' generated overlapping starts');
  for(const origin of spots){
   assert.ok(origin.every(Number.isFinite),name+' nonfinite point');
   const p={x:origin[0],z:origin[2]};
   assert.equal(nav.clear(p,p,.5),true,name+' starts inside native wall clearance: '+JSON.stringify(p));
  }
 }
});

test('P4 authored combat uses existing character profiles for 2 to 10 unique, valid participants',async()=>{
 const catalog=await getCatalog();
 for(const location of Object.values(catalog)){
  for(const count of [2,location.capacity]){
   const config=createAuthoredCombatConfig(7,location,count);
   assert.equal(config.fighters.length,count);
   assert.equal(config.combatEnabled,true);
   assert.equal(config.perceptionCombat,true);
   assert.deepEqual(config.fighters.map(f=>f.id),Array.from({length:count},(_,i)=>i));
   assert.ok(config.fighters.every(f=>f.segmentIds.includes('head')));
   const core=new LabSimulationCore();
   try{
    core.initialize(config);
    assert.equal(core.getSnapshot().fighterIds.length,count);
   }finally{core.dispose();}
  }
  assert.throws(()=>createAuthoredCombatConfig(7,location,location.capacity+1),/Unsupported authored/);
  assert.throws(()=>createAuthoredCombatConfig(7,location,1),/Unsupported authored/);
 }
});

test('P4 4/5/6/7/10-patient native arenas advance safely through dynamic combat and wall contacts',async()=>{
 const catalog=await getCatalog();
 for(const location of Object.values(catalog)){
  const core=new LabSimulationCore();
  core.initialize(createAuthoredCombatConfig(19,location));
  const nav=new PolygonNavigation(location);
  try{
   for(let tick=0;tick<240;tick++){
    core.step(FIXED_DT,{commands:[]});
    const events=core.drainEvents();
    assert.ok(events.every(e=>e.tick>=0&&e.tick<=tick+1),location.id+' invalid event time');
    if(tick%30!==29)continue;
    const snapshot=core.getSnapshot();
    assert.equal(snapshot.fighterIds.length,location.capacity);
    assert.ok(Array.from(snapshot.roots).every(Number.isFinite),location.id+' nonfinite root');
    assert.ok(snapshot.rigSegments.flat().every(p=>p.a.every(Number.isFinite)&&p.b.every(Number.isFinite)),location.id+' nonfinite anatomy');
    assert.ok(snapshot.routes.every(r=>r.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z))),location.id+' nonfinite route');
    for(let i=0;i<location.capacity;i++){
     if(snapshot.lifeStates[i]!=='active')continue;
     const p={x:snapshot.roots[i*4],z:snapshot.roots[i*4+2]};
     assert.equal(nav.clear(p,p,.40),true,location.id+' escaped geometry: '+JSON.stringify(p));
    }
   }
  }finally{core.dispose();}
 }
});
