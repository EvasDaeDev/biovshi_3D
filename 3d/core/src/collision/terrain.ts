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
export function moundDimensions(x:number,z:number,length:number,radius:number):Mound{
 return {x:clamp(x,-6.25,6.25),z:clamp(z,-6.25,6.25),
  radius:clamp(length*.65+radius*2.2,.30,.77),height:clamp(radius*2+length*.18,.08,.30)};
}
