import type {PhysicsSegmentPose,Vec3} from '../types.js';
export interface HeadFrame {readonly center:Vec3;readonly radius:number;readonly up:Vec3;readonly forward:Vec3}
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:Vec3,f:Vec3):Vec3=>{const n=Math.hypot(...a);return n>1e-8?[a[0]/n,a[1]/n,a[2]/n]:f;};
const project=(a:Vec3,b:Vec3):Vec3=>{const d=dot(a,b);return [a[0]-d*b[0],a[1]-d*b[1],a[2]-d*b[2]];};
export const HEAD_CAMERA_CLEARANCE=.05;
/** Presentation frame for a spherical head: perception yaw, final neck tilt.
 * Does not alter horizontal P3 perception or the collision geometry. */
export function headFrame(parts:readonly PhysicsSegmentPose[],gazeYaw:number):HeadFrame|null{
 const h=parts.find(p=>p.id==='head');if(!h)return null;
 const n=parts.find(p=>p.id==='neck');
 const up:Vec3=n?norm([n.b[0]-n.a[0],n.b[1]-n.a[1],n.b[2]-n.a[2]],[0,1,0]):[0,1,0];
 const heading:Vec3=[Math.sin(gazeYaw),0,-Math.cos(gazeYaw)],right:Vec3=[Math.cos(gazeYaw),0,Math.sin(gazeYaw)];
 const lateral=project(right,up);
 const forward=Math.hypot(...lateral)<1e-5?norm(project(heading,up),[0,0,-1]):norm(cross(up,norm(lateral,right)),heading);
 return {center:[(h.a[0]+h.b[0])/2,(h.a[1]+h.b[1])/2,(h.a[2]+h.b[2])/2],radius:h.radius,up,forward};
}
export function headCameraPosition(h:HeadFrame):Vec3{
 const d=h.radius+HEAD_CAMERA_CLEARANCE;
 return [h.center[0]+h.up[0]*d,h.center[1]+h.up[1]*d,h.center[2]+h.up[2]*d];
}
