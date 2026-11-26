import type {Vec3,PhysicsSegmentPose} from '../types.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a:Vec3,k:number):Vec3=>[a[0]*k,a[1]*k,a[2]*k];
const unit=(a:Vec3,fallback:Vec3):Vec3=>{const n=Math.hypot(...a);return n>1e-9?scale(a,1/n):fallback;};
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
/** A bounded cervical counter-motion. Uses a physical neck and skull,
 * never an altered camera transform. Keep the original neck attachment,
 * bone length and skull offset. The deliberate gaze is separate. */
export function compensateHead(pose:readonly PhysicsSegmentPose[],reference:Vec3,strength=.72):readonly PhysicsSegmentPose[]{
 const neck=pose.find(p=>p.id==='neck'),head=pose.find(p=>p.id==='head');
 if(!neck||!head||strength<=0)return pose;
 const axis=unit(sub(neck.b,neck.a),[0,1,0]),desired=unit(sub(reference,neck.a),axis);
 const angle=Math.acos(clamp(axis[0]*desired[0]+axis[1]*desired[1]+axis[2]*desired[2],-1,1));
 if(angle<1e-6)return pose;
 const perpendicular=unit(sub(desired,scale(axis,Math.cos(angle))),axis);
 const correction=Math.min(.30,angle*clamp(strength,0,1));
 const dir=unit(add(scale(axis,Math.cos(correction)),scale(perpendicular,Math.sin(correction))),axis);
 const joint=add(neck.a,scale(dir,Math.hypot(...sub(neck.b,neck.a))));
 const center=add(joint,scale(dir,Math.hypot(...sub(head.a,neck.b))));
 return pose.map(p=>p.id==='neck'?{...p,b:joint}:p.id==='head'?{...p,a:center,b:center}:p);
}
/** The free arm follows an opposing arc, rigidly rotating about the actual
 * shoulder. A strike's attacking chain is not moved by this helper. */
export function counterArms(pose:readonly PhysicsSegmentPose[],kind:'arm'|'leg'|'head',side:'L'|'R',yaw:number,amount:number):readonly PhysicsSegmentPose[]{
 if(Math.abs(amount)<1e-8)return pose;
 const pivots=new Map<string,Vec3>();
 for(const s of ['L','R'] as const){
  if(kind==='arm'&&s===side)continue;
  const upper=pose.find(p=>p.id===s+'.upperArm');
  if(upper)pivots.set(s,upper.a);
 }
 if(!pivots.size)return pose;
 return pose.map(p=>{
  const s=p.id.slice(0,1),origin=pivots.get(s);
  if(!origin||!/Arm$|hand$/.test(p.id))return p;
  const sign=s==='L'?-1:1;
  // Rotation around the transverse shoulder axis produces a small backward
  // swing, with more opening on the free side of a kick.
  const a=amount*(kind==='leg'?.24:kind==='head'?.18:.17),c=Math.cos(a),sn=Math.sin(a);
  const roll=amount*sign*(kind==='leg'?.17:.08),cr=Math.cos(roll),sr=Math.sin(roll);
  const point=(v:Vec3):Vec3=>{
   const d=sub(v,origin),x=Math.cos(yaw)*d[0]+Math.sin(yaw)*d[2],z=-Math.sin(yaw)*d[0]+Math.cos(yaw)*d[2];
   const yy=d[1]*c-z*sn,zz=d[1]*sn+z*c,xx=x*cr-yy*sr,y=x*sr+yy*cr;
   return add(origin,[Math.cos(yaw)*xx-Math.sin(yaw)*zz,y,Math.sin(yaw)*xx+Math.cos(yaw)*zz]);
  };
  return {...p,a:point(p.a),b:point(p.b)};
 });
}
