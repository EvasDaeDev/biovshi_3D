import type {Vec3} from '../types.js';
import type {PointXZ} from '../combat/escape.js';
import {ArenaNavigation} from './navigation.js';
import type {NativeLocation,NativePoint} from './location-adapter.js';

/** Adapt the existing v1 polygonPlanes/rectHit/expandedObstacle and
 * navigationGraph to a metric, rounded-footprint root. Exact convex pieces
 * are the same ones as the Three/Rapier authored-location adapter. */
const EPS=1e-8;
const dist=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
const dot=(a:PointXZ,b:PointXZ)=>a.x*b.x+a.z*b.z;
const sub=(a:PointXZ,b:PointXZ):NativePoint=>({x:a.x-b.x,z:a.z-b.z});
const cross=(a:PointXZ,b:PointXZ)=>a.x*b.z-a.z*b.x;
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const side=(a:PointXZ,b:PointXZ,p:PointXZ)=>cross(sub(b,a),sub(p,a));
const polygonInside=(poly:readonly NativePoint[],p:PointXZ)=>poly.every((v,i)=>side(v,poly[(i+1)%poly.length]!,p)>=-EPS);
function closest(p:PointXZ,a:PointXZ,b:PointXZ):NativePoint{
 const e=sub(b,a),d=dot(e,e),t=d>EPS?clamp(dot(sub(p,a),e)/d,0,1):0;
 return {x:a.x+e.x*t,z:a.z+e.z*t};
}
function edgeDistance(p:PointXZ,poly:readonly NativePoint[]):{point:NativePoint;gap:number;tangent:NativePoint}{
 let gap=Infinity,point:NativePoint={x:0,z:0},tangent:NativePoint={x:1,z:0};
 for(let i=0;i<poly.length;i++){
  const a=poly[i]!,b=poly[(i+1)%poly.length]!,q=closest(p,a,b),d=dist(p,q);
  if(d<gap){gap=d;point=q;const length=dist(a,b)||1;tangent={x:(b.x-a.x)/length,z:(b.z-a.z)/length};}
 }
 return {point,gap,tangent};
}
/** Earliest hit of a moving point against a rounded line segment. Unlike
 * extending polygon planes, this doesn't fill in fake square corners. */
function edgeCapsuleHit(start:PointXZ,end:PointXZ,a:PointXZ,b:PointXZ,pad:number):number|null{
 const movement=sub(end,start),edge=sub(b,a),e2=dot(edge,edge),m2=dot(movement,movement);
 if(e2<EPS||m2<EPS)return dist(start,closest(start,a,b))<=pad?0:null;
 if(dist(start,closest(start,a,b))<pad-EPS)return 0;
 let hit=Infinity;
 const n=cross(edge,movement),base=cross(edge,sub(start,a)),len=Math.sqrt(e2);
 if(Math.abs(n)>EPS){
  for(const sign of [-1,1]){
   const t=(sign*pad*len-base)/n;
   if(t<-EPS||t>1+EPS)continue;
   const p={x:start.x+movement.x*t,z:start.z+movement.z*t};
   const u=dot(sub(p,a),edge)/e2;
   if(u>=-EPS&&u<=1+EPS)hit=Math.min(hit,clamp(t,0,1));
  }
 }
 for(const p of [a,b]){
  const delta=sub(start,p),b2=dot(delta,movement),c=dot(delta,delta)-pad*pad;
  const discriminant=b2*b2-m2*c;
  if(discriminant<-EPS)continue;
  const t=(-b2-Math.sqrt(Math.max(0,discriminant)))/m2;
  if(t>=-EPS&&t<=1+EPS)hit=Math.min(hit,clamp(t,0,1));
 }
 return Number.isFinite(hit)?hit:null;
}
function polygonHit(start:PointXZ,end:PointXZ,poly:readonly NativePoint[],pad:number):number|null{
 if(polygonInside(poly,start))return 0;
 let hit=Infinity;
 for(let i=0;i<poly.length;i++){
  const t=edgeCapsuleHit(start,end,poly[i]!,poly[(i+1)%poly.length]!,pad);
  if(t!==null)hit=Math.min(hit,t);
 }
 return Number.isFinite(hit)?hit:null;
}
function expandedVertex(poly:readonly NativePoint[],i:number,pad:number):NativePoint|null{
 const a=poly[(i-1+poly.length)%poly.length]!,b=poly[i]!,c=poly[(i+1)%poly.length]!;
 const prev=sub(b,a),next=sub(c,b),l=Math.hypot(prev.x,prev.z),r=Math.hypot(next.x,next.z);
 if(l<EPS||r<EPS)return null;
 const p={x:prev.z/l,z:-prev.x/l},n={x:next.z/r,z:-next.x/r};
 const sum={x:p.x+n.x,z:p.z+n.z},length=Math.hypot(sum.x,sum.z);
 if(length<EPS)return null;
 const bisector={x:sum.x/length,z:sum.z/length},d=dot(bisector,p);
 if(d<.05)return null;
 const offset=(pad+.06)/d;
 return {x:b.x+bisector.x*offset,z:b.z+bisector.z*offset};
}
type StaticGraph={readonly nodes:readonly NativePoint[];readonly edges:readonly (readonly (number|null)[])[]};
export class PolygonNavigation extends ArenaNavigation{
 readonly location:NativeLocation;
 private readonly shapes:readonly (readonly NativePoint[])[];
 private readonly perimeter:readonly NativePoint[];
 private readonly heights:readonly number[];
 private readonly cached=new Map<number,StaticGraph>();
 constructor(location:NativeLocation){
  super(location.walls);this.location=location;
  this.shapes=location.objects.flatMap(o=>o.convexParts.map(poly=>poly.map(p=>({...p}))));
  this.perimeter=location.boundary.map(p=>({...p}));
  this.heights=location.objects.flatMap(o=>o.convexParts.map(()=>o.height));
 }
 private boundaryClear(p:PointXZ,pad:number):boolean{
  return this.perimeter.every((a,i)=>{
   const b=this.perimeter[(i+1)%this.perimeter.length]!;
   return side(a,b,p)>=pad*dist(a,b)-EPS;
  });
 }
 private pointClear(p:PointXZ,pad:number):boolean{
  return this.boundaryClear(p,pad)&&this.shapes.every(poly=>!polygonInside(poly,p)&&edgeDistance(p,poly).gap>=pad-EPS);
 }
 override clear(a:PointXZ,b:PointXZ,pad=0):boolean{
  if(!this.boundaryClear(a,pad)||!this.boundaryClear(b,pad))return false;
  return this.shapes.every(poly=>polygonHit(a,b,poly,pad)===null);
 }
 /** Height-gated polygon sight through the same source obstacle hulls. */
 sightClear(a:Vec3,b:Vec3):boolean{
  return this.shapes.every((poly,i)=>{
   const h=this.heights[i]!;
   if(Math.min(a[1],b[1])>h)return true;
   return polygonHit({x:a[0],z:a[2]},{x:b[0],z:b[2]},poly,0)===null;
  });
 }
 /** Port the v1/ArenaNavigation occupied-clearance goal fallback to
  * convex authored geometry. A patient may stand at the *physical* .50 m
  * root clearance while route graph nodes use .65 m. Approach the nearest
  * safe point instead of returning [start] and staring at a wall.
  * Never invent a passage through an obstacle or change reachable() for
  * tactical escape goals, which must genuinely be reachable. */
 private approachGoal(goal:PointXZ,pad:number):NativePoint|null{
  if(this.pointClear(goal,pad))return {...goal};
  if(!this.boundaryClear(goal,0)||this.shapes.some(poly=>polygonInside(poly,goal)))return null;
  const q:{x:number;z:number}={...goal},clearance=pad+.025;
  for(let attempt=0;attempt<12;attempt++){
   let changed=false;
   for(let i=0;i<this.perimeter.length;i++){
    const a=this.perimeter[i]!,b=this.perimeter[(i+1)%this.perimeter.length]!;
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),distance=side(a,b,q)/length;
    if(distance>=clearance)continue;
    const delta=clearance-distance;
    q.x+=-dz/length*delta;q.z+=dx/length*delta;changed=true;
   }
   for(const poly of this.shapes){
    if(polygonInside(poly,q))return null;
    const {point,gap}=edgeDistance(q,poly);
    if(gap>=clearance)continue;
    if(gap<EPS)return null;
    const delta=(clearance-gap)/gap;
    q.x+=(q.x-point.x)*delta;q.z+=(q.z-point.z)*delta;changed=true;
   }
   if(this.pointClear(q,pad)&&this.clear(goal,q,.03))return {...q};
   if(!changed)break;
  }
  return null;
 }
 private polygonGraph(pad:number):StaticGraph{
  const cached=this.cached.get(pad);if(cached)return cached;
  const nodes=this.shapes.flatMap(poly=>poly.flatMap((_,i)=>{const p=expandedVertex(poly,i,pad);return p&&this.pointClear(p,pad)?[p]:[]}));
  const edges=nodes.map((a,i)=>nodes.map((b,j)=>i===j?null:this.clear(a,b,pad)?dist(a,b):null));
  const g={nodes,edges};if(this.cached.size>=8)this.cached.delete(this.cached.keys().next().value!);
  this.cached.set(pad,g);return g;
 }
 override plan(start:PointXZ,end:PointXZ,pad=.65):readonly NativePoint[]{
  if(this.clear(start,end,pad))return [{...end}];
  const finish=this.approachGoal(end,pad);
  if(!finish)return [{...start}];
  const {nodes:corners,edges}=this.polygonGraph(pad);
  const nodes=[start,finish,...corners],cost=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),used=new Set<number>();
  const link=(a:PointXZ,b:PointXZ)=>this.clear(a,b,pad)||
   (a===start&&!this.pointClear(a,pad)&&this.clear(a,b,.03)&&this.pointClear(b,pad));
  cost[0]=0;
  for(let k=0;k<nodes.length;k++){
   let u=-1;for(let i=0;i<nodes.length;i++)if(!used.has(i)&&(u<0||cost[i]!<cost[u]!))u=i;
   if(u<0||!Number.isFinite(cost[u])||u===1)break;
   used.add(u);
   for(let v=1;v<nodes.length;v++){
    if(v===u||used.has(v))continue;
    const d=u>=2&&v>=2?edges[u-2]![v-2]!:link(nodes[u]!,nodes[v]!)?dist(nodes[u]!,nodes[v]!):null;
    if(d!==null&&cost[u]!+d<cost[v]!){cost[v]=cost[u]!+d;previous[v]=u;}
   }
  }
  if(!Number.isFinite(cost[1]))return [{...start}];
  const result:NativePoint[]=[];
  for(let i=1;i>0;i=previous[i]!)result.unshift({...nodes[i]!});
  return result;
 }
 override reachable(start:PointXZ,end:PointXZ,pad=.65):boolean{
  if(!this.pointClear(end,pad))return false;
  if(this.clear(start,end,pad))return true;
  const path=this.plan(start,end,pad);
  return path.length>0&&dist(path[path.length-1]!,end)<1e-6;
 }
 private swept(start:PointXZ,end:PointXZ,pad:number):NativePoint{
  let t=1;
  for(const poly of this.shapes){
   const gap=edgeDistance(start,poly).gap,inside=polygonInside(poly,start);
   if(!inside&&gap<=pad+EPS&&gap>EPS){
    const nearest=edgeDistance(start,poly).point,away=sub(start,nearest),movement=sub(end,start);
    if(dot(away,movement)>=-EPS&&polygonHit(start,end,poly,0)===null)continue;
   }
   const hit=polygonHit(start,end,poly,pad);
   if(hit!==null)t=Math.min(t,Math.max(0,hit-1e-5));
  }
  for(let i=0;i<this.perimeter.length;i++){
   const a=this.perimeter[i]!,b=this.perimeter[(i+1)%this.perimeter.length]!;
   const edge=sub(b,a),len=Math.hypot(edge.x,edge.z),d0=side(a,b,start)/len,d1=side(a,b,end)/len;
   if(d1<pad&&d1<d0-EPS){
    const u=(pad-d0)/(d1-d0);
    t=Math.min(t,clamp(u-1e-5,0,1));
   }
  }
  return {x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t};
 }
 override move(start:PointXZ,end:PointXZ,pad=.50):NativePoint{
  const first=this.swept(start,end,pad);
  if(dist(first,end)<1e-8)return first;
  const residual=sub(end,first),candidates:NativePoint[]=[first];
  let tangent:NativePoint|null=null,min=Infinity;
  for(const poly of this.shapes){
   const edge=edgeDistance(first,poly);
   if(edge.gap<min){min=edge.gap;tangent=edge.tangent;}
  }
  for(let i=0;i<this.perimeter.length;i++){
   const a=this.perimeter[i]!,b=this.perimeter[(i+1)%this.perimeter.length]!,d=edgeDistance(first,[a,b]);
   if(d.gap<min){min=d.gap;tangent=d.tangent;}
  }
  if(tangent){
   const along=dot(residual,tangent),goal={x:first.x+tangent.x*along,z:first.z+tangent.z*along};
   candidates.push(this.swept(first,goal,pad));
  }
  candidates.push(this.swept(first,{x:end.x,z:first.z},pad));
  candidates.push(this.swept(first,{x:first.x,z:end.z},pad));
  return candidates.reduce((best,p)=>dist(p,end)<dist(best,end)?p:best,first);
 }
}
