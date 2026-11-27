import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {headAimPoint,headFrame} from '../dist/rig/head-frame.js';
import {manualInput} from '../../lab-next/manual-control.js';
import {footContacts,stepDistanceGain} from '../../lab-next/footstep-audio.js';

const {ring}=await buildLocationCatalog();
const base=createAuthoredCombatConfig(7,ring,2);
const command=(fighterId,extras={})=>({fighterId,forward:0,turn:0,sprint:false,...extras});
function setup(target=[2,0,-2]){
 const core=new LabSimulationCore();
 core.initialize({...base,fighters:[{...base.fighters[0],origin:[0,0,1.5],yawRad:0},{...base.fighters[1],origin:target,yawRad:0}]});
 return core;
}
function tick(core,values={},player={}){
 core.step(FIXED_DT,{commands:[command(0,{...values,player:{yawDelta:0,pitch:0,crouch:false,...player}}),command(1)]});
 return core.getSnapshot();
}
test('direct arm attack can start without a target and the mouse turns the view',()=>{
 const core=setup();
 try{
  const state=tick(core,{attack:true,attackKind:'arm'},{yawDelta:.25,pitch:.30});
  assert.ok(Math.abs(state.roots[3]-.25)<1e-6);
  assert.ok(Math.abs(state.headFrames[0].forward[1]-Math.sin(.30))<1e-6);
  const attack=core.drainEvents().find(e=>e.type==='combat-windup');
  assert.equal(attack.strikeKind,'arm');
  assert.equal(attack.targetId,undefined);
  assert.equal(state.strikes[0].targetId,null);
  const arm=attack.segmentId[0],windupPosition=[];
  for(let i=0;i<29;i++){
   const sample=tick(core);
   const hand=sample.rigSegments[0].find(x=>x.id===arm+'.hand');
   const upper=sample.rigSegments[0].find(x=>x.id===arm+'.upperArm');
   windupPosition.push(Math.abs(Math.cos(.25)*(hand.a[0]-upper.a[0])+Math.sin(.25)*(hand.a[2]-upper.a[2])));
  }
  assert.ok(Math.max(...windupPosition)>.25,JSON.stringify(windupPosition));
  assert.ok(core.drainEvents().every(e=>e.type!=='strike-contact'));
 }finally{core.dispose();}
});

test('the same command can keep running, begin jumping and swing the head',()=>{
 const core=setup([-2,0,-2]);
 try{
  for(let i=0;i<16;i++)tick(core,{forward:1,sprint:true});
  const before=core.getSnapshot().roots[2];
  const events=[],phases=[];
  for(let i=0;i<42;i++){
   const sample=tick(core,{forward:1,sprint:true,jump:i===0,attack:i===0,attackKind:'head'});
   events.push(...core.drainEvents());
   phases.push([sample.hopPhases[0],sample.strikes[0].phase]);
  }
  assert.ok(events.some(e=>e.type==='combat-windup'&&e.strikeKind==='head'));
  assert.ok(phases.some(([hop,strike])=>hop==='flight'&&strike!=='idle'));
  assert.ok(before-core.getSnapshot().roots[2]>1);
 }finally{core.dispose();}
});

test('crouch follows a held input, lowers the pelvis, and still allows mouse turning',()=>{
 const core=setup();
 const pelvis=s=>s.rigSegments[0].find(x=>x.id==='pelvis').a[1];
 try{
  const standing=pelvis(tick(core));
  let sample;
  for(let i=0;i<22;i++)sample=tick(core,{sprint:true,forward:.35},{crouch:true,yawDelta:.02});
  assert.ok(pelvis(sample)<standing-.20);
  assert.ok(sample.roots[3]>.1);
  for(let i=0;i<24;i++)sample=tick(core);
  assert.ok(pelvis(sample)>standing-.12);
 }finally{core.dispose();}
});

test('step distance matches 2D and audio follows landings and planted intact feet',()=>{
 assert.deepEqual([0,1,2.5,4,5.5,7,10,11].map(stepDistanceGain),[1,1,.6,.3,.15,.1,0,0]);
 const foot=(moving,x)=>({moving,point:[x,0,1]});
 const state={tick:1,fight:{ended:false},fighterIds:[3],lifeStates:['active'],postures:['upright'],hopPhases:['idle'],
  segmentIds:[['L.foot','R.foot']],footStates:[[foot(true,0),foot(true,1)]]};
 const next={...state,tick:2,footStates:[[foot(false,0),foot(false,1)]]};
 assert.equal(footContacts(state,next).length,2);
 assert.equal(footContacts(state,{...next,segmentIds:[['L.foot']]}).length,1);
 assert.equal(footContacts(state,{...next,hopPhases:['flight']}).length,0);
 assert.deepEqual(footContacts({...state,hopPhases:['flight']},next),[{id:3,point:[.5,0,1],landed:true,side:0,tick:2}]);
});

test('A/D strafes, and the diagonal has the requested bearing with no speed bonus',()=>{
 const sample=(keys,yaw=0)=>{
  const core=setup();
  try{
   for(let i=0;i<48;i++){
    const commands=manualInput([0,1],['active','active'],'0',(...codes)=>Number(codes.some(k=>keys.includes(k))),false,{yawDelta:i===0?yaw:0,pitch:0}).commands;
    core.step(FIXED_DT,{commands:[...commands,command(1)]});
   }
   const {roots,stepCounts}=core.getSnapshot();
   assert.ok(stepCounts[0]>0);
   return [roots[0],roots[2]-1.5,roots[3]];
  }finally{core.dispose();}
 };
 const right=sample(['KeyD']),left=sample(['KeyA']),diagonal=sample(['KeyW','KeyD']);
 assert.ok(right[0]>.35&&left[0]<-.35);
 assert.ok(Math.abs(right[1])<1e-6&&Math.abs(left[1])<1e-6);
 assert.equal(right[2],0);
 assert.equal(left[2],0);
 assert.ok(diagonal[0]>.25&&Math.abs(diagonal[0]+diagonal[1])<1e-6);
 assert.ok(Math.hypot(diagonal[0],diagonal[1])<=Math.abs(right[0])*1.23);
 const rotated=sample(['KeyD'],.7);
 assert.ok(Math.abs(rotated[0]/rotated[1]-Math.cos(.7)/Math.sin(.7))<1e-5);
 assert.ok(Math.abs(rotated[2]-.7)<1e-6);
});

test('manual attack aim follows the centre ray of the roll-stabilised head camera',()=>{
 const raw=[{id:'head',a:[0,1.6,0],b:[0,1.6,0],radius:.15}];
 for(const pitch of [-.55,0,.55]){
  const frame=headFrame(raw,.4,pitch);
  const from=headAimPoint(frame,0),aim=headAimPoint(frame,1);
  for(let i=0;i<3;i++)assert.ok(Math.abs(aim[i]-from[i]-frame.forward[i])<1e-12);
  assert.ok(Math.abs(aim[1]-from[1]-Math.sin(pitch))<1e-12);
 }
});

test('playing the same swing at different crosshair heights changes physical contact',()=>{
 const strikeAt=pitch=>{
  const core=setup([0,0,.75]);
  try{
   const hits=[];
   for(let i=0;i<48;i++){
    tick(core,{attack:i===0,attackKind:'arm'},{pitch});
    for(const event of core.drainEvents())
     if(event.type==='strike-contact'&&event.attackerId===0)hits.push(event.segmentId);
   }
   return hits;
  }finally{core.dispose();}
 };
 assert.deepEqual(strikeAt(-.45),['chest']);
 assert.deepEqual(strikeAt(-.22),['head']);
 assert.deepEqual(strikeAt(.5),[]);
});
