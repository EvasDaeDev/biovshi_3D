import test from 'node:test';
import assert from 'node:assert/strict';
import {PatientPerception,PATIENT_HEAD,gazeAwareRoute} from '../dist/combat/perception.js';
import {PatientGait} from '../dist/rig/gait.js';
import {horrorBipedStep} from '../dist/rig/movement-timing.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
import {mobilityFor} from '../dist/rig/mobility.js';
const mobility=mobilityFor(LAB_SEGMENTS.map(p=>p.id));
const dt=1/60,dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('authored neck turns 80 degrees from center in one second, two seconds side to side',()=>{
 const p=new PatientPerception(7,0,true),here={x:0,z:0};
 for(let i=0;i<60;i++)p.advanceLook(0,here,{x:2,z:0});
 assert.ok(Math.abs(p.snapshot(0).look-PATIENT_HEAD.limit)<1e-9);
 for(let i=0;i<120;i++){const before=p.snapshot(0).look;p.advanceLook(0,here,{x:-2,z:0});assert.ok(Math.abs(p.snapshot(0).look-before)<=PATIENT_HEAD.trackSpeed*dt+1e-9);}
 assert.ok(Math.abs(p.snapshot(0).look+PATIENT_HEAD.limit)<1e-9);
 assert.deepEqual(gazeAwareRoute(0,0),{heading:0,backward:false});
 const out=gazeAwareRoute(Math.PI,0);assert.ok(out.backward&&Math.abs(out.heading)<1e-9);
});
test('stride planning leads the landing root, even at a brisk walk or run',()=>{
 for(const v of [.8,1.48,2.8]){
  const p=horrorBipedStep(v);
  assert.ok(p.lead-v*p.swing>.10);
  assert.ok(p.interval>p.swing);
  assert.equal(horrorBipedStep(-v).lead,-p.lead);
 }
});
test('authored steady walk alternates full swings without moving planted anchors',()=>{
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk')}});
 const gait=new PatientGait([0,0,0],0,true,motion),speed=1.48;
 let root=[0,0,0],old=gait.footStates,last=-1,steps=0,forwardLandings=0,peak=0,prior=null;
 for(let i=0;i<360;i++){
  const d=gait.travel(dt,speed,mobility,0,root,0,i*dt,()=>0);
  root=[0,0,root[2]-d];gait.advance(root,0,d/dt,dt,()=>0,undefined,undefined,undefined,false,0,speed);
  const feet=gait.footStates,pose=gait.pose(0,root,0,i*dt);
  assert.ok(feet.filter(f=>f.moving).length<=1);
  for(let k=0;k<2;k++){
   if(!feet[k].moving&&!old[k].moving)assert.ok(dist(feet[k].point,old[k].point)<1e-9);
   if(feet[k].moving&&!old[k].moving){assert.notEqual(k,last);last=k;steps++;}
   if(!feet[k].moving&&old[k].moving&&feet[k].point[2]<root[2]-.05)forwardLandings++;
  }
  for(const p of pose)assert.ok(Math.abs(dist(p.a,p.b)-LAB_SEGMENTS.find(v=>v.id===p.id).nominalLength)<1e-7,p.id);
  if(prior&&i>60)for(const id of ['L.upperLeg','R.upperLeg'])peak=Math.max(peak,dist(pose.find(p=>p.id===id).b,prior.find(p=>p.id===id).b));
  old=feet;prior=pose;
 }
 assert.ok(steps>=10&&forwardLandings>=steps-2,JSON.stringify({steps,forwardLandings,root,peak}));
 assert.ok(-root[2]>speed*6*.75,JSON.stringify({root,steps,peak}));
 assert.ok(peak<.16,'knee displacement per tick '+peak);
});
