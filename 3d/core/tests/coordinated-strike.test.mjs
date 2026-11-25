import test from 'node:test';
import assert from 'node:assert/strict';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {punchPose} from '../dist/combat/strike.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const slots=Object.fromEntries(['stance','stalk','punch','kick','headbutt'].map(k=>[k,referencePose(k)]));
const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots});
const gait=new PatientGait([0,0,0],0,true,motion),base=gait.pose(0,[0,0,0],0,0);
const get=(p,id)=>p.find(v=>v.id===id);
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const center=p=>p.a.map((v,i)=>(v+p.b[i])*.5);
test('coordinated strikes preserve anatomy and return to base without major boundary jumps',()=>{
 for(const kind of ['arm','leg','head']){
  const p={kind,side:'L',targetId:1,start:0,yaw:0,aim:kind==='arm'?[-.3,1.3,-.5]:kind==='leg'?[-.2,.45,-.45]:[0,1.6,-.4]};
  let prev=base;
  for(let tick=0;tick<=48;tick++){
   const pose=punchPose(base,p,tick,()=>0,motion);
   for(const v of pose){
    assert.ok(Math.abs(dist(v.a,v.b)-LAB_SEGMENTS.find(d=>d.id===v.id).nominalLength)<1e-7,v.id);
    assert.ok(dist(v.a,get(prev,v.id).a)<.30,kind+' '+tick+' '+v.id);
   }
   assert.ok(dist(get(pose,'chest').a,get(pose,'L.upperArm').a)<1e-8);
   assert.ok(dist(get(pose,'chest').b,get(pose,'R.upperArm').a)<1e-8);
   assert.ok(dist(center(get(pose,'chest')),get(pose,'neck').a)<1e-8);
   assert.ok(Math.abs(dist(get(pose,'abdomen').b,center(get(pose,'chest')))-.14)<1e-7);
   if(kind==='leg')assert.ok(dist(get(pose,'R.foot').a,get(base,'R.foot').a)<.025);
   else for(const side of ['L','R'])assert.deepEqual(get(pose,side+'.foot'),get(base,side+'.foot'));
   prev=pose;
  }
  assert.deepEqual(prev,base);
 }
});
test('low arm strike inclines torso farther than a high strike without moving the feet',()=>{
 const punch={kind:'arm',side:'L',targetId:1,start:0,yaw:0,aim:[-.3,1.6,-.5]};
 const high=punchPose(base,punch,31,()=>0,motion);
 const low=punchPose(base,{...punch,aim:[-.3,.25,-.5]},31,()=>0,motion);
 assert.ok(center(get(low,'chest'))[2]<center(get(high,'chest'))[2]-.05);
 assert.deepEqual(get(low,'L.foot'),get(base,'L.foot'));
});
