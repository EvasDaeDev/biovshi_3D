import type {Vec3} from '../types.js';
import type {RigPose} from '../rig/gait.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export function fallEase(amount:number):number{
 const t=Math.max(0,Math.min(1,amount));return t*t*(3-2*t);
}
/** Snapshot the evaluated rig and foot anchors before the temporary fall.
 * Root-relative geometry follows collision corrections without teleporting
 * to a newly constructed idle pose. All queries are pure. */
export class KnockdownMotion{
 private readonly start:readonly RigPose[];
 private readonly feet:readonly Vec3[];
 constructor(root:Vec3,pose:readonly RigPose[],feet:readonly Vec3[]){
  this.start=pose.map(p=>({...p,a:sub(p.a,root),b:sub(p.b,root)}));
  this.feet=feet.map(p=>[...p] as Vec3);
 }
 source(root:Vec3):readonly RigPose[]{return this.start.map(p=>({...p,a:add(root,p.a),b:add(root,p.b)}));}
 foot(index:number,target:Vec3,amount:number):Vec3{
  const p=this.feet[index]!,t=fallEase(Math.min(1,amount*1.5));
  return [p[0]+(target[0]-p[0])*t,p[1]+(target[1]-p[1])*t,p[2]+(target[2]-p[2])*t];
 }
}
