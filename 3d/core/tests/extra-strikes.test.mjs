import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT,punchPose,usableStrike,StrikeState,firstStrikeContact} from '../dist/index.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
import {firstStrikeContactDetail} from '../dist/combat/swept-contact.js';
import {chooseExtra} from '../dist/combat/extra-choice.js';
const base=createLabConfig(7),f={...base.fighters[0],origin:[0,0,0],yawRad:0},flat=()=>0;
const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});
const pose=c.getSnapshot().rigSegments[0],get=(parts,id)=>parts.find(p=>p.id===id);
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('kick requires two complete legs and keeps the opposite foot anchored; head uses actual neck',()=>{
 for(const kind of ['leg','head']){
  const p={kind,side:'L',targetId:1,aim:kind==='leg'?[-.18,.9,-.7]:[0,1.65,-.5],yaw:0,start:0};
  assert.ok(usableStrike(f.segmentIds,kind,'L'));
  assert.equal(usableStrike(f.segmentIds.filter(id=>id!==(kind==='leg'?'R.foot':'neck')),kind,'L'),false);
  for(const t of [10,20,25,31,40]){
   const parts=punchPose(pose,p,t,flat);
   for(const part of parts)assert.ok(Math.abs(dist(part.a,part.b)-LAB_SEGMENTS.find(v=>v.id===part.id).nominalLength)<1e-8,part.id);
   if(kind==='leg'){
    assert.ok(dist(get(parts,'R.foot').a,get(pose,'R.foot').a)<1e-7);
    assert.deepEqual(get(parts,'L.upperLeg').a,get(parts,'pelvis').a);
   }else{
    assert.ok(Math.abs(dist(get(parts,'neck').b,get(parts,'head').a)-.10)<1e-8);
    assert.deepEqual(get(parts,'neck').a,get(pose,'neck').a);
   }
  }
  const extended=punchPose(pose,p,31,flat),source=kind==='leg'?'L.foot':'head';
  assert.ok(dist(get(extended,source).a,get(pose,source).a)>.10);
  const state=new StrikeState();assert.ok(state.start(0,'L',1,p.aim,0,undefined,kind));state.advance(1,true,f.segmentIds.filter(id=>id!==(kind==='leg'?'R.foot':'head')));assert.equal(state.phase(1),'idle');
 }
});
test('extended source geometry can produce real contact; only the chosen source hits',()=>{
 for(const kind of ['head','leg']){
  const id=kind==='head'?'head':'L.foot',targetId=kind==='head'?'chest':'pelvis',p={kind,side:'L',targetId:1,aim:kind==='head'?[0,1.65,-.5]:[-.18,.9,-.7],yaw:0,start:0};
  const end=punchPose(pose,p,31,flat),v=get(end,id),target={id:targetId,a:[...v.a],b:[...v.a],radius:.14};
  assert.equal(firstStrikeContact(pose,end,[target],[target],'L',kind),targetId);
  assert.equal(firstStrikeContact(pose,end,[{...target,a:[9,9,9],b:[9,9,9]}],[{...target,a:[9,9,9],b:[9,9,9]}],'L',kind),null);
  assert.ok(chooseExtra(pose,f.segmentIds,[target],0,()=>true,kind,flat),kind);
 }
});
test('expanded duel produces actual damage without lab contacts; arm-only mode remains independent',()=>{
 const run=expandedStrikes=>{const core=new LabSimulationCore();core.initialize({seed:7,combatEnabled:true,expandedStrikes,fighters:[{...f,origin:[0,0,.65]},{...base.fighters[1],origin:[0,0,-.65],yawRad:Math.PI}]});
 const events=[];for(let i=0;i<900;i++){core.step(FIXED_DT,{commands:[]});events.push(...core.drainEvents());}
 assert.ok(events.some(e=>e.type==='fighter-damaged'));assert.ok(!events.some(e=>e.type==='lab-hit'));
 return events;};
 const a=run(false),b=run(true);assert.ok(a.filter(e=>e.type==='strike-contact').every(e=>e.strikeKind==='arm'));
 assert.ok(b.some(e=>e.type==='combat-windup'&&e.strikeKind!=='arm'));
});

test('the live sources are fist, forearm tip without a hand, foot and head',()=>{
 const capsule=(id,a,b=a,radius=.052)=>({id,a,b,radius});
 const target=x=>[capsule('chest',[x,1,0])];
 const contact=(attack,at,kind)=>firstStrikeContactDetail(attack,attack,target(at),target(at),'L',kind)?.source??null;
 const arm=capsule('L.lowerArm',[0,1,0],[.32,1,0]),fist=capsule('L.hand',[.32,1,0]);
 const shin=capsule('L.lowerLeg',[0,1,0],[.50,1,0]),foot=capsule('L.foot',[.54,1,0]);
 assert.equal(contact([arm,fist],0,'arm'),null);
 assert.equal(contact([arm,fist],.38,'arm'),'L.hand');
 assert.equal(contact([arm],0,'arm'),null);
 assert.equal(contact([arm],.38,'arm'),'L.lowerArm');
 assert.equal(contact([shin,foot],0,'leg'),null);
 assert.equal(contact([shin,foot],.59,'leg'),'L.foot');
 assert.equal(contact([shin],.50,'leg'),null);
 assert.equal(contact([capsule('head',[.4,1,0])],.45,'head'),'head');
});
