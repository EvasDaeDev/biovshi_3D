import {lowTargetAmount,strikeTrajectory} from './strike-trajectory.js';
import type { Vec3,PhysicsSegmentPose } from '../types.js';
import type { Punch,StrikePhase } from './strike.js';
import { balanceSingleSupport } from '../rig/single-support.js';
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale=(a:Vec3,n:number):Vec3=>[a[0]*n,a[1]*n,a[2]*n];
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>add(a,scale(sub(b,a),t));
const unit=(a:Vec3,fallback:Vec3):Vec3=>{const n=Math.hypot(...a);return n>1e-8?scale(a,1/n):fallback;};
export function extraStrikePose(pose:readonly PhysicsSegmentPose[],p:Punch,phase:StrikePhase,t:number,ground:(x:number,z:number)=>number,supportLoad=1,coordinated=false):readonly PhysicsSegmentPose[]{
 if(p.kind==='head'){
  const neck=pose.find(v=>v.id==='neck'),head=pose.find(v=>v.id==='head');
  if(!neck||!head)return pose;
  const base=unit(sub(head.a,neck.a),[0,1,0]),forward:Vec3=[Math.sin(p.yaw),0,-Math.cos(p.yaw)];
  const back=unit(sub(base,scale(forward,.28)),base);
  // The neck is a rigid .23 m segment, with the head centre .10 m beyond it.
  // Limit the strike to the forward/upward hemisphere of the neck joint.
  const delta=sub(p.aim,neck.a),along=Math.max(0,delta[0]*forward[0]+delta[2]*forward[2]);
  const desired=unit([forward[0]*along,Math.max(-.10,delta[1]),forward[2]*along],base);
  const dir=unit(phase==='windup'?mix(base,back,t):phase==='thrust'?mix(back,desired,t):mix(desired,base,t),base);
  const joint=add(neck.a,scale(dir,.23)),center=add(joint,scale(dir,.10));
  return pose.map(v=>v.id==='neck'?{...v,b:joint}:v.id==='head'?{...v,a:center,b:center}:v);
 }
 if(p.kind==='leg'){
  const foot=pose.find(v=>v.id===p.side+'.foot'),support=p.side==='L'?'R':'L',plant=pose.find(v=>v.id===support+'.foot');
  const hip=pose.find(v=>v.id===p.side+'.upperLeg');
  if(!foot||!plant||!hip)return pose;
  const base=foot.a,low=coordinated?lowTargetAmount(p.aim,ground):0;
  const back:Vec3=[hip.a[0]-Math.sin(p.yaw)*.14,Math.max(base[1]+.23,hip.a[1]-.48)+.08*low,hip.a[2]+Math.cos(p.yaw)*.14];
  const aim:Vec3=[p.aim[0],Math.max(ground(p.aim[0],p.aim[2])+foot.radius,p.aim[1]),p.aim[2]];
  const target=coordinated?strikeTrajectory(base,back,aim,phase,t,low,'leg',p.yaw,p.side):phase==='windup'?mix(base,back,t):phase==='thrust'?mix(back,aim,t):mix(aim,base,t);
  // Same mass-driven support solver as the one-legged gait. It includes
  // the swinging leg in COM and maintains the opposite world foot anchor.
  return balanceSingleSupport(pose,pose.map(v=>v.id),support,plant.a,ground,target,supportLoad);
 }
 return pose;
}
