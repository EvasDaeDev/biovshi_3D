import test from 'node:test';
import assert from 'node:assert/strict';
import {PatientPerception,VISION} from '../dist/combat/perception.js';
import {StrikeState,punchPose,strikeChannels} from '../dist/combat/strike.js';
import {firstStrikeContactDetail} from '../dist/combat/swept-contact.js';
import {SIDE_STRIKE_LIMIT,clampStrikeAim,strikeBearing} from '../dist/combat/strike-sector.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
import {particleSpec,particleFrame,HIT_PARTICLES} from '../../lab-next/hit-particles.js';
const here={x:0,z:0},point=(id,angle,r=2)=>({id,x:Math.sin(angle)*r,z:-Math.cos(angle)*r});
test('attention keeps two separate observed positions, shares gaze and expires hidden tracks',()=>{
 const p=new PatientPerception(7,0,true),a=point(1,-.6),b=point(2,.6),c=point(3,1.2,4);
 p.updateTracks(1,here,1,[a,b,c],[1,2,3]);
 assert.deepEqual(p.snapshot(0).tracked.map(t=>t.id),[1,2]);
 assert.ok(Math.abs(p.attentionPoint(here,a).x)<1e-9);
 p.updateTracks(2,here,1,[a],[1,2,3]);
 assert.equal(p.snapshot(0).tracked[1].visible,false);
 assert.deepEqual(p.snapshot(0).tracked[1].point,{x:b.x,z:b.z});
 assert.deepEqual(p.attentionPoint(here,a),a);
 p.updateTracks(2+VISION.memoryTicks,here,1,[a],[1,2,3]);
 assert.equal(p.snapshot(0).tracked.length,1);
 p.clear();assert.equal(p.snapshot(0).tracked.length,0);
});
test('dual channels bind different limbs and targets, never a single sweep across unrelated victims',()=>{
 const s=new StrikeState(),ids=LAB_SEGMENTS.map(v=>v.id);
 for(const kind of ['arm','leg']){
  const tick=kind==='arm'?0:60,secondary={side:'R',kind:'arm',targetId:2,aim:[.4,1.4,-.5]};
  assert.ok(s.start(tick,'L',1,[-.4,1.4,-.5],0,undefined,kind,false,secondary));
  assert.deepEqual(strikeChannels(s.punch).map(p=>[p.kind,p.side,p.targetId]),[[kind,'L',1],['arm','R',2]]);
  s.track(tick+5,[.3,1.2,-.4],2);assert.deepEqual(s.punch.secondary.aim,[.3,1.2,-.4]);
  assert.equal(s.resolveTarget(3),false);assert.ok(s.resolveTarget(2));assert.equal(s.resolveTarget(2),false);assert.equal(s.exhausted,false);
  assert.ok(s.resolveTarget(1));assert.equal(s.exhausted,true);
  assert.deepEqual(s.snapshot(tick+20).hitIds,[2,1]);s.advance(tick+48,true,ids);
 }
 const single=new StrikeState();single.start(0,'L',1,[0,1,0],0);assert.equal(single.resolveTarget(2),false);assert.ok(single.resolveTarget(1));
 const illegal=new StrikeState();
 assert.equal(illegal.start(0,'L',1,[0,1,0],0,undefined,'arm',false,{side:'L',kind:'arm',targetId:2,aim:[0,1,0]}),false);
 assert.equal(illegal.start(0,'L',1,[0,1,0],0,undefined,'leg',false,{side:'R',kind:'leg',targetId:2,aim:[0,1,0]}),false);
});
test('combined pose has both attacking chains and connected anatomy; real sweep hits separate reachable targets',()=>{
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:Object.fromEntries(['stance','stalk','punch','kick'].map(k=>[k,referencePose(k)]))});
 const base=new PatientGait([0,0,0],0,true,motion).pose(0,[0,0,0],0,0),get=(p,id)=>p.find(v=>v.id===id),dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 const p={side:'L',kind:'arm',targetId:1,aim:[-.62,1.45,-.48],start:0,yaw:0,secondary:{side:'R',kind:'arm',targetId:2,aim:[.62,1.45,-.48]}};
 const at=punchPose(base,p,31,()=>0,motion),prior=punchPose(base,p,23,()=>0,motion);
 for(const v of at)assert.ok(Math.abs(dist(v.a,v.b)-LAB_SEGMENTS.find(s=>s.id===v.id).nominalLength)<1e-7,v.id);
 for(const side of ['L','R']){
  const hand=get(at,side+'.hand'),other=get(at,side==='L'?'R.hand':'L.hand');
  assert.ok(dist(hand.a,get(base,side+'.hand').a)>.1);
  assert.ok(dist(hand.a,other.a)>.3);
  assert.ok(dist(get(at,side+'.upperArm').a,get(at,'chest')[side==='L'?'a':'b'])<1e-8);
  const target={id:'head',a:hand.a,b:hand.a,radius:.05};
  assert.ok(firstStrikeContactDetail(prior,at,[target],[target],side,'arm'));
 }
 assert.deepEqual(punchPose(base,p,48,()=>0,motion),base);
});
test('lateral aim is limited to 70 degrees and actual limb pose keeps anatomical lengths',()=>{
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:Object.fromEntries(['stance','stalk','punch','kick'].map(k=>[k,referencePose(k)]))});
 const base=new PatientGait([0,0,0],0,true,motion).pose(0,[0,0,0],0,0);
 const hip=base.find(v=>v.id==='pelvis'),x=(hip.a[0]+hip.b[0])*.5,z=(hip.a[2]+hip.b[2])*.5;
 for(const side of ['L','R']){
  const sign=side==='L'?-1:1,aim=[x+sign,1,z+.5],limited=clampStrikeAim(base,aim,0);
  assert.ok(Math.abs(strikeBearing(base,limited,0)-sign*SIDE_STRIKE_LIMIT)<1e-9);
  for(const kind of ['arm','leg']){
   const pose=punchPose(base,{side,kind,start:0,yaw:0,targetId:1,aim:[limited[0],kind==='arm'?1.4:.55,limited[2]]},31,()=>0,motion);
   for(const p of pose)assert.ok(Math.abs(Math.hypot(...p.a.map((v,i)=>v-p.b[i]))-LAB_SEGMENTS.find(v=>v.id===p.id).nominalLength)<1e-7,p.id);
  }
 }
});
test('particle port retains bounded lifetime, deterministic spray and no flash primitive',()=>{
 assert.equal(HIT_PARTICLES.normal,11);assert.equal(HIT_PARTICLES.critical,15);assert.equal(HIT_PARTICLES.sever,HIT_PARTICLES.critical*2);
 const p=particleSpec(7,1,0);assert.deepEqual(p,particleSpec(7,1,0));assert.ok(p.life<=.51&&p.life>.38*.7);
 assert.ok(particleFrame(p,0).offset.every(v=>v===0));assert.equal(particleFrame(p,p.life),null);
 assert.ok(particleFrame(p,p.life*.9).scale<particleFrame(p,0).scale);
});

import {bodyPool,poolRadius} from '../../lab-next/body-pool.js';
test('settled body stain uses remaining horizontal length plus one third and grows once',()=>{
 const p=bodyPool([{id:'abdomen',a:[0,.1,0],b:[0,.1,1],radius:.1}],7,60);
 assert.ok(Math.abs(p.radius*2-1.2*4/3)<1e-9);
 assert.deepEqual(p.point,[0,0,.5]);assert.equal(p.tick,60);
 assert.ok(poolRadius(p.radius,0)<poolRadius(p.radius,1));assert.ok(poolRadius(p.radius,1)<poolRadius(p.radius,2));
 assert.equal(poolRadius(p.radius,3),p.radius);assert.equal(poolRadius(p.radius,10),p.radius);
});
