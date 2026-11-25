import type {PhysicsSegmentPose,SegmentMotion,Vec3} from '../types.js';
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a:Vec3,k:number):Vec3=>[a[0]*k,a[1]*k,a[2]*k];
const mid=(p:PhysicsSegmentPose):Vec3=>[(p.a[0]+p.b[0])*.5,(p.a[1]+p.b[1])*.5,(p.a[2]+p.b[2])*.5];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const limit=(v:Vec3,max:number):Vec3=>{const n=Math.hypot(...v);return n>max?mul(v,max/n):v;};
export const HANDOFF_LIMITS=Object.freeze({linear:2.5,angular:8});
/** Finite difference in world metres / radians per second. Capsule axes
 * expose swing, not axial roll; spheres have no observable angular rate.
 * Missing or changed geometry is not reconstructed from old anatomy. */
export function captureSegmentMotion(previous:readonly PhysicsSegmentPose[],current:readonly PhysicsSegmentPose[],dt:number):readonly SegmentMotion[]{
 if(!Number.isFinite(dt)||dt<=0)throw new RangeError('Invalid handoff delta');
 const old=new Map(previous.map(p=>[p.id,p]));
 const result:SegmentMotion[]=[];
 for(const p of current){
  const before=old.get(p.id);if(!before||before.radius!==p.radius)continue;
  const a=sub(before.b,before.a),b=sub(p.b,p.a),la=Math.hypot(...a),lb=Math.hypot(...b);
  if(Math.abs(la-lb)>1e-6)continue;
  let angular:Vec3=[0,0,0];
  if(la>1e-8&&lb>1e-8){
   const u=mul(a,1/la),v=mul(b,1/lb),axis=cross(u,v),s=Math.hypot(...axis);
   // An antiparallel discontinuity has no unique axis: omit its rotation.
   if(s>1e-8)angular=limit(mul(axis,Math.atan2(s,dot(u,v))/(s*dt)),HANDOFF_LIMITS.angular);
  }
  const linear=limit(mul(sub(mid(p),mid(before)),1/dt),HANDOFF_LIMITS.linear);
  if([...linear,...angular].every(Number.isFinite))result.push({id:p.id,linear,angular});
 }
 return result;
}
