import type {ArenaWall} from './navigation.js';
import type {Vec3} from '../types.js';
/** Native metric adapter for validated v1 location-geometry.js data.
 * No DOM, browser fetch or 2D game state crosses into SimulationCore.
 * The first P4 pass keeps an AABB *conservative* navigation proxy; Rapier and
 * Three use the original convex polygon parts and perimeter segments. */
export type FloorPoint=readonly [number,number];
export interface LegacyLocationInput{
 readonly location:{readonly id:string;readonly name:string;readonly capacity:number;
  readonly size?:number;readonly width?:number;readonly height?:number;
  readonly objects:readonly {readonly kind:'wall'|'obstacle';readonly points:readonly FloorPoint[]}[]};
 readonly boundary:readonly FloorPoint[];
 readonly parts:readonly (readonly (readonly FloorPoint[])[])[];
 readonly spawns:readonly FloorPoint[];
 readonly patrol:readonly FloorPoint[];
}
export interface NativePoint{readonly x:number;readonly z:number}
export interface NativePolygon{
 readonly kind:'wall'|'obstacle';
 readonly points:readonly NativePoint[];
 readonly convexParts:readonly (readonly NativePoint[])[];
 readonly height:number;
}
export interface NativeLocation{
 readonly id:string;readonly name:string;readonly capacity:number;
 readonly width:number;readonly depth:number;
 readonly boundary:readonly NativePoint[];
 readonly objects:readonly NativePolygon[];
 readonly walls:readonly ArenaWall[];
 readonly spawns:readonly Vec3[];
 readonly patrol:readonly NativePoint[];
}
const CM=.01,HEIGHT=2.8,BORDER=.20;
const finite=(n:number)=>Number.isFinite(n);
const box=(p:readonly NativePoint[]):ArenaWall=>{
 const x=p.map(v=>v.x),z=p.map(v=>v.z);
 return {minX:Math.min(...x),maxX:Math.max(...x),
  minZ:Math.min(...z),maxZ:Math.max(...z),height:HEIGHT};
};
/** v1 calls parseLocation/convexParts at the build boundary. This function
 * never silently expands unsupported >11 m arenas beyond the 3D root guard. */
export function adaptLegacyLocation(data:LegacyLocationInput):NativeLocation{
 const l=data.location,w=(l.width??l.size)!*CM,d=(l.height??l.size)!*CM;
 if(!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(l.id)||!finite(w)||!finite(d)||w<3||d<3||
  w>11||d>11||!Number.isInteger(l.capacity)||l.capacity<2||l.capacity>10||
  l.objects.length!==data.parts.length||data.boundary.length<3||
  data.spawns.length<2||!l.name)throw new RangeError('Unsupported native location');
 const p=([x,z]:FloorPoint):NativePoint=>{
  if(!finite(x)||!finite(z)||x<0||z<0||x>w/CM||z>d/CM)throw new RangeError('Invalid native location point');
  return {x:x*CM-w/2,z:z*CM-d/2};
 };
 const boundary=data.boundary.map(p);
 const objects=l.objects.map((o,i):NativePolygon=>{
  const parts=data.parts[i]!;
  if(o.points.length<3||!parts.length||parts.some(part=>part.length<3))
   throw new RangeError('Invalid convex location parts');
  return {kind:o.kind,points:o.points.map(p),convexParts:parts.map(part=>part.map(p)),height:HEIGHT};
 });
 // P3 has only slab/AABB pathfinding; keep the proxy explicit, NOT polygon
 // collision. Exact shapes remain in the renderer and static Rapier world.
 const walls=objects.flatMap(o=>o.convexParts.map(box));
 const halfX=w/2,halfZ=d/2,t=BORDER;
 walls.push(
  {minX:-halfX-t,maxX:-halfX,minZ:-halfZ-t,maxZ:halfZ+t,height:HEIGHT},
  {minX:halfX,maxX:halfX+t,minZ:-halfZ-t,maxZ:halfZ+t,height:HEIGHT},
  {minX:-halfX-t,maxX:halfX+t,minZ:-halfZ-t,maxZ:-halfZ,height:HEIGHT},
  {minX:-halfX-t,maxX:halfX+t,minZ:halfZ,maxZ:halfZ+t,height:HEIGHT},
 );
 return {id:l.id,name:l.name,capacity:l.capacity,width:w,depth:d,boundary,objects,walls,
  spawns:data.spawns.map(pt=>{const v=p(pt);return [v.x,0,v.z] as const;}),
  patrol:data.patrol.map(p)};
}
