import type {Vec3,PhysicsSegmentPose} from '../types.js';
import {solveTwoBone} from '../rig/two-bone.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a:Vec3,n:number):Vec3=>[a[0]*n,a[1]*n,a[2]*n];
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
/** Real squat, not a downward stretch of the arm. Preserve both ankle
 * endpoints, fold the knees in the body-forward plane and move the
 * connected upper-body chain as one rigid transform. */
export function crouchPunchBase(pose:readonly PhysicsSegmentPose[],yaw:number,amount:number,ground:(x:number,z:number)=>number=()=>0):readonly PhysicsSegmentPose[]{
 const w=clamp(amount);if(!w)return pose;
 const hip=pose.find(p=>p.id==='pelvis');
 const legs=(['L','R'] as const).map(side=>({side,upper:pose.find(p=>p.id===side+'.upperLeg'),lower:pose.find(p=>p.id===side+'.lowerLeg'),foot:pose.find(p=>p.id===side+'.foot')}));
 if(!hip||legs.some(l=>!l.upper||!l.lower||!l.foot))return pose;
 const pivot=scale(add(hip.a,hip.b),.5),forward:Vec3=[Math.sin(yaw),0,-Math.cos(yaw)];
 const floor=Math.max(...legs.map(l=>ground(l.foot!.a[0],l.foot!.a[2])));
 const drop=Math.max(0,Math.min(.64,pivot[1]-floor-.32))*w;
 const shift=add(scale(forward,-.10*w),[0,-drop,0]);
 const pitch=-.21*w,c=Math.cos(pitch),s=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw);
 const turn=(p:Vec3):Vec3=>{
  const d=sub(p,pivot),x=cy*d[0]+sy*d[2],z=-sy*d[0]+cy*d[2],y=d[1]*c-z*s,zz=d[1]*s+z*c;
  return add(add(pivot,shift),[cy*x-sy*zz,y,sy*x+cy*zz]);
 };
 const moved=new Map<string,PhysicsSegmentPose>();
 moved.set('pelvis',{...hip,a:add(hip.a,shift),b:add(hip.b,shift)});
 for(const l of legs){
  const u=l.upper!,lo=l.lower!,f=l.foot!,origin=add(u.a,shift);
  const ik=solveTwoBone(origin,lo.b,.49,.50,add(forward,[0,.04,0]));
  // If the foot cannot remain planted (e.g. pathological starting pose),
  // fail safely instead of moving the foot during a squat.
  if(Math.hypot(...sub(ik.end,lo.b))>1e-5)return pose;
  moved.set(u.id,{...u,a:origin,b:ik.joint});moved.set(lo.id,{...lo,a:ik.joint,b:lo.b});moved.set(f.id,f);
 }
 return pose.map(p=>moved.get(p.id)??{...p,a:turn(p.a),b:turn(p.b)});
}
