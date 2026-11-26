import {strikeBearing} from './strike-sector.js';
import {lowTargetAmount,strikeTrajectory} from './strike-trajectory.js';
import type { Vec3,PhysicsSegmentPose } from '../types.js';
import type { Punch,StrikePhase } from './strike.js';
import {solveTwoBone} from '../rig/two-bone.js';
import { balanceSingleSupport } from '../rig/single-support.js';
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale=(a:Vec3,n:number):Vec3=>[a[0]*n,a[1]*n,a[2]*n];
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>add(a,scale(sub(b,a),t));
const unit=(a:Vec3,fallback:Vec3):Vec3=>{const n=Math.hypot(...a);return n>1e-8?scale(a,1/n):fallback;};
export function extraStrikePose(pose:readonly PhysicsSegmentPose[],p:Punch,phase:StrikePhase,t:number,ground:(x:number,z:number)=>number,supportLoad=1,coordinated=false,weight=1,supportPlant?:Vec3):readonly PhysicsSegmentPose[]{
 if(p.kind==='head'){
  const neck=pose.find(v=>v.id==='neck'),head=pose.find(v=>v.id==='head');
  if(!neck||!head)return pose;
  const base=unit(sub(head.a,neck.a),[0,1,0]),forward:Vec3=[Math.sin(p.yaw),0,-Math.cos(p.yaw)];
  const back=unit(sub(base,scale(forward,.28)),base);
  // The neck is a rigid .23 m segment, with the head centre .10 m beyond it.
  // Limit the strike to the forward/upward hemisphere of the neck joint.
  const delta=sub(p.aim,neck.a),along=Math.max(0,delta[0]*forward[0]+delta[2]*forward[2]);
  const desired=unit([forward[0]*along,Math.max(-.10,delta[1]),forward[2]*along],base);
  const raw=phase==='windup'?mix(base,back,t):phase==='thrust'?mix(back,desired,t):mix(desired,base,t);
  const dir=unit(weight===1?raw:mix(base,raw,weight),base);
  const joint=add(neck.a,scale(dir,.23)),center=add(joint,scale(dir,.10));
  return pose.map(v=>v.id==='neck'?{...v,b:joint}:v.id==='head'?{...v,a:center,b:center}:v);
 }
 if(p.kind==='leg'){
  const foot=pose.find(v=>v.id===p.side+'.foot'),shin=pose.find(v=>v.id===p.side+'.lowerLeg'),support=p.side==='L'?'R':'L',plant=pose.find(v=>v.id===support+'.foot');
  const hip=pose.find(v=>v.id===p.side+'.upperLeg');
  if(!plant||!hip)return pose;
  const source=foot??shin??hip,base=foot?.a??source.b,low=coordinated?lowTargetAmount(p.aim,ground):0;
  const aimYaw=coordinated?p.yaw+strikeBearing(pose,p.aim,p.yaw):p.yaw;
  const back:Vec3=[hip.a[0]-Math.sin(aimYaw)*.14,Math.max(base[1]+.23,hip.a[1]-.48)+.08*low,hip.a[2]+Math.cos(aimYaw)*.14];
  const aim:Vec3=[p.aim[0],Math.max(ground(p.aim[0],p.aim[2])+source.radius,p.aim[1]),p.aim[2]];
  const rawTarget=coordinated?strikeTrajectory(base,back,aim,phase,t,low,'leg',aimYaw,p.side):phase==='windup'?mix(base,back,t):phase==='thrust'?mix(back,aim,t):mix(aim,base,t);
  if(p.pounce){
   // In flight neither leg is a world-space support anchor. Reconnect
   // both leg chains to the rotated pelvis, preserving the other leg's
   // pose relative to its hip. The attacking foot uses the normal IK.
   const pelvis=pose.find(v=>v.id==='pelvis');if(!pelvis)return pose;
   const updates=new Map<string,PhysicsSegmentPose>();
   for(const side of ['L','R'] as const){
    const u=pose.find(v=>v.id===side+'.upperLeg'),l=pose.find(v=>v.id===side+'.lowerLeg'),f=pose.find(v=>v.id===side+'.foot');if(!u||!l||!f)continue;
    const root=side==='L'?pelvis.a:pelvis.b,offset=sub(l.b,f.a);
    const target=side===p.side?add(weight===1?rawTarget:mix(base,rawTarget,weight),offset):add(l.b,sub(root,u.a));
    const leg=solveTwoBone(root,target,.49,.50,[Math.sin(p.yaw),.02,-Math.cos(p.yaw)]),tip=sub(leg.end,offset);
    updates.set(u.id,{...u,a:root,b:leg.joint});updates.set(l.id,{...l,a:leg.joint,b:leg.end});updates.set(f.id,{...f,a:tip,b:tip});
   }
   return pose.map(v=>updates.get(v.id)??v);
  }
  // Same mass-driven support solver as the one-legged gait. It includes
  // the swinging leg in COM and maintains the opposite world foot anchor.
  return balanceSingleSupport(pose,pose.map(v=>v.id),support,supportPlant??plant.a,ground,weight===1?rawTarget:mix(base,rawTarget,weight),supportLoad,coordinated?p.yaw:undefined);
 }
 return pose;
}
