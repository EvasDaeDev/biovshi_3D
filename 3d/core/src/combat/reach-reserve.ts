import type {PhysicsSegmentPose,Vec3} from '../types.js';

const USABLE_FRACTION=.92;

/** Widen the horizontal gap for a second contact check. The existing
 * thrust sweep still measures the actual source and governs live damage. */
export function reserveTarget(pose:readonly PhysicsSegmentPose[],victim:readonly PhysicsSegmentPose[]):readonly PhysicsSegmentPose[]{
 const anchor=(parts:readonly PhysicsSegmentPose[])=>parts.find(p=>p.id==='pelvis')??parts.find(p=>p.id==='chest')??parts[0];
 const a=anchor(pose),b=anchor(victim);
 if(!a||!b)return victim;
 const margin=(1/USABLE_FRACTION-1)*.5;
 const x=(b.a[0]+b.b[0]-a.a[0]-a.b[0])*margin;
 const z=(b.a[2]+b.b[2]-a.a[2]-a.b[2])*margin;
 const move=(p:Vec3):Vec3=>[p[0]+x,p[1],p[2]+z];
 return victim.map(p=>({...p,a:move(p.a),b:move(p.b)}));
}
