import type {Vec3,PhysicsSegmentPose} from '../types.js';
import {solveTwoBone,type TwoBonePose} from './two-bone.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a:Vec3,k:number):Vec3=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a:Vec3,fallback:Vec3):Vec3=>{const n=Math.hypot(...a);return n>1e-9?mul(a,1/n):fallback;};
const clamp=(v:number)=>Math.max(-1,Math.min(1,v));
const UPPER_ARM_LENGTH=.36,FOREARM_LENGTH=.32;
export const ARM_REACH=UPPER_ARM_LENGTH+FOREARM_LENGTH;
/** Transport the outward elbow direction from a forward-down reference axis
 * to the wrist axis, avoiding the old lateral/down pole singularity. */
export function transportedElbow(root:Vec3,target:Vec3,yaw:number,side:'L'|'R'):Vec3{
 const forward:Vec3=[Math.sin(yaw),0,-Math.cos(yaw)],sign=side==='L'?-1:1,out:Vec3=[Math.cos(yaw)*sign,0,Math.sin(yaw)*sign];
 const reference=unit(add(forward,[0,-1,0]),[0,-1,0]);
 const axis=unit(sub(target,root),reference),c=clamp(dot(reference,axis));
 if(c<-.999)return unit(sub(out,mul(axis,dot(out,axis))),out);
 const k=cross(reference,axis);
 return unit(add(add(out,cross(k,out)),mul(cross(k,cross(k,out)),1/(1+c))),out);
}
/** Shortest great-circle interpolation, deterministic antiparallel fallback. */
export function directionBlend(from:Vec3,to:Vec3,t:number):Vec3{
 const a=unit(from,[0,-1,0]),b=unit(to,a);
 if(t<=0)return a;if(t>=1)return b;
 const c=clamp(dot(a,b)),theta=Math.acos(c);
 if(c>.9999)return unit(add(mul(a,1-t),mul(b,t)),a);
 let tangent=sub(b,mul(a,c));
 if(Math.hypot(...tangent)<1e-8){const ref:Vec3=Math.abs(a[0])<.8?[1,0,0]:[0,0,1];tangent=sub(ref,mul(a,dot(ref,a)));}
 return add(mul(a,Math.cos(theta*t)),mul(unit(tangent,[0,0,1]),Math.sin(theta*t)));
}
/** At full weight preserve the analytic IK endpoint; at boundaries blend
 * bone directions instead of a potentially degenerate pole vector. */
export function authoredArmStrike(upper:PhysicsSegmentPose,lower:PhysicsSegmentPose,target:Vec3,yaw:number,side:'L'|'R',weight:number):TwoBonePose{
 if(weight<=0)return {joint:upper.b,end:lower.b};
 const ik=solveTwoBone(upper.a,target,UPPER_ARM_LENGTH,FOREARM_LENGTH,transportedElbow(upper.a,target,yaw,side));
 if(weight>=1)return ik;
 const u=directionBlend(sub(upper.b,upper.a),sub(ik.joint,upper.a),weight);
 const l=directionBlend(sub(lower.b,lower.a),sub(ik.end,ik.joint),weight);
 const joint=add(upper.a,mul(u,UPPER_ARM_LENGTH));
 return {joint,end:add(joint,mul(l,FOREARM_LENGTH))};
}
