/** Compact conical height field, matching Lab 04.1's walkable mounds. */
export interface Mound { readonly x:number; readonly z:number; readonly radius:number; readonly height:number }
export function terrainHeight(x:number,z:number,mounds:readonly Mound[]):number{
 let height=0;
 for(const m of mounds){
  const d=Math.hypot(x-m.x,z-m.z);
  if(d<m.radius)height=Math.max(height,m.height*(1-d/m.radius));
 }
 return height;
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export interface BodyRotation { readonly x:number; readonly y:number; readonly z:number; readonly w:number }
/** Vertical half-extent of a Rapier capsule (or sphere when length is zero).
 * Rapier quaternions are unit length and the capsule axis is local Y. */
export function capsuleVerticalHalfExtent(length:number,radius:number,q:BodyRotation):number{
 return radius+length*.5*Math.abs(clamp(1-2*(q.x*q.x+q.z*q.z),-1,1));
}
/** Height is the actual top above the arena floor at conversion, not nominal length.
 * The 1 mm numerical floor only keeps a degenerate cone valid. */
export function moundDimensions(x:number,z:number,length:number,radius:number,centerY:number,q:BodyRotation):Mound{
 return {x:clamp(x,-6.25,6.25),z:clamp(z,-6.25,6.25),
  radius:clamp(length*.65+radius*2.2,.30,.77),height:clamp(centerY+capsuleVerticalHalfExtent(length,radius,q),.001,.30)};
}
