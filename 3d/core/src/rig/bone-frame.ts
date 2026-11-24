import type { Vec3 } from '../types.js';
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
