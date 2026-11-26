import type { Vec3,PhysicsSegmentPose } from '../types.js';
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:Vec3):Vec3=>{const n=Math.hypot(...a);return [a[0]/n,a[1]/n,a[2]/n];};
const project=(a:Vec3,b:Vec3):Vec3=>{const d=dot(a,b);return [a[0]-d*b[0],a[1]-d*b[1],a[2]-d*b[2]];};
export interface BoneFrame { readonly center:Vec3; readonly length:number; readonly x:Vec3; readonly y:Vec3; readonly z:Vec3 }
/** Right-handed basis: local +Y follows bone, +Z follows projected forward. */
export function boneFrame(a:Vec3,b:Vec3,forward:Vec3=[0,0,-1]):BoneFrame {
  if(![...a,...b,...forward].every(Number.isFinite))throw new RangeError('Invalid bone frame');
  const delta:Vec3=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],length=Math.hypot(...delta);
  const y:Vec3=length>1e-8?norm(delta):[0,1,0];
  let front=project(forward,y);
  if(dot(front,front)<1e-7)front=project([0,0,-1],y);
  if(dot(front,front)<1e-7)front=project([1,0,0],y);
  const x=norm(cross(y,norm(front))),z=norm(cross(x,y));
  return {center:[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],length,x,y,z};
}

const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mid=(p:PhysicsSegmentPose):Vec3=>[(p.a[0]+p.b[0])*.5,(p.a[1]+p.b[1])*.5,(p.a[2]+p.b[2])*.5];
/** Boxes expose the otherwise invisible axial roll of capsule bones.
 * Anchor the frame to anatomical lateral axes, not to a world-forward
 * projection which becomes singular on a horizontal crawling spine. */
export function anatomicalBoneFrame(p:PhysicsSegmentPose,parts:readonly PhysicsSegmentPose[],yaw:number):BoneFrame{
 const forward:Vec3=[Math.sin(yaw),0,-Math.cos(yaw)];
 const girdle=parts.find(v=>v.id===('upperLeg'===p.id.slice(2)||'lowerLeg'===p.id.slice(2)?'pelvis':'chest'));
 const lateral:Vec3=girdle?norm(sub(girdle.b,girdle.a)):[Math.cos(yaw),0,Math.sin(yaw)];
 const axis=sub(p.b,p.a);
 if(p.id==='chest'||p.id==='pelvis'){
  const abdomen=parts.find(v=>v.id==='abdomen');
  if(abdomen){
   const up=p.id==='chest'?sub(mid(p),abdomen.b):sub(abdomen.a,mid(p));
   const front=cross(up,axis);
   if(dot(front,front)>1e-10)return boneFrame(p.a,p.b,front);
  }
 }
 if(p.id==='abdomen'||p.id==='neck'||/Arm$|Leg$/.test(p.id)){
  // The transverse axis is stable throughout a crawl. If a limb becomes
  // almost exactly lateral, use the torso's dorsal axis instead of a
  // fixed world-axis fallback.
  const reference=cross(lateral,axis);
  if(dot(reference,reference)>1e-8)return boneFrame(p.a,p.b,reference);
  const spine=parts.find(v=>v.id==='abdomen');
  if(spine){const dorsal=cross(lateral,sub(spine.b,spine.a));if(dot(dorsal,dorsal)>1e-8)return boneFrame(p.a,p.b,dorsal);}
 }
 return boneFrame(p.a,p.b,forward);
}
