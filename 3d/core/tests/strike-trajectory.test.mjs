import test from 'node:test';
import assert from 'node:assert/strict';
import {lowTargetAmount,strikeTrajectory} from '../dist/combat/strike-trajectory.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {punchPose} from '../dist/combat/strike.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const base=[-.2,.15,0],back=[-.2,.6,.1],aim=[-.2,.22,-.5];
const sample=(phase,t,low=1,kind='leg')=>strikeTrajectory(base,back,aim,phase,t,low,kind,0,'L');
test('low attack accent uses height relative to terrain, with smooth limits',()=>{
 assert.equal(lowTargetAmount([0,.2,0],()=>0),1);
 assert.equal(lowTargetAmount([0,1,0],()=>0),0);
 assert.equal(lowTargetAmount([0,1.2,0],()=>1),1);
 assert.ok(Math.abs(lowTargetAmount([0,.525,0],()=>0)-.5)<1e-10);
});
test('windup, downward strike and lifted recovery share exact endpoints',()=>{
 for(const kind of ['leg','arm']){
  assert.deepEqual(sample('windup',0,1,kind),base);
  assert.deepEqual(sample('windup',1,1,kind),back);
  assert.deepEqual(sample('thrust',0,1,kind),back);
  for(const [phase,t,p] of [['thrust',1,aim],['recover',0,aim],['recover',1,base]]){
   assert.ok(sample(phase,t,1,kind).every((v,i)=>Math.abs(v-p[i])<1e-12));
  }
  assert.ok(sample('thrust',.5,1,kind)[1]>sample('thrust',.5,0,kind)[1]);
  assert.ok(sample('recover',.5,1,kind)[1]>(aim[1]+base[1])*.5);
  assert.ok(sample('recover',.5,1,kind)[0]<base[0]);
 }
});
test('low authored kick and arm paths preserve lengths and return to the base rig',()=>{
 const slots=Object.fromEntries(['stance','stalk','punch','kick'].map(k=>[k,referencePose(k)]));
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots});
 const gait=new PatientGait([0,0,0],0,true,motion),rest=gait.pose(0,[0,0,0],0,0);
 const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),get=(p,id)=>p.find(v=>v.id===id);
 for(const kind of ['leg','arm']){
  const p={kind,side:'L',targetId:1,start:0,yaw:0,aim:[-.22,.22,-.47]};
  for(let tick=0;tick<=48;tick++){
   const pose=punchPose(rest,p,tick,()=>0,motion);
   for(const v of pose)assert.ok(Math.abs(dist(v.a,v.b)-LAB_SEGMENTS.find(d=>d.id===v.id).nominalLength)<1e-7,v.id);
   assert.ok(dist(get(pose,'R.foot').a,get(rest,'R.foot').a)<.025);
   if(kind==='arm')assert.deepEqual(get(pose,'L.foot'),get(rest,'L.foot'));
   if(tick===48)assert.deepEqual(pose,rest);
  }
 }
});
