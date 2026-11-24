import type { Vec3 } from '../types.js';
import type { RigPose } from './gait.js';
export type PointXZ=readonly [number,number];
export interface GroundContact { readonly segmentId:string; readonly point:Vec3; readonly clearance:number }
export interface SupportState {
 readonly centerOfMass:Vec3|null;
 readonly contacts:readonly GroundContact[];
 /** Convex hull of estimated finite contact patches, projected onto XZ. */
 readonly hull:readonly PointXZ[];
 /** Positive inside, negative outside, null without ground support. */
 readonly margin:number|null;
 readonly correction:PointXZ;
}
const CONTACT_TOLERANCE=.025;
const cross=(a:PointXZ,b:PointXZ,c:PointXZ)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function convexHull(points:PointXZ[]):PointXZ[]{
 const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const unique=sorted.filter((p,i)=>i===0||p[0]!==sorted[i-1]![0]||p[1]!==sorted[i-1]![1]);
 if(unique.length<3)return unique;
 const half=(list:PointXZ[])=>{const h:PointXZ[]=[];for(const p of list){while(h.length>1&&cross(h[h.length-2]!,h[h.length-1]!,p)<=0)h.pop();h.push(p);}return h;};
 const low=half(unique),high=half([...unique].reverse());low.pop();high.pop();return low.concat(high);
}
function closest(p:PointXZ,a:PointXZ,b:PointXZ):PointXZ{
 const x=b[0]-a[0],z=b[1]-a[1],l=x*x+z*z;
 const t=l>0?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*z)/l)):0;
 return [a[0]+x*t,a[1]+z*t];
}
/** Geometry-only estimate. Uniform density, actual capsule dimensions, no
 * detached parts. Ground contact uses three axis samples (one for spheres).
 * The finite contact patch is a tolerance-based approximation, not pressure. */
export function analyzeSupport(parts:readonly RigPose[],ground:(x:number,z:number)=>number,eligible?:ReadonlySet<string>):SupportState{
 let mass=0,x=0,y=0,z=0;
 const contacts:GroundContact[]=[],patch:PointXZ[]=[];
 for(const p of parts){
  const r=p.radius,dx=p.b[0]-p.a[0],dy=p.b[1]-p.a[1],dz=p.b[2]-p.a[2],length=Math.hypot(dx,dy,dz);
  const weight=r*r*length+4*r*r*r/3;
  mass+=weight;x+=(p.a[0]+dx/2)*weight;y+=(p.a[1]+dy/2)*weight;z+=(p.a[2]+dz/2)*weight;
  if(eligible&&!eligible.has(p.id))continue;
  for(const t of length>1e-9?[0,.5,1]:[0]){
   const px=p.a[0]+dx*t,py=p.a[1]+dy*t,pz=p.a[2]+dz*t,g=ground(px,pz),clearance=py-r-g;
   if(clearance>CONTACT_TOLERANCE)continue;
   contacts.push({segmentId:p.id,point:[px,g,pz],clearance});
   const depth=Math.min(r,Math.max(.001,CONTACT_TOLERANCE-Math.max(0,clearance)));
   const reach=Math.sqrt(Math.max(0,2*r*depth-depth*depth));
   for(const [u,v] of [[1,0],[0,1],[-1,0],[0,-1]] as const)patch.push([px+u*reach,pz+v*reach]);
  }
 }
 const centerOfMass:Vec3|null=mass>0?[x/mass,y/mass,z/mass]:null,hull=convexHull(patch);
 if(!centerOfMass||!hull.length)return {centerOfMass,contacts,hull,margin:null,correction:[0,0]};
 const p:PointXZ=[centerOfMass[0],centerOfMass[2]];
 let inside=hull.length>=3,best:PointXZ=hull[0]!,distance=Infinity;
 for(let i=0;i<hull.length;i++){
  const a=hull[i]!,b=hull[(i+1)%hull.length]!;
  if(cross(a,b,p)<-1e-10)inside=false;
  const q=closest(p,a,b),d=Math.hypot(q[0]-p[0],q[1]-p[1]);
  if(d<distance){distance=d;best=q;}
 }
 return {centerOfMass,contacts,hull,margin:inside?distance:-distance,correction:inside?[0,0]:[best[0]-p[0],best[1]-p[1]]};
}
