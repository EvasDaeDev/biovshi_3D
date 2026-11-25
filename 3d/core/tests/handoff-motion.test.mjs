import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {captureSegmentMotion,HANDOFF_LIMITS} from '../dist/animation/handoff-motion.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {createRagdoll,ragdollPose} from '../../lab-next/ragdoll.js';
const dt=FIXED_DT,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7);
test('motion capture uses world center and shortest observed capsule swing, bounds rates and skips absent anatomy',()=>{
 const a={id:'L.upperArm',a:[0,0,0],b:[0,1,0],radius:.1};
 const b={...a,a:[.02,0,0],b:[.02-Math.sin(.05),Math.cos(.05),0]};
 const [m]=captureSegmentMotion([a,{...a,id:'head'}],[b],dt);
 near(m.angular[2],3);near(m.linear[0],(.02-Math.sin(.05)/2)/dt);
 const [fast]=captureSegmentMotion([a],[{...a,a:[100,0,0],b:[101,0,0]}],dt);
 near(Math.hypot(...fast.linear),HANDOFF_LIMITS.linear);near(Math.hypot(...fast.angular),HANDOFF_LIMITS.angular);
 assert.deepEqual(captureSegmentMotion([a],[{...b,id:'R.upperArm'}],dt),[]);
 assert.throws(()=>captureSegmentMotion([a],[b],0));
});
test('authored moving patient hands off measured velocities only for remaining segments',()=>{
 const f={...createLabConfig(7).fighters[0],origin:[0,0,0],yawRad:0};
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f],patientPoses:{schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk')}}});
 try{
  for(let i=0;i<35;i++)c.step(dt,{commands:[{fighterId:0,forward:1,turn:0,sprint:false}]});
  c.incapacitate(0);
  const e=c.drainEvents().find(v=>v.type==='fighter-incapacitated');
  assert.ok(e.bodyMotion?.length===e.bodyPose.length);
  assert.ok(e.bodyMotion.some(v=>Math.hypot(...v.linear)>.1));
  assert.ok(e.bodyMotion.every(v=>Math.hypot(...v.linear)<=2.500001&&Math.hypot(...v.angular)<=8.000001));
  c.initialize({seed:7,fighters:[f]});c.incapacitate(0);
  assert.equal(c.drainEvents().find(v=>v.type==='fighter-incapacitated').bodyMotion,undefined);
 }finally{c.dispose();}
});
test('Rapier nodes inherit distinct velocities without changing captured geometry',async()=>{
 await RAPIER.init();
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[createLabConfig(7).fighters[0]]});
 const pose=c.getSnapshot().rigSegments[0],w=new RAPIER.World({x:0,y:-9.81,z:0});
 try{
  const motion=pose.map(p=>({id:p.id,linear:[p.id==='L.lowerArm'?1:0,0,0],angular:[0,p.id==='L.lowerArm'?3:0,0]}));
  const rag=createRagdoll(RAPIER,w,pose,[0,0,1],0,motion);
  const left=rag.nodes.find(n=>n.parts.some(p=>p.id==='L.lowerArm')).rb;
  const right=rag.nodes.find(n=>n.parts.some(p=>p.id==='R.lowerArm')).rb;
  assert.ok(left.linvel().x>right.linvel().x+.5);
  assert.ok(left.angvel().y>right.angvel().y+2);
  const initial=ragdollPose(rag);
  for(let i=0;i<pose.length;i++)for(const k of ['a','b'])for(let j=0;j<3;j++)assert.ok(Math.abs(initial[i][k][j]-pose[i][k][j])<1e-6);
 }finally{w.free();c.dispose();}
});
