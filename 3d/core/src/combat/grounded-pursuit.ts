import type {PhysicsSegmentPose} from '../types.js';
import type {PointXZ} from './escape.js';
/** Nearest actual visible capsule centerline in the horizontal plane.
 * The crawling body extends well ahead of its root; chasing that root
 * alone repeatedly sends the attacker behind the victim. */
export function groundedContactPoint(here:PointXZ,parts:readonly PhysicsSegmentPose[],fallback:PointXZ):PointXZ{
 let best:PointXZ=fallback,score=Infinity;
 for(const p of parts){
  const dx=p.b[0]-p.a[0],dz=p.b[2]-p.a[2],n=dx*dx+dz*dz;
  const t=n>1e-10?Math.max(0,Math.min(1,((here.x-p.a[0])*dx+(here.z-p.a[2])*dz)/n)):0;
  const point={x:p.a[0]+dx*t,z:p.a[2]+dz*t};
  const d=Math.hypot(here.x-point.x,here.z-point.z);
  // Mild preference for core/arm contacts, not a mandatory rear flank.
  const value=d-(p.id==='head'||p.id==='chest'||p.id==='abdomen'?.06:0);
  if(value<score){score=value;best=point;}
 }
 return best;
}
