import type {PhysicsSegmentPose,Vec3} from '../types.js';
export interface HeadFrame {readonly center:Vec3;readonly radius:number;readonly up:Vec3;readonly forward:Vec3;readonly cameraCenter?:Vec3}
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:Vec3,f:Vec3):Vec3=>{const n=Math.hypot(...a);return n>1e-8?[a[0]/n,a[1]/n,a[2]/n]:f;};
const project=(a:Vec3,b:Vec3):Vec3=>{const d=dot(a,b);return [a[0]-d*b[0],a[1]-d*b[1],a[2]-d*b[2]];};
export const HEAD_CAMERA_CLEARANCE=.05;
/** Presentation frame for a spherical head: perception yaw, final neck tilt.
 * Does not alter horizontal P3 perception or the collision geometry. */
export function headFrame(parts:readonly PhysicsSegmentPose[],gazeYaw:number,pitch?:number):HeadFrame|null{
 const h=parts.find(p=>p.id==='head');if(!h)return null;
 const n=parts.find(p=>p.id==='neck');
 const up:Vec3=n?norm([n.b[0]-n.a[0],n.b[1]-n.a[1],n.b[2]-n.a[2]],[0,1,0]):[0,1,0];
 const heading:Vec3=[Math.sin(gazeYaw),0,-Math.cos(gazeYaw)],right:Vec3=[Math.cos(gazeYaw),0,Math.sin(gazeYaw)];
 const lateral=project(right,up);
 const forward=Math.hypot(...lateral)<1e-5?norm(project(heading,up),[0,0,-1]):norm(cross(up,norm(lateral,right)),heading);
 if(pitch!==undefined){
  const aimed:Vec3=[Math.sin(gazeYaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(gazeYaw)*Math.cos(pitch)];
  const crown=norm(project(up,aimed),[-Math.sin(gazeYaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(gazeYaw)*Math.sin(pitch)]);
  return {center:[(h.a[0]+h.b[0])/2,(h.a[1]+h.b[1])/2,(h.a[2]+h.b[2])/2],radius:h.radius,up:crown,forward:aimed};
 }
 return {center:[(h.a[0]+h.b[0])/2,(h.a[1]+h.b[1])/2,(h.a[2]+h.b[2])/2],radius:h.radius,up,forward};
}
/** A virtual mount removes strike-only translation without altering the
 * actual head center, physical rig or original gaze frame. */
export function withCameraMount(frame:HeadFrame|null,unstruck:readonly PhysicsSegmentPose[]):HeadFrame|null{
 if(!frame)return null;
 const head=unstruck.find(p=>p.id==='head');if(!head)return frame;
 return {...frame,cameraCenter:[(head.a[0]+head.b[0])*.5,(head.a[1]+head.b[1])*.5,(head.a[2]+head.b[2])*.5]};
}
export function headCameraPosition(h:HeadFrame):Vec3{
 const d=h.radius+HEAD_CAMERA_CLEARANCE;
 return [h.center[0]+h.up[0]*d,h.center[1]+h.up[1]*d,h.center[2]+h.up[2]*d];
}

/** Centre of the rectilinear GoPro view at the requested distance. The
 * camera removes roll, so its up vector is the projected world vertical. */
export function headAimPoint(frame:HeadFrame,distance:number,clearance=HEAD_CAMERA_CLEARANCE):Vec3{
 const up=norm(project([0,1,0],frame.forward),frame.up);
 const mount=frame.cameraCenter??frame.center;
 return [
  mount[0]+up[0]*(frame.radius+clearance)+frame.forward[0]*distance,
  mount[1]+up[1]*(frame.radius+clearance)+frame.forward[1]*distance,
  mount[2]+up[2]*(frame.radius+clearance)+frame.forward[2]*distance,
 ];
}
