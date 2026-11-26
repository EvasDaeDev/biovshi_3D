import test from 'node:test';
import assert from 'node:assert/strict';
import {PatientGait} from '../dist/rig/gait.js';
import {HORROR_MOVEMENT,horrorBipedStep} from '../dist/rig/movement-timing.js';
import {coordinatedStrikeBody} from '../dist/combat/coordinated-strike.js';
import {punchPose} from '../dist/combat/strike.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
import {mobilityFor} from '../dist/rig/mobility.js';
const dt=1/60,dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:Object.fromEntries(['stance','stalk','punch','kick','headbutt'].map(k=>[k,referencePose(k)]))});
const ids=LAB_SEGMENTS.map(v=>v.id),mobility=mobilityFor(ids);
const get=(p,id)=>p.find(v=>v.id===id),center=p=>p.a.map((v,i)=>(v+p.b[i])*.5);
test('forward punch and backward kick counter-lean move real girdles, not reach constants',()=>{
 const base=new PatientGait([0,0,0],0,true,motion).pose(0,[0,0,0],0,0);
 const p={side:'L',targetId:1,start:0,yaw:0,aim:[-.2,1.5,-.8]};
 const arm=coordinatedStrikeBody(base,{...p,kind:'arm'},1,motion),leg=coordinatedStrikeBody(base,{...p,kind:'leg'},1,motion);
 const torso=pose=>center(get(pose,'chest'))[2]-center(get(pose,'pelvis'))[2];
 assert.ok(torso(arm)<torso(base)-.06);assert.ok(torso(leg)>torso(base)+.06);
 assert.deepEqual(get(arm,'L.foot'),get(base,'L.foot'));
 for(const kind of ['arm','leg']){
  const pose=punchPose(base,{...p,kind,aim:kind==='leg'?[-.2,.45,-.45]:p.aim},31,()=>0,motion);
  for(const v of pose)assert.ok(Math.abs(dist(v.a,v.b)-LAB_SEGMENTS.find(d=>d.id===v.id).nominalLength)<1e-7,v.id);
  assert.ok(dist(get(pose,'R.foot').a,get(base,'R.foot').a)<.025);
 }
});
test('authored sprint increases measured displacement with alternating planted steps',()=>{
 assert.ok(Math.abs(HORROR_MOVEMENT.sprintSpeed/2.3-1.5)<1e-9);
 const run=speed=>{
  const g=new PatientGait([0,0,0],0,true,motion);
  let root=[0,0,0],old=g.footStates,start=0,last=-1,steps=0,peak=0;
  for(let i=0;i<360;i++){
   const d=g.travel(dt,speed,mobility,0,root,0,i*dt,()=>0);
   root=[0,0,root[2]-d];g.advance(root,0,d/dt,dt,()=>0,mobility,ids,undefined,false,0,speed);
   const f=g.footStates;
   assert.ok(f.filter(v=>v.moving).length<=1);
   for(let j=0;j<2;j++){
    if(!f[j].moving&&!old[j].moving)assert.ok(dist(f[j].point,old[j].point)<1e-9);
    if(f[j].moving&&!old[j].moving){assert.notEqual(j,last);last=j;steps++;}
   }
   if(i%12===0)for(const p of g.pose(0,root,0,i*dt))assert.ok(Math.abs(dist(p.a,p.b)-LAB_SEGMENTS.find(v=>v.id===p.id).nominalLength)<1e-7,p.id);
   if(i===59)start=root[2];old=f;
  }
  return {pace:(start-root[2])/5,steps};
 };
 const old=run(2.3/.81),fast=run(HORROR_MOVEMENT.sprintSpeed/.81);
 assert.ok(fast.pace>old.pace*1.30&&fast.pace>HORROR_MOVEMENT.sprintSpeed/.81*.80,JSON.stringify({old,fast}));
 assert.ok(fast.steps>old.steps);
 assert.ok(horrorBipedStep(4.25).lead-4.25*horrorBipedStep(4.25).swing>.10);
});
