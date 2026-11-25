import type {GradeSurface} from '../arena/graded-surface.js';
import type {RigPose} from '../rig/gait.js';
import type {Vec3} from '../types.js';

const EPS=1e-10;
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];

/** Highest point of the radius-r envelope of a segment on the vertical
 * line through the origin. Returns -Infinity when the line misses. */
function edgeLift(a:Vec3,d:Vec3,r:number):number{
 const run=Math.hypot(d[0],d[2]);
 if(run<EPS){
  const reach=r*r-a[0]*a[0]-a[2]*a[2];
  return reach>=0?a[1]+Math.max(0,d[1])+Math.sqrt(reach):-Infinity;
 }
 const offset=(a[0]*d[0]+a[2]*d[2])/run;
 const gap=(a[0]*d[2]-a[2]*d[0])/run;
 const reach=r*r-gap*gap;
 if(reach<0)return -Infinity;
 const cap=Math.sqrt(reach),from=Math.max(0,(-cap-offset)/run),to=Math.min(1,(cap-offset)/run);
 if(from>to)return -Infinity;
 const best=(cap*d[1]/Math.hypot(run,d[1])-offset)/run;
 const t=Math.max(from,Math.min(to,best)),along=offset+t*run;
 return a[1]+t*d[1]+Math.sqrt(Math.max(0,reach-along*along));
}

/** Interior maximum on a parallelogram. Its boundary is checked via edgeLift. */
function faceLift(a:Vec3,u:Vec3,v:Vec3,r:number):number{
 const det=u[0]*v[2]-v[0]*u[2];
 if(Math.abs(det)<EPS)return -Infinity;
 const gx=(u[1]*v[2]-v[1]*u[2])/det,gz=(u[0]*v[1]-v[0]*u[1])/det;
 const scale=Math.hypot(1,gx,gz);
 const x=r*gx/scale-a[0],z=r*gz/scale-a[2];
 const s=(x*v[2]-z*v[0])/det,t=(u[0]*z-u[2]*x)/det;
 return s>=0&&s<=1&&t>=0&&t<=1?a[1]+gx*x+gz*z+r/scale:-Infinity;
}

export function createGradeContact(surface:GradeSurface){
 const planes=surface.map(triangle=>{
  const [a,b,c]=triangle,u=sub(b,a),v=sub(c,a);
  const det=u[0]*v[2]-u[2]*v[0];
  const gx=(u[1]*v[2]-v[1]*u[2])/det,gz=(u[0]*v[1]-v[0]*u[1])/det;
  return {
   gx,gz,intercept:a[1]-gx*a[0]-gz*a[2],scale:Math.hypot(1,gx,gz),
   minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),
   minZ:Math.min(a[2],b[2],c[2]),maxZ:Math.max(a[2],b[2],c[2]),
   maxY:Math.max(a[1],b[1],c[1]),
   edges:triangle.map((origin,i)=>{
    const delta=sub(triangle[(i+1)%3]!,origin);
    const inward=Math.sign(det)/Math.hypot(delta[0],delta[2]);
    return {origin,delta,x:-delta[2]*inward,z:delta[0]*inward};
   }),
  };
 });

 /** A sphere swept over the capsule axis touches the triangle where the
  * triangle minus the axis, expanded by the sphere, meets the vertical
  * line through the origin. Check the triangle interior, then the swept
  * edges and their boundaries. Lift the connected rig without stretching it. */
 return (pose:readonly RigPose[],baseY:number):readonly RigPose[]=>{
  let lift=0;
  for(const {a,b,radius:r} of pose){
   const reverse=sub(a,b),[dx,dy,dz]=reverse;
   for(const plane of planes){
    if(baseY+plane.maxY+r-Math.min(a[1],b[1])<=lift||
      Math.max(a[0],b[0])+r<plane.minX||Math.min(a[0],b[0])-r>plane.maxX||
      Math.max(a[2],b[2])+r<plane.minZ||Math.min(a[2],b[2])-r>plane.maxZ)continue;
    const upper=baseY+plane.intercept+r*plane.scale+
     Math.max(plane.gx*a[0]+plane.gz*a[2]-a[1],plane.gx*b[0]+plane.gz*b[2]-b[1]);
    if(upper<=lift)continue;
    const x=b[0]+r*plane.gx/plane.scale,z=b[2]+r*plane.gz/plane.scale;
    let from=0,to=1;
    for(const edge of plane.edges){
     const gap=edge.x*(x-edge.origin[0])+edge.z*(z-edge.origin[2]);
     const rate=edge.x*dx+edge.z*dz;
     if(rate>EPS)from=Math.max(from,-gap/rate);
     else if(rate<-EPS)to=Math.min(to,-gap/rate);
     else if(gap<-EPS){to=-1;break;}
    }
    if(from<=to){
     const slope=plane.gx*dx+plane.gz*dz-dy;
     const start=baseY+plane.intercept+r*plane.scale+plane.gx*b[0]+plane.gz*b[2]-b[1];
     lift=Math.max(lift,start+slope*(slope>0?to:from));
    }
    if(upper<=lift+EPS)continue;
    for(const {origin,delta} of plane.edges){
     const p:Vec3=[origin[0]-a[0],baseY+origin[1]-a[1],origin[2]-a[2]];
     const q:Vec3=[p[0]+dx,p[1]+dy,p[2]+dz];
     lift=Math.max(lift,faceLift(p,delta,reverse,r),edgeLift(p,delta,r),
      edgeLift(q,delta,r),edgeLift(p,reverse,r));
    }
   }
  }
  if(lift<=EPS)return pose;
  const raise=([x,y,z]:Vec3):Vec3=>[x,y+lift,z];
  return pose.map(p=>({...p,a:raise(p.a),b:raise(p.b)}));
 };
}
