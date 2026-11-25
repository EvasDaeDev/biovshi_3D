import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {buildLocationCatalog} from './catalog-locations.mjs';
import {LabSimulationCore,createAuthoredCombatConfig,PolygonNavigation,FIXED_DT} from '../dist/index.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {advanceCombatStep} from '../../lab-next/combat-step.js';
import {assertVisibleAnatomy,segmentKey} from './arena-audit-invariants.mjs';

/** P4 acceptance telemetry, never a manufactured knockout.
 * CI runs 60 simulated seconds on each full-capacity authored map; a shorter
 * P4_AUDIT_SECONDS=10 is useful for local focused iteration only.
 * Incomplete fights remain explicitly "combat-open". */
const seconds=Number(process.env.P4_AUDIT_SECONDS??60);
if(!Number.isInteger(seconds)||seconds<2||seconds>120)
 throw new RangeError('P4_AUDIT_SECONDS must be between 2 and 120');
const round=x=>Math.round(x*1000)/1000;
const summary=values=>{
 const a=[...values].sort((x,y)=>x-y),q=p=>round(a[Math.floor((a.length-1)*p)]);
 return {p50:q(.5),p95:q(.95),p99:q(.99),max:round(a.at(-1)),total:round(a.reduce((x,y)=>x+y,0))};
};
const catalog=await buildLocationCatalog();
await RAPIER.init();
const reports=[],input={commands:[]};
for(const location of Object.values(catalog)){
 const config=createAuthoredCombatConfig(19,location),core=new LabSimulationCore(),world=new DebrisWorld(RAPIER);
 const nav=new PolygonNavigation(location),samples=[],start=performance.now();
 const expected=new Set(config.fighters.flatMap(f=>f.segmentIds.map(s=>segmentKey(f.id,s))));
 const detachedKeys=new Set(),incapacitated=new Set(),stationarySeconds=new Map(),lastPositions=new Map();
 let minActive=location.capacity,peakRagdolls=0,peakCones=0,damageEvents=0;
 let windups=0,contacts=0,oilDrops=0,terminalEvents=0,finishTick=null,lastHitTick=0,maxQuietTicks=0;
 let longestStationarySeconds=0,stationaryPatientId=null;
 try{
  core.initialize(config);
  world.reset(location.walls,null,location.id,location,config.gradedSurface);
  assert.equal(core.getSnapshot().fighterIds.length,location.capacity);
  for(let tick=1;tick<=seconds*60;tick++){
   const t=performance.now();
   const events=advanceCombatStep(core,world,FIXED_DT,input);
   samples.push(performance.now()-t);
   for(const e of events){
    if(e.type==='combat-windup')windups++;
    if(e.type==='strike-contact')contacts++;
    if(e.type==='oil-drop')oilDrops++;
    if(e.type==='fighter-damaged'){
     assert.equal(finishTick,null,location.id+' damage after terminal result');
     assert.ok(!incapacitated.has(e.fighterId),location.id+' damage to incapacitated fighter');
     damageEvents++;maxQuietTicks=Math.max(maxQuietTicks,tick-lastHitTick);lastHitTick=tick;
    }
    if(e.type==='segment-detached'){
     for(const part of e.detachedParts??[]){
      const key=segmentKey(e.fighterId,part.id);
      assert.ok(expected.has(key)&&!detachedKeys.has(key),location.id+' unknown/repeated severing '+key);
      detachedKeys.add(key);
     }
    }
    if(e.type==='fighter-incapacitated'){
     assert.equal(finishTick,null,location.id+' incapacitation after combat end');
     assert.ok(!incapacitated.has(e.fighterId),location.id+' repeat incapacitation');
     incapacitated.add(e.fighterId);
    }
    if(e.type==='fight-ended'){
     terminalEvents++;assert.equal(terminalEvents,1,location.id+' duplicate result');
     finishTick=tick;
    }
   }
   if(tick%60!==0)continue;
   const state=core.getSnapshot(),bodies=world.bodySnapshot(),debris=world.snapshot();
   assert.ok([...state.roots].every(Number.isFinite),location.id+' produced nonfinite root');
   assert.ok(state.rigSegments.flat().every(p=>[...p.a,...p.b,p.radius].every(Number.isFinite)),location.id+' broke visible anatomy');
   assert.ok(bodies.every(b=>b.parts.every(p=>[...p.a,...p.b,p.radius].every(Number.isFinite))),location.id+' broke falling rig');
   assert.ok(debris.every(d=>[...Object.values(d.position),...Object.values(d.rotation)].every(Number.isFinite)),location.id+' broke detached geometry');
   assert.ok(world.moundSnapshot().every(m=>m.height>0&&m.height<=.300001),location.id+' invalid walkable static cone');
   for(let i=0;i<location.capacity;i++){
    const id=state.fighterIds[i];
    if(state.lifeStates[i]!=='active'){stationarySeconds.delete(id);lastPositions.delete(id);continue;}
    const p={x:state.roots[i*4],z:state.roots[i*4+2]};
    assert.equal(nav.clear(p,p,.35),true,location.id+' active patient crossed authored polygon: '+JSON.stringify(p));
    // A legitimate winner becomes stationary *after* the fight ends.
    // Only measure potentially stuck patients while combat is ongoing.
    if(state.fight.ended){stationarySeconds.delete(id);lastPositions.delete(id);continue;}
    const old=lastPositions.get(id);
    // Diagnostic only: wall contact, disabled limbs or indecision can all
    // produce stationary roots. Don't fake a defeat or loosen geometry checks.
    const quiet=old&&Math.hypot(old.x-p.x,old.z-p.z)<.08?(stationarySeconds.get(id)??0)+1:0;
    stationarySeconds.set(id,quiet);lastPositions.set(id,p);
    if(quiet>longestStationarySeconds){longestStationarySeconds=quiet;stationaryPatientId=id;}
   }
   minActive=Math.min(minActive,state.lifeStates.filter(s=>s==='active').length);
   peakRagdolls=Math.max(peakRagdolls,bodies.reduce((n,b)=>n+b.dynamicBodies,0));
   peakCones=Math.max(peakCones,world.moundSnapshot().length);
   if(finishTick!==null){
    assert.equal(state.fight.ended,true,location.id+' result reverted');
    assert.equal(state.lifeStates.filter(s=>s==='active').length,state.fight.winnerId===null?0:1);
   }
  }
  const state=core.getSnapshot(),bodies=world.bodySnapshot(),debris=world.snapshot(),mounds=world.moundSnapshot();
  const visible=assertVisibleAnatomy(expected,state,debris,detachedKeys);
  assert.equal(state.damageStats.detached,detachedKeys.size,location.id+' event/segment count differs');
  assert.equal(state.damageStats.hits,damageEvents,location.id+' damage-event count differs');
  assert.equal(bodies.length,incapacitated.size,location.id+' missing/extra ragdoll');
  assert.equal(state.fight.ended,terminalEvents===1,location.id+' inconsistent terminal events');
  assert.ok(mounds.every(m=>m.height>0&&m.height<=.300001),location.id+' invalid final cone');
  const status=state.fight.ended?
   bodies.some(b=>!b.settled)||debris.some(d=>!d.settled)?'physics-open':'complete':'combat-open';
  const report={arena:location.id,capacity:location.capacity,seconds,seed:19,status,
   winnerId:state.fight.winnerId,finishSeconds:finishTick===null?null:round(finishTick/60),
   active:state.lifeStates.filter(x=>x==='active').length,minActive,
   hits:state.damageStats.hits,detached:state.damageStats.detached,damageEvents,
   windups,contacts,oilDrops,visible,expected:expected.size,
   settledBodies:bodies.filter(b=>b.settled).length,
   unsettledBodies:bodies.filter(b=>!b.settled).map(b=>({fighterId:b.fighterId,motion:b.motion})),
   unsettledDebris:debris.filter(d=>!d.settled).map(d=>({fighterId:d.fighterId,segmentId:d.segmentId})),
   peakRagdolls,peakCones,
   longestNoHitSeconds:round(Math.max(maxQuietTicks,(finishTick??state.tick)-lastHitTick)/60),
   longestStationarySeconds,stationaryPatientId,
   collisionStats:state.collisionStats,
   cpuMs:summary(samples),wallClockMs:round(performance.now()-start)};
  if(!state.fight.ended)report.survivors=Array.from(state.fighterIds).flatMap((id,i)=>
   state.lifeStates[i]==='active'?[{id,root:Array.from(state.roots.slice(i*4,i*4+4)),mobility:state.mobilityModes[i],
    tactics:state.tactics[i],escape:state.escapes[i],perception:state.perception[i]}]:[]);
  reports.push(report);
  console.log('AUTHORED_AUDIT '+JSON.stringify(report));
 }finally{world.dispose();core.dispose();}
}
const status={cases:reports.length,totalPatients:reports.reduce((n,r)=>n+r.capacity,0),
 completed:reports.filter(r=>r.status==='complete').length,open:reports.filter(r=>r.status==='combat-open').length,
 physicsOpen:reports.filter(r=>r.status==='physics-open').length,
 secondsPerArena:seconds,slowestP95Ms:Math.max(...reports.map(r=>r.cpuMs.p95)),
 longestQuietSeconds:Math.max(...reports.map(r=>r.longestNoHitSeconds)),
 longestStationarySeconds:Math.max(...reports.map(r=>r.longestStationarySeconds))};
await writeFile(new URL('../authored-arena-audit.json',import.meta.url),
 JSON.stringify({status,reports},null,2)+'\n');
console.log('AUTHORED_AUDIT_SUMMARY '+JSON.stringify(status));
