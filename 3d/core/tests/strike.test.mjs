import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT,StrikeState,punchPose,sweptContact,firstStrikeContact} from '../dist/index.js';
const base=createLabConfig(7),fighters=[{...base.fighters[0],origin:[0,0,.65],yawRad:0},{...base.fighters[1],origin:[0,0,-.65],yawRad:Math.PI}];
const make=()=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters,combatEnabled:true,labContactFracture:true});return c;};
const ball=(id,x,y=0,z=0,radius=.08)=>({id,a:[x,y,z],b:[x,y,z],radius});
test('strike phase timing and cooldown, missing source cancels',()=>{
 const s=new StrikeState(),ids=fighters[0].segmentIds;
 assert.ok(s.start(0,'L',1,[0,1,-.5],0));assert.equal(s.phase(19),'windup');assert.equal(s.phase(20),'thrust');assert.equal(s.phase(32),'recover');assert.equal(s.phase(48),'idle');
 s.advance(48,true,ids);assert.equal(s.start(53,'L',1,[0,1,-.5],0),false);assert.equal(s.start(54,'L',1,[0,1,-.5],0),true);
 s.advance(55,true,ids.filter(id=>id!=='L.lowerArm'));assert.equal(s.phase(55),'idle');
});
test('sweep detects intermediate moving contact and rejects misses and other limbs',()=>{
 const a=ball('L.hand',-1),b=ball('L.hand',1),v=ball('head',0);
 assert.ok(sweptContact(a,b,v,v)>0);assert.equal(sweptContact(a,b,ball('head',0,1),ball('head',0,1)),null);
 assert.equal(firstStrikeContact([a],[b],[v],[v],'L'),'head');assert.equal(firstStrikeContact([a],[b],[v],[v],'R'),null);
 assert.notEqual(sweptContact(ball('L.hand',0),ball('L.hand',0),ball('head',-1),ball('head',1)),null);
});
test('punch preserves anatomy lengths and shoulder attachment',()=>{
 const c=make(),pose=c.getSnapshot().rigSegments[0],p={side:'L',targetId:1,aim:[0,1.5,-.3],yaw:0,start:0};
 for(let t=0;t<48;t++){
  const s=punchPose(pose,p,t),get=id=>s.find(v=>v.id===id);
  assert.deepEqual(get('L.upperArm').a,get('chest').a);assert.deepEqual(get('L.upperArm').b,get('L.lowerArm').a);
  for(const [id,len] of [['L.upperArm',.36],['L.lowerArm',.32]]){const a=get(id);assert.ok(Math.abs(Math.hypot(...a.a.map((v,i)=>v-a.b[i]))-len)<1e-8);}
 }
});
test('two autonomous fighters produce deterministic real hits, no lab collision damage',()=>{
 const run=()=>{const c=make(),events=[];let first=-1;
  for(let i=0;i<900;i++){c.step(FIXED_DT,{commands:[]});for(const e of c.drainEvents()){events.push(e);if(e.type==='fighter-damaged'&&first<0)first=i;}}
  assert.ok(first>=20,'first hit '+first);assert.ok(events.some(e=>e.type==='combat-windup'));assert.ok(events.filter(e=>e.type==='fighter-damaged').length>=2);assert.ok(!events.some(e=>e.type==='lab-hit'));
  return events;
 };assert.deepEqual(run(),run());
});
test('no damage from proximity without attack; winner after terminal handoff',()=>{
 const c=make(),idle={commands:[0,1].map(fighterId=>({fighterId,forward:0,turn:0,sprint:false}))};
 for(let i=0;i<90;i++)c.step(FIXED_DT,idle);assert.equal(c.getSnapshot().damageStats.hits,0);
 c.applyDamage({fighterId:1,segmentId:'head',amount:6,attackerId:0});c.step(FIXED_DT,idle);assert.deepEqual(c.getSnapshot().fight,{ended:true,winnerId:0});
});
