import test from 'node:test';
import assert from 'node:assert/strict';
import {DISTRESS,DistressState} from '../dist/combat/distress.js';
import {LIMB_THROW,ThrowDecision,LimbFlight,sacrificeArm,throwVelocity} from '../dist/combat/limb-throw.js';
import {RaidState} from '../dist/combat/raid-state.js';
import {DAMAGE,DamageState,LabSimulationCore,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {LAB_SEGMENTS,severingChain} from '../dist/rig/anatomy.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
import {DebrisWorld} from '../../lab-next/debris.js';
import {advanceCombatStep} from '../../lab-next/combat-step.js';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';

const ids=LAB_SEGMENTS.map(p=>p.id),zero=[0,0,0];
test('integer native segment HP, one seeded distress decision, finite flee window',()=>{
 assert.deepEqual([DAMAGE.segmentHP,DAMAGE.headHP,DAMAGE.pelvisHP],[4,8,5]);
 let count=0;
 for(let seed=0;seed<4096;seed++){
  const a=new DistressState(seed,1),b=new DistressState(seed,1),mode=a.advance(0,true,true,true);
  assert.equal(b.advance(0,true,true,true),mode);
  if(mode==='hysteria'){count++;assert.equal(a.advance(2000,true,true,true),'hysteria');}
  else{
   const end=a.snapshot().until;
   assert.ok(end>=240&&end<=420);
   assert.equal(a.advance(end-1,true,true,true),'prey');
   assert.equal(a.advance(end,true,true,true),'last-stand');
   assert.equal(a.advance(end+500,true,true,true),'last-stand');
  }
 }
 assert.ok(count/4096>.075&&count/4096<.125,count);
});
test('hysteria ignores tactical withdrawal and commits at most eight attacks per series',()=>{
 const raid=new RaidState(4,0,'hesitant');
 const target={id:1,x:0,z:-.8,yaw:Math.PI,threatening:true,grounded:false};
 const input=tick=>({tick,here:{x:0,z:0},target,visible:[target,{...target,id:2,x:.4}],strike:'idle',interrupted:true,ready:true,clear:()=>true,defiant:true,hysterical:true});
 for(let i=0;i<8;i++){
  assert.equal(raid.advance(input(i*60)).attack,true);raid.committed(i*60,1);
  assert.equal(raid.snapshot().attempts,i+1);
 }
 assert.equal(raid.advance(input(480)).attack,false);assert.equal(raid.snapshot().phase,'reassess');
 assert.equal(raid.advance(input(490)).attack,true);assert.equal(raid.snapshot().attempts,0);
});
test('sacrifice preserves mobility, another usable arm and endurance; applies same branch cost',()=>{
 const health=new DamageState(ids);
 assert.equal(sacrificeArm(ids,health.snapshot(),'L'),'L.upperArm');
 const preview=health.snapshot(),result=health.apply('L.upperArm',DAMAGE.segmentHP,0);
 assert.deepEqual(result.detached,severingChain('L.upperArm'));
 const remaining=ids.filter(id=>!result.detached.includes(id)),after=health.snapshot();
 assert.equal(after.trauma,4);assert.equal(after.lostSegments,3);
 assert.ok(after.endurance<preview.endurance&&after.endurance>after.maxEndurance*.25);
 assert.equal(sacrificeArm(remaining,after,'R'),null);
 assert.equal(sacrificeArm(ids.filter(id=>id!=='R.foot'),preview,'L'),null);
 const weak=new DamageState(ids);weak.apply('chest',4,0);weak.apply('abdomen',4,0);weak.apply('head',1,0);
 assert.equal(sacrificeArm(ids,weak.snapshot(),'L'),null);
});
test('seeded accuracy is approximately 80%; lead and gravity meet a moving target, no synthetic hit',()=>{
 let accurate=0;
 for(let seed=0;seed<4096;seed++)if(new ThrowDecision(seed,0).sample().accurate)accurate++;
 assert.ok(accurate/4096>.77&&accurate/4096<.83,accurate);
 const part=(id,point,radius=.12)=>({id,a:point,b:point,radius}),origin=[0,1.2,0],target=[0,1.2,-3.2],speed=[1,0,-1],t=.4;
 const v=throwVelocity(origin,target,speed,true,1),flight=new LimbFlight(0,0,1,[part('L.hand',origin)],v,true);
 const predicted=target.map((x,i)=>x+speed[i]*t);
 assert.ok(Math.hypot(...flight.center(t).map((x,i)=>x-predicted[i]))<1e-8);
 const run=(accurate,clear=()=>true)=>{
  const f=new LimbFlight(0,0,1,[part('L.hand',origin)],throwVelocity(origin,target,speed,accurate,1),accurate);
  let out;
  for(let i=0;i<120;i++){
   const at=t=>[part('head',target.map((x,k)=>x+speed[k]*t),.17)];
   out=f.advance([{id:1,previous:at(i*FIXED_DT),current:at((i+1)*FIXED_DT)}],clear,()=>0);
   if(out.ended)return out;
  }
  assert.fail('flight never ended');
 };
 assert.equal(run(true).hit?.fighterId,1);assert.equal(run(false).hit,null);
 assert.equal(run(true,()=>false).hit,null);
});
test('one physical branch is visible from launch to Rapier handoff, never duplicated',async()=>{
 await RAPIER.init();const world=new DebrisWorld(RAPIER);
 try{
  const parts=[{id:'L.upperArm',a:[0,1,0],b:[0,.65,0],radius:.1},{id:'L.lowerArm',a:[0,.65,0],b:[0,.35,0],radius:.08},{id:'L.hand',a:[0,.35,0],b:[0,.35,0],radius:.08}];
  const flight=new LimbFlight(5,0,1,parts,[0,2,-5],true);
  world.accept({type:'segment-detached',fighterId:0,tick:0,flightId:5,detachedParts:parts});
  const keys=world.snapshot().map(p=>p.id);
  assert.equal(keys.length,3);assert.throws(()=>world.exportSettledFloor('ring'));
  world.accept({type:'limb-flight',fighterId:0,tick:1,flightId:5,flightParts:flight.pose(FIXED_DT)});
  assert.deepEqual(world.snapshot().map(p=>p.id),keys);
  world.accept({type:'limb-flight-ended',fighterId:0,tick:2,flightId:5,flightParts:flight.pose(.2),flightVelocity:flight.velocity(.2)});
  assert.deepEqual(world.snapshot().map(p=>p.id),keys);
  for(let i=0;i<1100;i++)world.step(FIXED_DT);
  assert.ok(world.snapshot().every(p=>p.settled));
  assert.equal(world.exportSettledFloor('ring').visuals.length,3);
 }finally{world.dispose();}
});
test('authored AI can sacrifice a real arm to throw at a visible low-endurance prey',async()=>{
 const {ring}=await buildLocationCatalog();
 let seed=0;while(new DistressState(seed,1).advance(0,true,true,true)!=='prey'||!new ThrowDecision(seed,0).sample().accurate)seed++;
 const config=createAuthoredCombatConfig(seed,ring,2),core=new LabSimulationCore(),events=[];
 core.initialize({...config,fighters:[{...config.fighters[0],origin:[0,0,1.5],yawRad:0},{...config.fighters[1],origin:[0,0,-1.5],yawRad:Math.PI}]});
 try{
  for(const [segmentId,amount] of [['chest',4],['abdomen',3],['pelvis',4],['head',7],['neck',3],['L.upperLeg',2]])assert.ok(core.applyDamage({fighterId:1,segmentId,amount}));
  core.drainEvents();
  core.step(FIXED_DT,{commands:[]});events.push(...core.drainEvents());
  assert.equal(core.getSnapshot().distress[1].mode,'prey');
  const idle={commands:[{fighterId:1,forward:0,turn:0,sprint:false,attack:false}]};
  for(let i=0;i<150;i++){core.step(FIXED_DT,idle);events.push(...core.drainEvents());}
  const launches=events.filter(e=>e.type==='limb-throw');
  assert.equal(launches.length,1,JSON.stringify(events.filter(e=>e.type.startsWith('limb-'))));
  const launch=launches[0],cuts=events.filter(e=>e.type==='segment-detached'&&e.flightId===launch.flightId);
  assert.equal(cuts.length,1);assert.equal(cuts[0].detachedParts.length,3);
  assert.equal(core.getSnapshot().mobilityModes[0],'biped');
  assert.ok(core.getSnapshot().health[0].endurance<DAMAGE.traumaThreshold);
  assert.ok(events.some(e=>e.type==='limb-flight-ended'&&e.flightId===launch.flightId));
  const hits=events.filter(e=>e.type==='limb-hit'&&e.flightId===launch.flightId);
  assert.ok(hits.length<=1);
  for(const h of hits){const damage=events.find(e=>e.type==='fighter-damaged'&&e.tick===h.tick&&e.fighterId===h.fighterId&&e.segmentId===h.segmentId);assert.ok(damage&&damage.damage<=LIMB_THROW.damage);}
 }finally{core.dispose();}
});

test('later low endurance cannot turn a fleeing patient hysterical',()=>{
 let seed=0;while(new DistressState(seed,0).advance(0,true,true,true)!=='hysteria')seed++;
 const state=new DistressState(seed,0);
 assert.equal(state.advance(0,true,false,true),'prey');
 const deadline=state.snapshot().until;
 assert.equal(state.advance(10,true,true,true),'prey');
 assert.equal(state.advance(deadline,true,true,true),'last-stand');
 assert.equal(state.advance(deadline+120,true,true,true),'last-stand');
});
