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
export function firstStrikeContact(previous:readonly PhysicsSegmentPose[],current:readonly PhysicsSegmentPose[],victimPrevious:readonly PhysicsSegmentPose[],victimCurrent:readonly PhysicsSegmentPose[],side:'L'|'R',kind:StrikeKind='arm'):string|null{
 const prev=new Map(previous.map(p=>[p.id,p])),vp=new Map(victimPrevious.map(p=>[p.id,p]));
 let best:string|null=null,time=Infinity;
 for(const a of current){
  if(kind==='head'?a.id!=='head':kind==='leg'?a.id!==side+'.foot'&&a.id!==side+'.lowerLeg':a.id!==side+'.hand'&&a.id!==side+'.lowerArm')continue;
  const a0=prev.get(a.id);if(!a0)continue;
  for(const b of victimCurrent){
   const b0=vp.get(b.id);if(!b0)continue;
   const t=sweptContact(a0,a,b0,b);
   if(t!==null&&t<time){time=t;best=b.id;}
  }
 }
 return best;
}
