import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {buildLocationCatalog} from './catalog-locations.mjs';
import {LabSimulationCore,createAuthoredCombatConfig,PolygonNavigation,FIXED_DT} from '../dist/index.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {advanceCombatStep} from '../../lab-next/combat-step.js';

/** Real P4 acceptance telemetry, not a fake knockout race.
 * 10 seconds / full map in default CI, P4_AUDIT_SECONDS=60 for a manual
 * complete minute of each authored arena at its actual patient capacity.
 * A fight still alive at the end is reported as "combat-open", not failed. */
const seconds=Number(process.env.P4_AUDIT_SECONDS??10);
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
 let peakActive=location.capacity,peakRagdolls=0,peakCones=0,damageEvents=0;
 try{
  core.initialize(config);
  world.reset(location.walls,null,location.id,location);
  assert.equal(core.getSnapshot().fighterIds.length,location.capacity);
  for(let tick=0;tick<seconds*60;tick++){
   const t=performance.now();
   const events=advanceCombatStep(core,world,FIXED_DT,input);
   samples.push(performance.now()-t);
   damageEvents+=events.filter(e=>e.type==='fighter-damaged').length;
   if(tick%60!==59)continue;
   const state=core.getSnapshot(),bodies=world.bodySnapshot(),debris=world.snapshot();
   assert.ok([...state.roots].every(Number.isFinite),location.id+' produced nonfinite root');
   assert.ok(state.rigSegments.flat().every(p=>[...p.a,...p.b,p.radius].every(Number.isFinite)),location.id+' broke visible anatomy');
   assert.ok(bodies.every(b=>b.parts.every(p=>[...p.a,...p.b,p.radius].every(Number.isFinite))),location.id+' broke falling rig');
   assert.ok(debris.every(d=>[d.position.x,d.position.y,d.position.z].every(Number.isFinite)),location.id+' broke detached geometry');
   for(let i=0;i<location.capacity;i++)if(state.lifeStates[i]==='active'){
    const p={x:state.roots[i*4],z:state.roots[i*4+2]};
    assert.equal(nav.clear(p,p,.35),true,location.id+' active patient crossed authored polygon: '+JSON.stringify(p));
   }
   peakActive=Math.max(peakActive,state.lifeStates.filter(s=>s==='active').length);
   peakRagdolls=Math.max(peakRagdolls,bodies.reduce((n,b)=>n+b.dynamicBodies,0));
   peakCones=Math.max(peakCones,world.moundSnapshot().length);
  }
  const state=core.getSnapshot();
  const report={arena:location.id,capacity:location.capacity,seconds,seed:19,
   status:state.fight.ended?'complete':'combat-open',
   winnerId:state.fight.winnerId,active:state.lifeStates.filter(x=>x==='active').length,
   hits:state.damageStats.hits,detached:state.damageStats.detached,damageEvents,
   peakActive,peakRagdolls,peakCones,
   collisionStats:state.collisionStats,
   cpuMs:summary(samples),wallClockMs:round(performance.now()-start)};
  reports.push(report);
  console.log('AUTHORED_AUDIT '+JSON.stringify(report));
 }finally{world.dispose();core.dispose();}
}
const status={cases:reports.length,totalPatients:reports.reduce((n,r)=>n+r.capacity,0),
 completed:reports.filter(r=>r.status==='complete').length,open:reports.filter(r=>r.status==='combat-open').length,
 secondsPerArena:seconds,slowestP95Ms:Math.max(...reports.map(r=>r.cpuMs.p95))};
const output={status,reports};
await writeFile(new URL('../authored-arena-audit.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log('AUTHORED_AUDIT_SUMMARY '+JSON.stringify(status));
