import test from 'node:test';
import assert from 'node:assert/strict';
import {solveTwoBone} from '../dist/rig/two-bone.js';
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('IK reaches attainable target and respects both bone lengths',()=>{
 const root=[0,1,0],target=[0,.2,0];
 const p=solveTwoBone(root,target,.49,.5,[0,0,-1]);
 near(dist(root,p.joint),.49);near(dist(p.joint,p.end),.5);near(dist(p.end,target),0);assert.ok(p.joint[2]<0);
});
test('IK clamps unreachable and too-close targets without stretching',()=>{
 for(const target of [[0,-5,0],[0,0,0],[0,.01,0]]){
  const p=solveTwoBone([0,0,0],target,.49,.5,[0,0,-1]);
  near(dist([0,0,0],p.joint),.49);near(dist(p.joint,p.end),.5);
 }
});
test('IK handles parallel pole and coincident equal-length joints',()=>{
 for(const target of [[0,0,-.5],[0,0,0]]){
  const p=solveTwoBone([0,0,0],target,.5,.5,[0,0,-1]);
  near(dist([0,0,0],p.joint),.5);near(dist(p.joint,p.end),.5);
 }
 assert.throws(()=>solveTwoBone([0,0,0],[0,1,0],0,.5,[0,0,-1]));
});
