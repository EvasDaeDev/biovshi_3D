import test from 'node:test';
import assert from 'node:assert/strict';
import {LocomotionMotion,organicSwing} from '../dist/animation/locomotion-motion.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const dt=1/60,dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('support is prepared over several ticks before lifting, changing foot restarts preparation',()=>{
 const m=new LocomotionMotion();
 for(let i=0;i<5;i++){assert.equal(m.prepare(0,dt),false);m.advance(dt,0,0,1);}
 assert.ok(m.sample.weight>.5);
 assert.equal(m.prepare(0,dt),true);
 assert.equal(m.prepare(1,dt),false);
 m.clearPreparation();assert.equal(m.prepare(1,dt),false);
});
test('pelvis leads chest and arms; inertia relaxes on braking and reversal',()=>{
 const m=new LocomotionMotion();m.advance(dt,.9,1,1);const first=m.sample;
 assert.ok(first.pelvis>first.chest&&first.chest>first.arms&&first.arms>0);
 for(let i=0;i<90;i++)m.advance(dt,.9,1,1);
 assert.ok(m.sample.drive>.99);
 m.advance(dt,0,0,0);assert.ok(m.sample.drive>0&&m.sample.inertia<0);
 for(let i=0;i<120;i++)m.advance(dt,0,0,0);
 for(const v of Object.values(m.sample))assert.ok(Math.abs(v)<.001);
 assert.notDeepEqual(organicSwing(0,.32,.085),organicSwing(1,.32,.085));
});
test('authored gait keeps fixed plant anchors and nominal lengths during start and stop',()=>{
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk')}});
 const gait=new PatientGait([0,0,0],0,true,motion);
 const ids=LAB_SEGMENTS.map(v=>v.id);
 let z=0,old=gait.footStates,swings=0;
 for(let i=0;i<300;i++){
  const speed=i<150?.75:0;z-=speed*dt;
  gait.advance([0,0,z],0,speed,dt);
  const feet=gait.footStates,pose=gait.pose(1,[0,0,z],0,i*dt);
  assert.ok(feet.filter(f=>f.moving).length<=1);
  for(let k=0;k<2;k++){
   if(!feet[k].moving&&!old[k].moving)assert.ok(dist(feet[k].point,old[k].point)<1e-9);
   if(feet[k].moving&&!old[k].moving)swings++;
  }
  for(const p of pose)assert.ok(Math.abs(dist(p.a,p.b)-LAB_SEGMENTS.find(d=>d.id===p.id).nominalLength)<1e-7,p.id);
  old=feet;
 }
 assert.ok(swings>=3);
 assert.ok(old.every(f=>!f.moving));
});
