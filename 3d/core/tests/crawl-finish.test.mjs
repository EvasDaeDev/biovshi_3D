import test from 'node:test';
import assert from 'node:assert/strict';
import {anatomicalBoneFrame} from '../dist/rig/bone-frame.js';
import {pronePose,blendGroundPose} from '../dist/rig/prone.js';
import {PatientGait} from '../dist/rig/gait.js';
import {mobilityFor} from '../dist/rig/mobility.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
import {crouchPunchBase} from '../dist/combat/crouch-punch.js';
import {punchPose,StrikeState} from '../dist/combat/strike.js';
import {strikeLocomotion} from '../dist/combat/strike-locomotion.js';
import {groundedContactPoint} from '../dist/combat/grounded-pursuit.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {firstStrikeContact} from '../dist/combat/swept-contact.js';
const ids=LAB_SEGMENTS.map(p=>p.id),ground=()=>0;
const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk'),punch:referencePose('punch')}});
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),get=(p,id)=>p.find(v=>v.id===id),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const base=new PatientGait([0,0,0],0,true,motion).pose(0,[0,0,0],0,0);
test('crawl boxes use a body-relative frame, without axial flips through a stroke',()=>{
 const mobility=mobilityFor(ids.filter(id=>!/Leg$|foot$/.test(id)));
 for(const yaw of [0,.8,1.57,3.14]){
  const previous=new Map();
  for(let i=0;i<=240;i++){
   const raw=pronePose([0,0,0],yaw,i*Math.PI/120,1,1,mobility,ground,true);
   const pose=blendGroundPose(base,raw,1,ids,ground);
   for(const id of ['abdomen','chest','L.upperArm','R.upperArm','L.lowerArm','R.lowerArm']){
    const f=anatomicalBoneFrame(get(pose,id),pose,yaw);
    assert.ok([...f.x,...f.y,...f.z].every(Number.isFinite));
    assert.ok(Math.abs(dot(f.x,f.y))<1e-8);
    const old=previous.get(id);if(old)assert.ok(dot(f.z,old.z)>0,JSON.stringify({yaw,id,i,dot:dot(f.z,old.z)}));
    previous.set(id,f);
   }
  }
 }
});
test('grounded target approach follows closest exposed body part instead of pelvis root',()=>{
 const parts=[{id:'abdomen',a:[0,.2,0],b:[0,.2,-.5],radius:.13},{id:'head',a:[0,.2,-.85],b:[0,.2,-.85],radius:.19}];
 const front=groundedContactPoint({x:0,z:-1.6},parts,{x:0,z:0});
 const side=groundedContactPoint({x:.7,z:-.4},parts,{x:0,z:0});
 assert.deepEqual(front,{x:0,z:-.85});assert.ok(Math.abs(side.z+.4)<1e-9);
});
test('grounded pursuit prefers a nearby head without taking an unnecessary detour',()=>{
 const abdomen={id:'abdomen',a:[0,.2,0],b:[0,.2,-.5],radius:.13};
 const head={id:'head',a:[0,.2,-.85],b:[0,.2,-.85],radius:.19};
 const parts=[abdomen,head],fallback={x:0,z:0};
 // Head is about .060 m farther than the torso: favour it.
 assert.deepEqual(groundedContactPoint({x:.7,z:-.55},parts,fallback),{x:0,z:-.85});
 // Head is about .132 m farther: keep the nearest torso approach.
 const side=groundedContactPoint({x:.7,z:-.4},parts,fallback);
 assert.ok(Math.abs(side.z+.4)<1e-9);
 // No forced head approach from behind, or after head removal.
 assert.deepEqual(groundedContactPoint({x:0,z:.3},parts,fallback),fallback);
 assert.ok(Math.abs(groundedContactPoint({x:.7,z:-.4},[abdomen],fallback).z+.4)<1e-9);
 assert.deepEqual(groundedContactPoint({x:.7,z:-.4},[],fallback),fallback);
});
test('squat lowers pelvis, keeps feet and lengths, and can hit a low target during thrust',()=>{
 const low=crouchPunchBase(base,0,1,ground);
 assert.ok(get(base,'pelvis').a[1]-get(low,'pelvis').a[1]>.5);
 for(const side of ['L','R'])assert.deepEqual(get(low,side+'.foot'),get(base,side+'.foot'));
 for(const p of low)assert.ok(Math.abs(dist(p.a,p.b)-LAB_SEGMENTS.find(s=>s.id===p.id).nominalLength)<1e-7,p.id);
 const punch={side:'L',kind:'arm',targetId:1,aim:[-.3,.27,-.6],start:0,yaw:0,crouch:true};
 let previous=base,contact=false;
 const victim=[{id:'head',a:punch.aim,b:punch.aim,radius:.19}];
 for(let age=1;age<=48;age++){
  const p=punchPose(base,punch,age,ground,motion);
  for(const v of p)assert.ok(Math.abs(dist(v.a,v.b)-LAB_SEGMENTS.find(s=>s.id===v.id).nominalLength)<1e-7,v.id);
  assert.deepEqual(get(p,'L.foot'),get(base,'L.foot'));
  assert.deepEqual(get(p,'R.foot'),get(base,'R.foot'));
  if(age>=20&&age<32&&firstStrikeContact(previous,p,victim,victim,'L'))contact=true;
  previous=p;
 }
 assert.ok(contact,'low target must be physically reachable');
 assert.deepEqual(previous,base);
 const state=new StrikeState();assert.ok(state.start(0,'L',1,punch.aim,0,'head','arm',false,undefined,true));
 assert.equal(state.snapshot(20).crouch,true);
 assert.deepEqual(strikeLocomotion({fighterId:0,forward:1,turn:1,sprint:true,jump:true},state.punch,'thrust'),{fighterId:0,forward:0,turn:0,sprint:false,jump:false});
});
