import type {Vec3} from '../types.js';

/** Native 3D walkable mesh, independent of the original flat 2D location JSON.
 * Triangles are in world metres (X, Y-up, Z), not image/2D coordinates.
 * Validated planar grades provide the SAME heights to IK, Rapier and Three. */
export type GradeTriangle=readonly [Vec3,Vec3,Vec3];
export type GradeSurface=readonly GradeTriangle[];
const MIN_AREA=.004,MAX_GRADE=.55,MAX_HEIGHT=.65,MAX_TRIANGLES=128,BOUND=5.65;
const finite=(n:number)=>Number.isFinite(n);
const edge=(a:Vec3,b:Vec3)=>[b[0]-a[0],b[2]-a[2]] as const;
const det=(a:readonly number[],b:readonly number[])=>a[0]!*b[1]!-a[1]!*b[0]!;
const prepare=(t:GradeTriangle)=>{
 const u=edge(t[0],t[1]),v=edge(t[0],t[2]),d=det(u,v);
 const dy1=t[1][1]-t[0][1],dy2=t[2][1]-t[0][1];
 const gx=(dy1*v[1]-dy2*u[1])/d,gz=(u[0]*dy2-v[0]*dy1)/d;
 return {d,gx,gz};
};
/** Fail closed on invalid/near-vertical geometry; never corrupt a live round. */
export function validateGradeSurface(input:GradeSurface=[]):GradeTriangle[]{
 if(!Array.isArray(input)||input.length>MAX_TRIANGLES)throw new RangeError('Invalid graded surface count');
 return input.map(tri=>{
  if(!Array.isArray(tri)||tri.length!==3||tri.some(p=>!Array.isArray(p)||p.length!==3||
    p.some(v=>!finite(v))||Math.abs(p[0])>BOUND||Math.abs(p[2])>BOUND||p[1]<0||p[1]>MAX_HEIGHT))
   throw new RangeError('Invalid graded surface triangle');
  const copy=tri.map(p=>[p[0],p[1],p[2]] as const) as unknown as GradeTriangle;
  const {d,gx,gz}=prepare(copy);
  if(!finite(d)||Math.abs(d)<MIN_AREA||!finite(gx)||!finite(gz)||Math.hypot(gx,gz)>MAX_GRADE)
   throw new RangeError('Invalid surface incline or triangle area');
  return copy;
 });
}
/** Barycentric sampling of a piecewise-planar walkable incline.
 * These are raised additions to the y=0 base floor, not low debris cones.
 * The highest valid triangle wins if authored surfaces touch or overlap. */
export function gradeHeight(x:number,z:number,triangles:GradeSurface):number{
 let best=0;
 for(const tri of triangles){
  const a=tri[0],u=edge(a,tri[1]),v=edge(a,tri[2]),determinant=det(u,v);
  const px=x-a[0],pz=z-a[2];
  const alpha=(px*v[1]-pz*v[0])/determinant,beta=(u[0]*pz-u[1]*px)/determinant;
  if(alpha>=-1e-9&&beta>=-1e-9&&alpha+beta<=1+1e-9)
   best=Math.max(best,a[1]+alpha*(tri[1][1]-a[1])+beta*(tri[2][1]-a[1]));
 }
 return best;
}
/** A deterministic four-triangle shallow hill. Edges are at y=0 so both
 * feet and ragdolls enter/leave continuously; no invisible cliff. */
export function lowHill(cx=0,cz=0,extent=.8,height=.22):GradeTriangle[]{
 if(![cx,cz,extent,height].every(finite)||extent<=0||height<0)
  throw new RangeError('Invalid low hill');
 const a=[cx-extent,0,cz-extent] as const,b=[cx+extent,0,cz-extent] as const;
 const c=[cx+extent,0,cz+extent] as const,d=[cx-extent,0,cz+extent] as const;
 const top=[cx,height,cz] as const;
 return validateGradeSurface([[a,b,top],[b,c,top],[c,d,top],[d,a,top]]);
}
