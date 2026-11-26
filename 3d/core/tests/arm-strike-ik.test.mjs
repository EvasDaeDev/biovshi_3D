import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredArmStrike,transportedElbow,directionBlend} from '../dist/rig/arm-strike-ik.js';
import {PoseTransition} from '../dist/animation/pose-transition.js';
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8);
test('transported pole stays unit and perpendicular across lateral/down singularity',()=>{
 let last=null;
 for(let i=-40;i<=40;i++){
  const target=[.3,-.195,i*.001],axis=target.map(x=>x/Math.hypot(...target));
  const p=transportedElbow([0,0,0],target,0,'R');
  near(Math.hypot(...p),1);near(p.reduce((sum,x,j)=>sum+x*axis[j],0),0);
  if(last)assert.ok(dist(last,p)<.02);
  last=p;
 }
});
test('connected spherical recovery preserves lengths, exact base and full IK reach',()=>{
 const u={id:'R.upperArm',a:[0,0,0],b:[0,-.36,0],radius:.1},l={id:'R.lowerArm',a:u.b,b:[0,-.36,-.32],radius:.08};
 const target=[.18,-.1,-.35];let last;
 for(let i=0;i<=20;i++){
  const p=authoredArmStrike(u,l,target,0,'R',i/20);
  near(dist(p.joint,u.a),.36);near(dist(p.end,p.joint),.32);
  if(i===0)assert.deepEqual(p,{joint:u.b,end:l.b});
  if(i===20)near(dist(p.end,target),0);
  if(last)assert.ok(dist(last.end,p.end)<.12);
  last=p;
 }
 near(Math.hypot(...directionBlend([1,0,0],[-1,0,0],.5)),1);
});
test('authored hurt transition slows silhouette without changing legacy timing',()=>{
 const legacy=new PoseTransition(),horror=new PoseTransition(.18);
 legacy.advance('hurt',.10);horror.advance('hurt',.10);
 near(legacy.weights[2],1);assert.ok(horror.weights[2]>.5&&horror.weights[2]<.7);
 horror.advance('hurt',.08);near(horror.weights[2],1);
});
