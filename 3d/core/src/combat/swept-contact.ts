import type { StrikeKind } from './strike.js';
import type { PhysicsSegmentPose,Vec3 } from '../types.js';
import { capsuleContact } from '../collision/capsule-contact.js';
const delta=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const lerp=(a:Vec3,b:Vec3,t:number)=>({x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,z:a[2]+(b[2]-a[2])*t});
/** Bounded adaptive sampling of both moving capsule axes across a tick.
 * Sampling (not analytic continuous collision detection) uses relative
 * endpoint displacement and the smaller radius to avoid typical tunnelling. */
export function sweptContact(a0:PhysicsSegmentPose,a1:PhysicsSegmentPose,b0:PhysicsSegmentPose,b1:PhysicsSegmentPose):number|null{
 const motion=Math.max(delta(a0.a,a1.a),delta(a0.b,a1.b))+Math.max(delta(b0.a,b1.a),delta(b0.b,b1.b));
 const samples=Math.min(64,Math.max(1,Math.ceil(motion/Math.max(.005,Math.min(a1.radius,b1.radius)*.35))));
 for(let i=0;i<=samples;i++){
  const t=i/samples;
  if(capsuleContact({a:lerp(a0.a,a1.a,t),b:lerp(a0.b,a1.b,t),r:a1.radius},{a:lerp(b0.a,b1.a,t),b:lerp(b0.b,b1.b,t),r:b1.radius}))return t;
 }
 return null;
}
export interface StrikeContactDetail {readonly id:string;readonly time:number;readonly point:Vec3}
export function firstStrikeContactDetail(previous:readonly PhysicsSegmentPose[],current:readonly PhysicsSegmentPose[],victimPrevious:readonly PhysicsSegmentPose[],victimCurrent:readonly PhysicsSegmentPose[],side:'L'|'R',kind:StrikeKind='arm'):StrikeContactDetail|null{
 const prev=new Map(previous.map(p=>[p.id,p])),vp=new Map(victimPrevious.map(p=>[p.id,p]));
 let best:StrikeContactDetail|null=null,time=Infinity;
 for(const a of current){
  if(kind==='head'?a.id!=='head':kind==='leg'?a.id!==side+'.foot'&&a.id!==side+'.lowerLeg':a.id!==side+'.hand'&&a.id!==side+'.lowerArm')continue;
  const a0=prev.get(a.id);if(!a0)continue;
  for(const b of victimCurrent){
   const b0=vp.get(b.id);if(!b0)continue;
   const t=sweptContact(a0,a,b0,b);
   if(t!==null&&t<time){
    time=t;
    const source=lerp(a0.b,a.b,t),start=lerp(b0.a,b.a,t),end=lerp(b0.b,b.b,t);
    const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z,n=dx*dx+dy*dy+dz*dz;
    const q=n>1e-10?Math.max(0,Math.min(1,((source.x-start.x)*dx+(source.y-start.y)*dy+(source.z-start.z)*dz)/n)):0;
    const x=start.x+dx*q,y=start.y+dy*q,z=start.z+dz*q;
    const vx=source.x-x,vy=source.y-y,vz=source.z-z,length=Math.hypot(vx,vy,vz),r=length>1e-8?b.radius/length:0;
    best={id:b.id,time:t,point:[x+vx*r,y+vy*r,z+vz*r]};
   }
  }
 }
 return best;
}

export function firstStrikeContact(previous:readonly PhysicsSegmentPose[],current:readonly PhysicsSegmentPose[],victimPrevious:readonly PhysicsSegmentPose[],victimCurrent:readonly PhysicsSegmentPose[],side:'L'|'R',kind:StrikeKind='arm'):string|null{
 return firstStrikeContactDetail(previous,current,victimPrevious,victimCurrent,side,kind)?.id??null;
}
