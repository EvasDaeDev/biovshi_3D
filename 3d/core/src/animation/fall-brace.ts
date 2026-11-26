import type {Vec3} from '../types.js';
import type {RigPose} from '../rig/gait.js';
import {solveTwoBone} from '../rig/two-bone.js';

export interface FallBrace {
 readonly side:'L'|'R';
 readonly direction:Vec3;
}
const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];

/** Reach ahead of the descending body. The bare rig still owns the fall
 * and the setup for standing. Both endpoints release into those poses. */
export function braceFall(pose:readonly RigPose[],grounded:readonly RigPose[],brace:FallBrace,amount:number,ground:(x:number,z:number)=>number):readonly RigPose[]{
 const key=brace.side+'.';
 const upper=pose.find(p=>p.id===key+'upperArm'),lower=pose.find(p=>p.id===key+'lowerArm'),hand=pose.find(p=>p.id===key+'hand');
 const rest=grounded.find(p=>p.id===key+'hand');
 if(!upper||!lower||!hand||!rest)return pose;
 const weight=ease(amount/.35)*ease((1-amount)/.25);
 if(weight===0)return pose;
 const x=rest.a[0]+brace.direction[0]*.12,z=rest.a[2]+brace.direction[2]*.12;
 const target:Vec3=[x,ground(x,z)+hand.radius,z];
 const reach=mix(hand.a,target,weight);
 const pole:Vec3=[-brace.direction[0],1,-brace.direction[2]];
 const solution=solveTwoBone(upper.a,reach,.36,.32,pole);
 if(solution.end[1]<ground(solution.end[0],solution.end[2])+hand.radius-.005||
    solution.joint[1]<ground(solution.joint[0],solution.joint[2])+lower.radius-.005)return pose;
 return pose.map(p=>p===upper?{...p,b:solution.joint}:p===lower?{...p,a:solution.joint,b:solution.end}:p===hand?{...p,a:solution.end,b:solution.end}:p);
}
