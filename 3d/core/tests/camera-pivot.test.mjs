import test from 'node:test';
import assert from 'node:assert/strict';
import {horrorTurnRate,pivotPlan} from '../dist/animation/turn-motion.js';
import {headFrame,withCameraMount} from '../dist/rig/head-frame.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const dt=1/60,dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('large turns accelerate while alignment remains proportional and bounded',()=>{
 assert.equal(horrorTurnRate(0),0);
 assert.equal(horrorTurnRate(1),4);
 assert.equal(horrorTurnRate(-1),-4);
 assert.ok(horrorTurnRate(.1)<.25);
 assert.ok(horrorTurnRate(1)*dt<.07);
 const p=pivotPlan(4,0);
 assert.ok(p.swing<.23&&p.interval<.32&&p.threshold<.08);
 assert.equal(pivotPlan(0,.7).strength,0);
 assert.equal(pivotPlan(4,.8).strength,0);
});
test('virtual head mount preserves physical head and gaze while removing strike displacement',()=>{
 const head=(a)=>({id:'head',a,b:a,radius:.15});
 const neck={id:'neck',a:[0,1,0],b:[0,1.23,0],radius:.06};
 const struck=head([0,1.3,-.35]),base=head([0,1.5,0]);
 const frame=headFrame([struck,neck],.1,-.3),stable=withCameraMount(frame,[base,neck]);
 assert.deepEqual(stable.center,struck.a);assert.deepEqual(stable.forward,frame.forward);
 assert.deepEqual(stable.cameraCenter,base.a);
 assert.equal(withCameraMount(null,[base]),null);
});
test('fast pivot retains fixed planted feet and connected anatomy',()=>{
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk')}});
 const g=new PatientGait([0,0,0],0,true,motion);let yaw=0,old=g.footStates;
 for(let i=0;i<120;i++){
  const turn=i<48?4:0;yaw+=turn*dt;
  g.advance([0,0,0],yaw,0,dt,()=>0,undefined,undefined,undefined,false,turn);
  const feet=g.footStates,p=g.pose(0,[0,0,0],yaw,i*dt);
  assert.ok(feet.filter(f=>f.moving).length<=1);
  for(let k=0;k<2;k++)if(!feet[k].moving&&!old[k].moving)assert.ok(dist(feet[k].point,old[k].point)<1e-9);
  for(const s of p)assert.ok(Math.abs(dist(s.a,s.b)-LAB_SEGMENTS.find(v=>v.id===s.id).nominalLength)<1e-7,s.id);
  old=feet;
 }
 assert.ok(g.stepCount>=2);
 assert.ok(old.every(f=>!f.moving));
});
