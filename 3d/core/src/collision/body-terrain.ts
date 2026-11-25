import type { PhysicsSegmentPose } from '../types.js';
import type { Mound } from './terrain.js';
/** Up to four walkable cones for a settled body. Anatomical groups are
 * sampled in world coordinates; no sum of overlapping heights. */
export function bodyTerrain(parts:readonly PhysicsSegmentPose[],baseHeight:(x:number,z:number)=>number=()=>0):readonly Mound[]{
 const groups=[
  parts.filter(p=>p.id==='head'||p.id==='neck'),
  parts.filter(p=>p.id==='chest'||p.id==='abdomen'||/\.(upperArm|lowerArm|hand)$/.test(p.id)),
  parts.filter(p=>p.id==='pelvis'||p.id.endsWith('.upperLeg')),
  parts.filter(p=>/\.(lowerLeg|foot)$/.test(p.id))
 ];
 return groups.filter(g=>g.length>0).map(g=>{
  const points=g.flatMap(p=>[{v:p.a,r:p.radius},{v:p.b,r:p.radius}]);
  const x=(Math.min(...points.map(p=>p.v[0]-p.r))+Math.max(...points.map(p=>p.v[0]+p.r)))/2;
  const z=(Math.min(...points.map(p=>p.v[2]-p.r))+Math.max(...points.map(p=>p.v[2]+p.r)))/2;
  const height=Math.max(.001,Math.min(.30,Math.max(...points.map(p=>p.v[1]+p.r-baseHeight(p.v[0],p.v[2])))));
  const radius=Math.max(.35,height*1.8,...points.map(p=>Math.hypot(p.v[0]-x,p.v[2]-z)+p.r+.10));
  return {x,z,radius,height};
 });
}
