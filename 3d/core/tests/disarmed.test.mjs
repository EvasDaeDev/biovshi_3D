import test from 'node:test';
import assert from 'node:assert/strict';
import {hasAttackSource,fleeAllAttackers,DISARMED} from '../dist/combat/disarmed.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const base=createLabConfig(7);
const withoutArms=base.fighters[0].segmentIds.filter(s=>!/\.(upperArm|lowerArm|hand)$/.test(s));
const defenseless=withoutArms.filter(s=>s!=='head'&&s!=='neck');
const flat=()=>true;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

test('disarmed means no usable source in the current combat mode, not merely a missing hand',()=>{
 assert.equal(hasAttackSource(base.fighters[0].segmentIds,true),true);
 assert.equal(hasAttackSource(withoutArms,true),true,'head and supported kick remain available');
 assert.equal(hasAttackSource(withoutArms,false),false,'arm-only regression mode has no usable source');
 assert.equal(hasAttackSource(defenseless,true),true,'two intact legs can still kick');
 assert.equal(hasAttackSource(defenseless.filter(s=>s!=='R.foot'),true),false,'one support leg cannot kick');
 assert.equal(hasAttackSource(base.fighters[0].segmentIds.filter(s=>s!=='L.hand'&&s!=='R.hand'),false),true,'forearm remains usable');
});

test('v1 disarmed escape increases the gap to all armed threats, never picks an occupied or unreachable point',()=>{
 const a={id:0,x:0,z:0},threats=[{x:0,z:-1},{x:-1,z:0}];
 const occupied=[{x:4.8,z:4.8}];
 const first=fleeAllAttackers(a,threats,occupied,flat,flat);
 assert.ok(first, 'open arena has a candidate');
 const nearest=p=>Math.min(...threats.map(t=>distance(t,p)));
 assert.ok(nearest(first)>nearest(a),'goal should improve distance from nearest threat');
 assert.deepEqual(fleeAllAttackers(a,threats,occupied,flat,flat),first,'no RNG or order-dependent tie');
 assert.equal(fleeAllAttackers(a,threats,occupied,()=>false,flat),null,'no reachable path means no false goal');
 assert.equal(fleeAllAttackers(a,[],occupied,flat,flat),null,'no armed attackers');
 assert.equal(DISARMED.commitTicks,108);
});

test('armless/headless but mobile biped flees a dangerous patient instead of chasing',()=>{
 const c=new LabSimulationCore();
 const fighters=[
  {...base.fighters[0],origin:[0,0,1],yawRad:0,segmentIds:defenseless.filter(s=>s!=='R.foot')},
  {...base.fighters[1],origin:[0,0,0],yawRad:Math.PI}
 ];
 // With one leg the patient still has usable arms? No; single-support remains
 // mobile but has no arm/head/two-leg kick source.
 try{
  c.initialize({seed:7,fighters,combatEnabled:true,expandedStrikes:true,tacticalCombat:true});
  const stationary={fighterId:1,forward:0,turn:0,sprint:false};
  const plan=new Map([[1,stationary]]);
  c.planCombat(plan);
  assert.equal(c.getSnapshot().tactics[0].mode,'retreat');
  assert.ok(plan.has(0));
  const initial=1;
  for(let i=0;i<180;i++)c.step(FIXED_DT,{commands:[stationary]});
  const s=c.getSnapshot(),gap=Math.hypot(s.roots[0]-s.roots[4],s.roots[2]-s.roots[6]);
  assert.ok(gap>initial+.10,JSON.stringify({gap,roots:Array.from(s.roots),tactics:s.tactics}));
  assert.equal(s.damageStats.hits,0,'flight does not create artificial contact damage');
  assert.equal(s.strikes[0].phase,'idle');
 }finally{c.dispose();}
});

test('when no opponent has an attack source, disarmed AI searches rather than blindly chasing',()=>{
 const c=new LabSimulationCore(),ids=defenseless.filter(s=>s!=='R.foot');
 try{
  c.initialize({seed:19,fighters:[{...base.fighters[0],origin:[0,0,1],segmentIds:ids},{...base.fighters[1],origin:[0,0,-1],segmentIds:ids}],combatEnabled:true,expandedStrikes:true,tacticalCombat:true});
  const commands=new Map();c.planCombat(commands);
  assert.ok(commands.has(0)&&commands.has(1));
  assert.equal(c.getSnapshot().tactics[0].mode,'search');
  assert.equal(c.getSnapshot().tactics[1].mode,'search');
 }finally{c.dispose();}
});

test('disarmed perception does not see through walls or at headless long distance',()=>{
 const c=new LabSimulationCore(),ids=defenseless.filter(s=>s!=='R.foot');
 const config=(distance)=>({seed:7,fighters:[{...base.fighters[0],origin:[0,0,distance],segmentIds:ids},{...base.fighters[1],origin:[0,0,0]}],combatEnabled:true,expandedStrikes:true,tacticalCombat:true,perceptionCombat:true});
 try{
  c.initialize(config(2));
  c.planCombat(new Map());
  assert.equal(c.getSnapshot().tactics[0].mode,'search','headless fighter cannot know distant armed location');
  c.initialize(config(.4));
  c.planCombat(new Map());
  assert.equal(c.getSnapshot().tactics[0].mode,'retreat','nearby body contact is enough to sense danger');
 }finally{c.dispose();}
});

test('disarmed upper-arm stump can crawl away without inventing a missing forearm attack',()=>{
 const c=new LabSimulationCore();
 const stump=defenseless.filter(s=>!/\\.(upperLeg|lowerLeg|foot)$/.test(s)).concat('L.upperArm');
 const fighters=[{...base.fighters[0],origin:[0,0,.6],segmentIds:stump},{...base.fighters[1],origin:[0,0,0]}];
 try{
  c.initialize({seed:7,fighters,combatEnabled:true,expandedStrikes:true,tacticalCombat:true});
  const commands=new Map();c.planCombat(commands);
  assert.equal(c.getSnapshot().mobilityModes[0],'arm-crawl');
  assert.equal(c.getSnapshot().tactics[0].mode,'retreat');
  assert.equal(commands.get(0).sprint,false);
  assert.equal(c.getSnapshot().strikes[0].phase,'idle');
 }finally{c.dispose();}
});
