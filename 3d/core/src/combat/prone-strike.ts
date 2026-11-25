import type { Vec3,PhysicsSegmentPose } from '../types.js';
import type { Punch,StrikePhase } from './strike.js';
import { solveTwoBone } from '../rig/two-bone.js';
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a:Vec3,k:number):Vec3=>[a[0]*k,a[1]*k,a[2]*k];
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>add(a,mul(sub(b,a),t));
const unit=(a:Vec3,fallback:Vec3):Vec3=>{const n=Math.hypot(...a);return n>1e-9?mul(a,1/n):fallback;};
type Ground=(x:number,z:number)=>number;
const clear=(p:PhysicsSegmentPose,ground:Ground)=>[0,.5,1].every(t=>{
 const q=mix(p.a,p.b,t);return q[1]-p.radius>=ground(q[0],q[2])-1e-8;
});
/** Ground strike only changes the attacking chain. The remaining body
 * and non-attacking support retain their base pose. A blocked candidate
 * stays at the base pose rather than lifting the entire patient. */
export function proneStrikePose(pose:readonly PhysicsSegmentPose[],p:Punch,phase:StrikePhase,t:number,ground:Ground):readonly PhysicsSegmentPose[]{
 const forward:Vec3=[Math.sin(p.yaw),0,-Math.cos(p.yaw)];
 if(p.kind==='head'){
  const neck=pose.find(v=>v.id==='neck'),head=pose.find(v=>v.id==='head');
  if(!neck||!head)return pose;
  const base=unit(sub(head.a,neck.a),forward),back=unit(add(base,[0,.85,0]),base);
  const delta=sub(p.aim,neck.a);
  // A short, awkward lunge of the remaining head/neck, not a vertical headbutt.
  const desired=unit(delta,base);
  const raw=phase==='windup'?mix(base,back,t):phase==='thrust'?mix(back,desired,t):mix(desired,base,t);
  for(const lift of [0,.10,.25,.50,1]){
   const dir=unit(add(raw,[0,lift,0]),base),joint=add(neck.a,mul(dir,.23)),end=add(joint,mul(dir,.10));
   const n={...neck,b:joint},h={...head,a:end,b:end};
   if(clear(n,ground)&&clear(h,ground))return pose.map(v=>v.id==='neck'?n:v.id==='head'?h:v);
  }
  return pose;
 }
 if(p.kind==='leg')return pose;
 const key=p.side+'.',u=pose.find(v=>v.id===key+'upperArm'),l=pose.find(v=>v.id===key+'lowerArm'),h=pose.find(v=>v.id===key+'hand');
 if(!u||!l)return pose;
 const base=l.b,side=p.side==='L'?-1:1;
 const back=add(u.a,[-forward[0]*.12+Math.cos(p.yaw)*side*.16,.18,-forward[2]*.12+Math.sin(p.yaw)*side*.16]);
 const aim:Vec3=[p.aim[0],Math.max(p.aim[1],ground(p.aim[0],p.aim[2])+l.radius),p.aim[2]];
 const raw=phase==='windup'?mix(base,back,t):phase==='thrust'?mix(back,aim,t):mix(aim,base,t);
 for(const lift of [0,.04,.08,.16]){
  const target:Vec3=[raw[0],Math.max(raw[1]+lift,ground(raw[0],raw[2])+l.radius),raw[2]];
  const ik=solveTwoBone(u.a,target,.36,.32,[Math.cos(p.yaw)*side*.35,1,Math.sin(p.yaw)*side*.35]);
  const pu={...u,b:ik.joint},pl={...l,a:ik.joint,b:ik.end},ph=h?{...h,a:ik.end,b:ik.end}:null;
  if(clear(pu,ground)&&clear(pl,ground)&&(!ph||clear(ph,ground)))return pose.map(v=>v.id===u.id?pu:v.id===l.id?pl:ph&&v.id===ph.id?ph:v);
 }
 return pose;
}
