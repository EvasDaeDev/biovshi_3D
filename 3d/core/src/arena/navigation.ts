import type { Vec3 } from '../types.js';
import type { PointXZ } from '../combat/escape.js';
/** First native arena adapter: opaque, floor-mounted axis-aligned walls.
 * Walkable terrain cones are deliberately NOT included in this list. */
export interface ArenaWall {readonly minX:number;readonly maxX:number;readonly minZ:number;readonly maxZ:number;readonly height:number}
type Box=Omit<ArenaWall,'height'>;
const BOUND=5.65,EPS=1e-7;
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const dist=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
const expand=(b:Box,p:number):Box=>({minX:b.minX-p,maxX:b.maxX+p,minZ:b.minZ-p,maxZ:b.maxZ+p});
const inside=(p:PointXZ,b:Box)=>p.x>b.minX+EPS&&p.x<b.maxX-EPS&&p.z>b.minZ+EPS&&p.z<b.maxZ-EPS;
const corners=(b:Box):PointXZ[]=>[{x:b.minX,z:b.minZ},{x:b.minX,z:b.maxZ},{x:b.maxX,z:b.minZ},{x:b.maxX,z:b.maxZ}];
const bounded=(p:PointXZ)=>Math.abs(p.x)<=BOUND&&Math.abs(p.z)<=BOUND;
const within=(p:PointXZ)=>({x:clamp(p.x,-BOUND,BOUND),z:clamp(p.z,-BOUND,BOUND)});
/** Port v1 rectHit: clip a segment against the obstacle's half-planes.
 * Also used for 3D sight with a vertical slab. */
function clip(a:readonly number[],b:readonly number[],lo:readonly number[],hi:readonly number[]):number|null{
 let enter=0,exit=1;
 for(let i=0;i<a.length;i++){
  const v=b[i]!-a[i]!,s=a[i]!;
  if(Math.abs(v)<EPS){if(s<lo[i]!-EPS||s>hi[i]!+EPS)return null;continue;}
  const x=(lo[i]!-s)/v,y=(hi[i]!-s)/v;
  enter=Math.max(enter,Math.min(x,y));exit=Math.min(exit,Math.max(x,y));
  if(enter>exit+EPS)return null;
 }
 return enter;
}
export function rectHit(a:PointXZ,b:PointXZ,box:Box,pad=0):number|null{
 return clip([a.x,a.z],[b.x,b.z],[box.minX-pad,box.minZ-pad],[box.maxX+pad,box.maxZ+pad]);
}
export function sightClear(a:Vec3,b:Vec3,walls:readonly ArenaWall[]):boolean{
 return walls.every(w=>clip(a,b,[w.minX,0,w.minZ],[w.maxX,w.height,w.maxZ])===null);
}
export function validateWalls(walls:readonly ArenaWall[]):ArenaWall[]{
 if(walls.some(w=>![w.minX,w.maxX,w.minZ,w.maxZ,w.height].every(Number.isFinite)||w.minX>=w.maxX||w.minZ>=w.maxZ||w.height<2.4||w.height>4.3||Math.max(Math.abs(w.minX),Math.abs(w.maxX),Math.abs(w.minZ),Math.abs(w.maxZ))>6.85))throw new RangeError('Invalid opaque arena wall');
 return walls.map(w=>({...w}));
}
const nearestEdge=(p:PointXZ,b:Box):PointXZ=>{
 const options=[{x:b.minX,z:clamp(p.z,b.minZ,b.maxZ)},{x:b.maxX,z:clamp(p.z,b.minZ,b.maxZ)},{x:clamp(p.x,b.minX,b.maxX),z:b.minZ},{x:clamp(p.x,b.minX,b.maxX),z:b.maxZ}];
 return options.reduce((a,v)=>dist(p,v)<dist(p,a)?v:a);
};
const outward=(a:PointXZ,b:PointXZ,wall:Box)=>{const edge=nearestEdge(a,wall);return (b.x-a.x)*(a.x-edge.x)+(b.z-a.z)*(a.z-edge.z)>=-EPS&&!inside(a,wall);};
interface Graph {boxes:readonly Box[];outer:readonly Box[];nodes:readonly PointXZ[];edges:readonly (readonly (number|null)[])[]}
/** Adapt src/systems/navigation.js: cached static corners/edges, dynamic
 * start/goal links, Dijkstra, and a safe exit from an occupied clearance zone. */
export class ArenaNavigation{
 /** v1 P3 standoff; P4 authored polygons may use a narrower but safe graph margin. */
 readonly routePad:number=.65;
 readonly walls:readonly ArenaWall[];
 private cache=new Map<number,Graph>();
 constructor(walls:readonly ArenaWall[]=[]){this.walls=validateWalls(walls);}
 /** Lab AABB rays; P4 authored arenas override with exact convex polygons. */
 sightClear(a:Vec3,b:Vec3):boolean{return sightClear(a,b,this.walls);}
 clear(a:PointXZ,b:PointXZ,pad=0):boolean{return this.walls.every(w=>rectHit(a,b,w,pad)===null);}
 private graph(pad:number):Graph{
  const found=this.cache.get(pad);if(found)return found;
  const boxes=this.walls.map(w=>expand(w,pad)),outer=this.walls.map(w=>expand(w,pad+.05));
  const nodes=outer.flatMap(corners).filter(p=>bounded(p)&&!boxes.some(b=>inside(p,b)));
  const edges=nodes.map((a,i)=>nodes.map((b,j)=>i===j?null:boxes.every(w=>rectHit(a,b,w)===null)?dist(a,b):null));
  const g={boxes,outer,nodes,edges};
  if(this.cache.size>=8)this.cache.delete(this.cache.keys().next().value!);
  this.cache.set(pad,g);return g;
 }
 plan(start:PointXZ,end:PointXZ,pad=.65):readonly PointXZ[]{
  const goal=within(end);
  if(this.clear(start,goal,pad))return [goal];
  const {boxes,outer,nodes:corners,edges}=this.graph(pad);
  let finish=goal;
  if(boxes.some(b=>inside(finish,b))){
   const exits=outer.map(b=>nearestEdge(goal,b)).concat(corners).filter(p=>bounded(p)&&!boxes.some(b=>inside(p,b))).sort((a,b)=>dist(a,goal)-dist(b,goal));
   if(!exits.length)return [{...start}];
   finish=exits[0]!;
  }
  const nodes=[start,finish,...corners],cost=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),used=new Set<number>();
  const link=(a:PointXZ,b:PointXZ)=>boxes.every((box,i)=>{
   if(a===start&&inside(a,box))return outward(a,b,this.walls[i]!)&&this.clear(a,b,.03);
   return rectHit(a,b,box)===null;
  });
  cost[0]=0;
  for(let k=0;k<nodes.length;k++){
   let u=-1;for(let i=0;i<nodes.length;i++)if(!used.has(i)&&(u<0||cost[i]!<cost[u]!))u=i;
   if(u<0||!Number.isFinite(cost[u])||u===1)break;
   used.add(u);
   for(let v=1;v<nodes.length;v++){
    if(u===v||used.has(v))continue;
    const edge=u>=2&&v>=2?edges[u-2]![v-2]!:link(nodes[u]!,nodes[v]!)?dist(nodes[u]!,nodes[v]!):null;
    if(edge!==null&&cost[u]!+edge<cost[v]!){cost[v]=cost[u]!+edge;prev[v]=u;}
   }
  }
  if(!Number.isFinite(cost[1]))return [{...start}];
  const result:PointXZ[]=[];for(let i=1;i>0;i=prev[i]!)result.unshift({...nodes[i]!});
  return result;
 }
 /** Cheap direct sight check, then the already cached v1 visibility graph.
  * A free endpoint across a separating wall is not a usable escape goal.
  * This checks static root reachability, not limb IK or dynamic crowds. */
 reachable(start:PointXZ,end:PointXZ,pad=.65):boolean{
  if(!bounded(end)||!this.clear(end,end,pad))return false;
  if(this.clear(start,end,pad))return true;
  const path=this.plan(start,end,pad),last=path[path.length-1];
  return !!last&&dist(last,end)<1e-6;
 }
 /** Sweep the root footprint against static boxes, preserving exits from
  * a clearance zone; tangential contact is not a wall penetration. */
 private sweep(start:PointXZ,end:PointXZ,pad:number):PointXZ{
  const goal=within(end);let limit=1;
  for(const w of this.walls){
   const box=expand(w,pad);
   if(inside(start,box)&&outward(start,goal,w)&&rectHit(start,goal,w)===null)continue;
   const hit=rectHit(start,goal,box);
   if(hit===null)continue;
   // The v1 surface-contact solver distinguishes overlap from harmless
   // touching. Preserve along-face movement without allowing penetration.
   const inset=EPS*4,inner={minX:box.minX+inset,maxX:box.maxX-inset,minZ:box.minZ+inset,maxZ:box.maxZ-inset};
   if(inner.minX<inner.maxX&&inner.minZ<inner.maxZ&&rectHit(start,goal,inner)===null)continue;
   limit=Math.min(limit,Math.max(0,hit-1e-5));
  }
  return {x:start.x+(goal.x-start.x)*limit,z:start.z+(goal.z-start.z)*limit};
 }
 /** Kinematic root guard: preserve requested travel along the wall tangent
  * after a blocked sweep. Independently sweep each axis; an unobstructed
  * tangent can move, but no candidate can tunnel through a second obstacle. */
 move(start:PointXZ,end:PointXZ,pad=.50):PointXZ{
  const goal=within(end);
  if(!this.walls.length)return goal;
  const first=this.sweep(start,goal,pad);
  if(Math.abs(first.x-goal.x)+Math.abs(first.z-goal.z)<1e-9)return first;
  if(Math.abs(first.x-goal.x)<1e-9)return this.sweep(first,{x:first.x,z:goal.z},pad);
  if(Math.abs(first.z-goal.z)<1e-9)return this.sweep(first,{x:goal.x,z:first.z},pad);
  const x=this.sweep(first,{x:goal.x,z:first.z},pad);
  const z=this.sweep(first,{x:first.x,z:goal.z},pad);
  return (x.x-goal.x)**2+(x.z-goal.z)**2<=(z.x-goal.x)**2+(z.z-goal.z)**2?x:z;
 }
}
export class RouteState{
 private direct:PointXZ|null=null;
 private goal:PointXZ|null=null;private route:PointXZ[]=[];private next=0;private retry=0;
 clear():void{this.direct=null;this.goal=null;this.route=[];this.next=0;this.retry=0;}
 waypoint(nav:ArenaNavigation,start:PointXZ,goal:PointXZ,tick:number,recordDirect=false):PointXZ{
  if(nav.clear(start,goal,nav.routePad)){this.clear();if(recordDirect)this.direct={x:goal.x,z:goal.z};return goal;}
  this.direct=null;
  if(!this.goal||dist(goal,this.goal)>.35||this.next>=this.route.length||tick>=this.retry){
   this.goal={...goal};this.route=[...nav.plan(start,goal,nav.routePad)];this.next=0;this.retry=tick+30;
  }
  while(this.next+1<this.route.length&&dist(start,this.route[this.next]!)<.14&&nav.clear(start,this.route[this.next+1]!,.50))this.next++;
  return this.route[this.next]??start;
 }
 snapshot():readonly PointXZ[]{if(this.direct)return [{...this.direct}];return this.route.slice(this.next).map(p=>({...p}));}
}
