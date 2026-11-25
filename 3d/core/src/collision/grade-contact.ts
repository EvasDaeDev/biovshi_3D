import type {GradeSurface} from '../arena/graded-surface.js';
import type {RigPose} from '../rig/gait.js';
import type {Vec3} from '../types.js';

/** Broad-phase triangle bounds and prepared planes, built once per round. */
export function createGradeContact(surface:GradeSurface){
 const planes=surface.map(triangle=>{
  const [a,b,c]=triangle;
  const ux=b[0]-a[0],uz=b[2]-a[2],vx=c[0]-a[0],vz=c[2]-a[2];
  const det=ux*vz-uz*vx;
  const gx=((b[1]-a[1])*vz-(c[1]-a[1])*uz)/det;
  const gz=(ux*(c[1]-a[1])-vx*(b[1]-a[1]))/det;
  return {
   gx,gz,intercept:a[1]-gx*a[0]-gz*a[2],radiusScale:Math.hypot(1,gx,gz),
   minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),
   minZ:Math.min(a[2],b[2],c[2]),maxZ:Math.max(a[2],b[2],c[2]),
   maxY:Math.max(a[1],b[1],c[1]),
   edges:triangle.map((p,i)=>{
    const q=triangle[(i+1)%3]!;
    const dx=q[0]-p[0],dz=q[2]-p[2],scale=Math.sign(det)/Math.hypot(dx,dz);
    return {x:-dz*scale,z:dx*scale,origin:p};
   }),
  };
 });

 /** Find the common vertical lift without changing joint connections or bone
  * lengths. Clip each capsule axis against the triangle expanded by its
  * radius. Plane support is exact over its interior and conservative at
  * edges. The triangle's maximum height caps the edge correction. */
 return (pose:readonly RigPose[],baseY:number):readonly RigPose[]=>{
  let lift=0;
  for(const {a,b,radius:r} of pose){
   const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
   for(const plane of planes){
    if(Math.min(a[1],b[1])-r>=baseY+plane.maxY||
      Math.max(a[0],b[0])+r<plane.minX||Math.min(a[0],b[0])-r>plane.maxX||
      Math.max(a[2],b[2])+r<plane.minZ||Math.min(a[2],b[2])-r>plane.maxZ)continue;
    let from=0,to=1;
    for(const edge of plane.edges){
     const gap=edge.x*(a[0]-edge.origin[0])+edge.z*(a[2]-edge.origin[2])+r;
     const rate=edge.x*dx+edge.z*dz;
     if(rate>0)from=Math.max(from,-gap/rate);
     else if(rate<0)to=Math.min(to,-gap/rate);
     else if(gap<0){to=-1;break;}
    }
    if(from>to)continue;
    const slope=plane.gx*dx+plane.gz*dz-dy;
    const start=baseY+plane.intercept+plane.gx*a[0]+plane.gz*a[2]-a[1];
    const planeLift=start+plane.radiusScale*r+slope*(slope>0?to:from);
    const heightLift=baseY+plane.maxY+r-a[1]-dy*(dy>0?from:to);
    lift=Math.max(lift,Math.min(planeLift,heightLift));
   }
  }
  if(lift<=1e-8)return pose;
  const raise=([x,y,z]:Vec3):Vec3=>[x,y+lift,z];
  return pose.map(p=>({...p,a:raise(p.a),b:raise(p.b)}));
 };
}
