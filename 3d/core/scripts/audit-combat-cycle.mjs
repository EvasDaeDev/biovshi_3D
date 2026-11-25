import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {LabSimulationCore,createArenaCombatConfig,createNavigationCombatConfig,FIXED_DT} from '../dist/index.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {advanceCombatStep} from '../../lab-next/combat-step.js';
await RAPIER.init();
const seeds=[7,19,42],reports=[];
const key=(id,segment)=>id+':'+segment;
const finite=p=>[...p.a,...p.b,p.radius].every(Number.isFinite);
const quantile=(a,p)=>a[Math.floor((a.length-1)*p)];
for(const mode of ['vision','navigation'])for(const seed of seeds){
 const c=new LabSimulationCore(),w=new DebrisWorld(RAPIER);
 const config=mode==='vision'?createArenaCombatConfig(seed,true,true):createNavigationCombatConfig(seed);
 // Preserve the published seed 7 layout; use deterministic alternate
 // starting headings/slots on the other seeds, not only RNG variation.
 if(seed!==7){
  const starts=config.fighters.map(f=>f.origin);
  config.fighters=config.fighters.map((f,i)=>({...f,origin:starts[(i+(seed===19?3:5))%starts.length],yawRad:f.yawRad+(seed===19?.7:-.9)}));
 }
 c.initialize(config);w.reset(config.walls??[]);
 const detached=new Set(),incapacitated=new Set(),strikes={arm:0,leg:0,head:0},causes={},samples=[];
 const expected=new Set(config.fighters.flatMap(f=>f.segmentIds.map(s=>key(f.id,s))));
 let result=null,lastHit=0,maxQuiet=0,finishTick=null,damageCount=0,terminalEvents=0,windups=0,contacts=0,criticals=0,peakBodies=0,peakJoints=0;
 const started=performance.now(),input={commands:[]};
 try{
  for(let i=1;i<=8400;i++){
   if(finishTick===null&&i>7200)break;
   if(finishTick!==null&&i>finishTick+1200)break;
   const t=performance.now(),events=advanceCombatStep(c,w,FIXED_DT,input);
   samples.push(performance.now()-t);
   for(const e of events){
    if(e.type==='combat-windup')windups++;
    if(e.type==='strike-contact'){contacts++;strikes[e.strikeKind??'arm']++;}
    if(e.type==='fighter-damaged'){
     assert.equal(finishTick,null,'damage after fight end');assert.ok(!incapacitated.has(e.fighterId),'damage to incapacitated patient');
     damageCount++;criticals+=e.critical?1:0;maxQuiet=Math.max(maxQuiet,i-lastHit);lastHit=i;
    }
    if(e.type==='segment-detached')for(const part of e.detachedParts??[]){
     const k=key(e.fighterId,part.id);assert.ok(expected.has(k)&&!detached.has(k),'duplicate or unknown detached segment '+k);detached.add(k);
    }
    if(e.type==='fighter-incapacitated'){
     assert.equal(finishTick,null,'new casualty after fight end');assert.ok(!incapacitated.has(e.fighterId));incapacitated.add(e.fighterId);
     causes[e.cause]=(causes[e.cause]??0)+1;
    }
    if(e.type==='fight-ended'){terminalEvents++;assert.equal(terminalEvents,1);finishTick=i;result=c.getSnapshot().fight;}
   }
   if(i%60===0||i===finishTick){
    const bodies=w.bodySnapshot();peakBodies=Math.max(peakBodies,bodies.reduce((n,b)=>n+b.dynamicBodies,0));peakJoints=Math.max(peakJoints,bodies.reduce((n,b)=>n+b.joints,0));
    const s=c.getSnapshot();assert.ok(Array.from(s.roots).every(Number.isFinite));assert.ok(s.rigSegments.flat().every(finite));
    if(result){
     assert.deepEqual(s.fight,result);assert.deepEqual(Array.from(s.fighterIds).filter((_,j)=>s.lifeStates[j]==='active'),result.winnerId===null?[]:[result.winnerId]);
     if(i>=finishTick+180&&bodies.every(b=>b.settled)&&w.snapshot().every(d=>d.settled))break;
    }
   }
  }
  const s=c.getSnapshot(),bodies=w.bodySnapshot(),debris=w.snapshot(),mounds=w.moundSnapshot();
  const visible=new Set();
  const add=k=>{assert.ok(expected.has(k)&&!visible.has(k),'missing or duplicate anatomy key '+k);visible.add(k);};
  for(let i=0;i<s.fighterIds.length;i++)for(const part of s.rigSegments[i])add(key(s.fighterIds[i],part.id));
  for(const d of debris){const k=key(d.fighterId,d.segmentId);assert.ok(detached.has(k));add(k);assert.ok([d.length,d.radius,...Object.values(d.position),...Object.values(d.rotation)].every(Number.isFinite));}
  assert.equal(visible.size,expected.size,'visual anatomy lost');assert.equal(debris.length,detached.size);assert.equal(s.damageStats.detached,detached.size);
  assert.equal(s.damageStats.hits,damageCount);assert.equal(bodies.length,incapacitated.size);assert.ok(mounds.every(m=>m.height>0&&m.height<=.300001));
  assert.equal(s.fight.ended,terminalEvents===1);
  if(s.fight.ended){assert.deepEqual(s.fight,result);assert.equal(s.lifeStates.filter(v=>v==='active').length,result.winnerId===null?0:1);}
  samples.sort((a,b)=>a-b);
  const report={mode,seed,status:!s.fight.ended?'combat-open':bodies.some(b=>!b.settled)||debris.some(d=>!d.settled)?'physics-open':'complete',winnerId:s.fight.winnerId,combatSeconds:finishTick===null?null:finishTick/60,observedSeconds:s.tick/60,active:s.lifeStates.filter(v=>v==='active').length,hits:damageCount,criticals,windups,contacts,strikes,causes,detached:debris.length,visible:visible.size,settledBodies:bodies.filter(b=>b.settled).length,unsettledBodies:bodies.filter(b=>!b.settled).map(b=>({id:b.fighterId,motion:b.motion})),unsettledDebris:debris.filter(d=>!d.settled).map(d=>({id:d.id,segmentId:d.segmentId,position:d.position})),cones:mounds.length,peakBodies,peakJoints,longestNoHitSeconds:Math.max(maxQuiet,(finishTick??s.tick)-lastHit)/60,cpuMs:{p50:quantile(samples,.5),p95:quantile(samples,.95),p99:quantile(samples,.99),wallTime:performance.now()-started}};
  if(!s.fight.ended)report.survivors=Array.from(s.fighterIds).flatMap((id,i)=>s.lifeStates[i]==='active'?[{id,root:Array.from(s.roots.slice(i*4,i*4+4)),mobility:s.mobilityModes[i],posture:s.postures[i],health:s.health[i],oil:s.oil[i],tactics:s.tactics[i],strike:s.strikes[i],perception:s.perception[i],escape:s.escapes[i],route:s.routes[i]}]:[]);
  reports.push(report);console.log('COMBAT_AUDIT '+JSON.stringify(report));
 }finally{w.dispose();c.dispose();}
}
console.log('COMBAT_AUDIT_SUMMARY '+JSON.stringify({cases:reports.length,complete:reports.filter(r=>r.status==='complete').length,combatOpen:reports.filter(r=>r.status==='combat-open').length,physicsOpen:reports.filter(r=>r.status==='physics-open').length}));
// Open cases are diagnostic, not manufactured wins or relaxed regression
// tests. Geometry, accounting and result invariants above are hard gates.
