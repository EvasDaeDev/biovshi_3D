import test from 'node:test';
import assert from 'node:assert/strict';
import {PatientPerception,VISION} from '../dist/combat/perception.js';
import {StrikeState,punchPose} from '../dist/combat/strike.js';
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
test('one arm/leg sweep can contact two distinct victims but never twice or a third',()=>{
 const s=new StrikeState(),ball=(id,x)=>({id,a:[x,1,0],b:[x,1,0],radius:.08});
 for(const kind of ['arm','leg']){
  const source=kind==='arm'?'L.hand':'L.foot',before=[ball(source,-1)],after=[ball(source,1)];
  assert.ok(s.start(kind==='arm'?0:60,'L',1,[0,1,0],0,undefined,kind,false,true));
  const a=firstStrikeContactDetail(before,after,[ball('head',-.3)],[ball('head',-.3)],'L',kind);
  const b=firstStrikeContactDetail(before,after,[ball('head',.4)],[ball('head',.4)],'L',kind);
  assert.ok(a&&b&&a.time<b.time&&a.point.every(Number.isFinite));
  assert.ok(s.resolveTarget(2));assert.equal(s.resolveTarget(2),false);assert.ok(s.resolveTarget(1));assert.equal(s.resolveTarget(3),false);
  assert.equal(s.exhausted,true);assert.deepEqual(s.snapshot(kind==='arm'?20:80).hitIds,[2,1]);
  s.advance(kind==='arm'?48:108,true,LAB_SEGMENTS.map(v=>v.id));
 }
 const legacy=new StrikeState();legacy.start(0,'L',1,[0,1,0],0);assert.equal(legacy.resolveTarget(2),false);assert.ok(legacy.resolveTarget(1));assert.equal(legacy.exhausted,true);
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
 assert.equal(HIT_PARTICLES.normal,8);assert.equal(HIT_PARTICLES.sever,14);
 const p=particleSpec(7,1,0);assert.deepEqual(p,particleSpec(7,1,0));assert.ok(p.life<=.38);
 assert.ok(particleFrame(p,0).offset.every(v=>v===0));assert.equal(particleFrame(p,p.life),null);
 assert.ok(particleFrame(p,p.life*.9).scale<particleFrame(p,0).scale);
});
