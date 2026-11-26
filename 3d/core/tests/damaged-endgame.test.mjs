import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT,hasWorkingLimb} from '../dist/index.js';
import {hasAttackSource} from '../dist/combat/disarmed.js';

const source=createLabConfig(19).fighters;
const legIds=['L.upperLeg','L.lowerLeg','L.foot'];
// An incomplete right support, no head or arms: able to move, unable to attack.
// This fixture is intentionally undamaged at spawn: missing parts must NOT
// manufacture bleeding wounds or an automatic time-based defeat.
const disarmed=source[0].segmentIds.filter(id=>
 legIds.includes(id)||id==='pelvis'||id==='abdomen'||id==='chest'||
 id==='R.upperLeg'||id==='R.lowerLeg'
);
const idle=ids=>({commands:ids.map(fighterId=>({fighterId,forward:0,turn:0,sprint:false,attack:false}))});
const noneTerminal=event=>!['fighter-damaged','fighter-incapacitated','fight-ended','strike-contact'].includes(event.type);

test('mutually disarmed mobile patients remain alive, without invented hits or timer victory',()=>{
 const run=()=>{
  const c=new LabSimulationCore(),events=[];
  c.initialize({seed:19,combatEnabled:true,expandedStrikes:true,tacticalCombat:true,escapeCombat:true,perceptionCombat:true,
   fighters:[{...source[0],origin:[0,0,1.4],yawRad:0,segmentIds:disarmed},
             {...source[1],origin:[0,0,-1.4],yawRad:Math.PI,segmentIds:disarmed}]});
  try{
   assert.equal(hasAttackSource(disarmed,true),false);
   const start=c.getSnapshot();
   assert.deepEqual(start.mobilityModes,['single-support','single-support']);
   for(let tick=0;tick<600;tick++){
    c.step(FIXED_DT,{commands:[]});
    events.push(...c.drainEvents());
    if(tick%120===119){
     const s=c.getSnapshot();
     assert.deepEqual(s.lifeStates,['active','active']);
     assert.deepEqual(s.fight,{ended:false,winnerId:null});
     assert.equal(s.damageStats.hits,0);
     assert.ok(Array.from(s.roots).every(Number.isFinite));
     assert.deepEqual(s.oil.map(o=>o.failureTick),[null,null]);
     assert.deepEqual(s.strikes.map(o=>o.phase),['idle','idle']);
    }
   }
   assert.ok(events.every(noneTerminal),JSON.stringify(events.filter(e=>!noneTerminal(e))));
   const s=c.getSnapshot();
   return {roots:Array.from(s.roots),modes:s.tactics.map(t=>t.mode),events};
  }finally{c.dispose();}
 };
 assert.deepEqual(run(),run(),'seeded disarmed survivors must replay deterministically');
});

test('real severing and oil loss resolve a damaged duel without a fabricated combat timeout',()=>{
 const c=new LabSimulationCore(),fighterIds=[source[0].id,source[1].id];
 c.initialize({seed:7,combatEnabled:true,expandedStrikes:true,tacticalCombat:true,
  fighters:[{...source[0],origin:[-3,0,0]},{...source[1],origin:[3,0,0]}]});
 try{
  const events=[];
  for(const segmentId of ['L.upperLeg','R.upperLeg','L.upperArm','R.upperArm'])
   assert.equal(c.applyDamage({fighterId:fighterIds[0],segmentId,amount:4}),true);
  events.push(...c.drainEvents());
  assert.equal(hasWorkingLimb(c.getSnapshot().segmentIds[0]),false);
  assert.equal(c.getSnapshot().mobilityModes[0],'head-crawl','head survives while locomotion limbs were severed');
  assert.equal(c.getSnapshot().fight.ended,false);
  const commands=idle(fighterIds);
  c.step(FIXED_DT,commands);
  events.push(...c.drainEvents());
  const deadline=c.getSnapshot().oil[0].failureTick;
  assert.ok(Number.isInteger(deadline)&&deadline>=601&&deadline<=901,JSON.stringify({deadline}));
  assert.deepEqual(c.getSnapshot().lifeStates,['active','active']);
  while(c.getSnapshot().tick<deadline-1){
   c.step(FIXED_DT,commands);
   events.push(...c.drainEvents());
  }
  assert.deepEqual(c.getSnapshot().lifeStates,['active','active'],'no early terminal event');
  assert.equal(c.getSnapshot().fight.ended,false);
  c.step(FIXED_DT,commands);
  events.push(...c.drainEvents());
  const end=c.getSnapshot();
  assert.deepEqual(end.fight,{ended:true,winnerId:fighterIds[1]});
  assert.deepEqual(end.lifeStates,['incapacitated','active']);
  assert.equal(end.health[0].cause,'oil-loss');
  assert.equal(events.filter(e=>e.type==='fighter-incapacitated'&&e.cause==='oil-loss').length,1);
  assert.equal(events.filter(e=>e.type==='fight-ended').length,1);
  assert.equal(events.filter(e=>e.type==='strike-contact').length,0,'no synthetic strike from idle input');
  assert.equal(end.damageStats.hits,4,'only explicitly severed segments take damage');
  for(let i=0;i<120;i++){
   c.step(FIXED_DT,commands);
   assert.ok(c.drainEvents().every(noneTerminal),'result remains immutable after physical time advances');
  }
  assert.deepEqual(c.getSnapshot().fight,end.fight);
 }finally{c.dispose();}
});
