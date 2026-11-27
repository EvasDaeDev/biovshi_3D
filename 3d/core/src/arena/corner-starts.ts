import type { NativeLocation,NativePoint } from './location-adapter.js';
import { PolygonNavigation } from './polygon-navigation.js';
import type { Vec3 } from '../types.js';

const CORNERS=[[1,1],[-1,-1],[-1,1],[1,-1]] as const;
const STEP=.25,CLEARANCE=.65,MIN_GAP=1;
const distance=(a:NativePoint,b:NativePoint)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Build metric starts once in the catalog. Shapes with bevels or statues
 * use the closest clear floor to each nominal corner. Extra slots spread
 * over the remaining floor, so every participant count uses a useful prefix. */
export function cornerStartSlots(location:NativeLocation):readonly Vec3[]{
 const nav=new PolygonNavigation(location),width=location.width/2,depth=location.depth/2;
 const candidates:NativePoint[]=[];
 for(let x=0;x<=width-CLEARANCE;x+=STEP)for(let z=0;z<=depth-CLEARANCE;z+=STEP){
  for(const [sx,sz] of CORNERS){
   const point={x:sx*x,z:sz*z};
   if(nav.clear(point,point,CLEARANCE))candidates.push(point);
  }
 }
 const selected:NativePoint[]=[];
 const reserve=(point:NativePoint)=>Math.min(...selected.map(other=>distance(point,other)));
 const choose=(score:(point:NativePoint)=>number)=>{
  let best:NativePoint|undefined,rating=-Infinity;
  for(const point of candidates){
   const value=score(point);
   if(value>rating&&reserve(point)>=MIN_GAP){best=point;rating=value;}
  }
  if(best)selected.push(best);
 };
 for(const [sx,sz] of CORNERS.slice(0,location.capacity)){
  const target={x:sx*width,z:sz*depth};
  choose(point=>-distance(point,target));
 }
 while(selected.length<location.capacity){
  const count=selected.length;
  choose(reserve);
  if(selected.length===count)return location.spawnSlots;
 }
 return selected.map(({x,z})=>[x,0,z]);
}
