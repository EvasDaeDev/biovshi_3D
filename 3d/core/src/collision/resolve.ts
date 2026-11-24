import type { Vec3 } from '../types.js';
import { capsuleContact, type Capsule } from './capsule-contact.js';
import type { RigPose } from '../rig/gait.js';
export interface CollisionActor { readonly id:number; x:number; y:number; z:number }
export interface CollisionStats { tests:number; contacts:number; wallContacts:number }
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const point=(p:Vec3)=>({x:p[0],y:p[1],z:p[2]});
function prepare(p:RigPose){
 const cap:Capsule={a:point(p.a),b:point(p.b),r:p.radius};
 return {cap,x:(p.a[0]+p.b[0])*.5,z:(p.a[2]+p.b[2])*.5,r:Math.hypot(p.a[0]-p.b[0],p.a[1]-p.b[1],p.a[2]-p.b[2])*.5+p.radius};
}
/** Three bounded passes. Pose callback must be pure; never advances gait.
 * Rebuild after root corrections; planted feet stay in world coordinates. */
export function resolveCollisions<T extends CollisionActor>(actors:readonly T[],pose:(a:T)=>readonly RigPose[]):CollisionStats{
 const stats:CollisionStats={tests:0,contacts:0,wallContacts:0};
 const move=(a:T,x:number,z:number)=>{a.x=clamp(a.x+clamp(x,-.10,.10),-5.65,5.65);a.z=clamp(a.z+clamp(z,-.10,.10),-5.65,5.65);};
 for(let iteration=0;iteration<3;iteration++){
  const shapes=actors.map(a=>{
   const parts=pose(a);let x=0,z=0;
   for(const p of parts)for(const end of [p.a,p.b]){
    const inner=6.95-1.47*clamp(end[1],0,4.3)/4.3-p.radius-.08;
    if(end[0]>inner)x=Math.min(x,inner-end[0]);
    if(end[0]<-inner)x=Math.max(x,-inner-end[0]);
    if(end[2]>inner)z=Math.min(z,inner-end[2]);
    if(end[2]<-inner)z=Math.max(z,-inner-end[2]);
   }
   if(x||z){move(a,x,z);stats.wallContacts++;return pose(a).map(prepare);}
   return parts.map(prepare);
  });
  for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
   const a=actors[i]!,b=actors[j]!;
   if((a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2>4.7**2)continue;
   let cx=0,cz=0,count=0;
   for(const ac of shapes[i]!)for(const bc of shapes[j]!){
    if((ac.x-bc.x)**2+(ac.z-bc.z)**2>(ac.r+bc.r)**2)continue;
    stats.tests++;const c=capsuleContact(ac.cap,bc.cap);if(!c)continue;stats.contacts++;
    let nx=c.dx,nz=c.dz,len=Math.hypot(nx,nz);
    if(c.dist>1e-5&&len/c.dist<.23)continue;
    if(len<1e-5){nx=a.x-b.x;nz=a.z-b.z;len=Math.hypot(nx,nz);}
    if(len<1e-5){nx=1;nz=0;len=1;}
    const push=Math.min(.11,c.penetration*.36);
    cx+=nx/len*push;cz+=nz/len*push;count++;
   }
   if(count){
    const k=.5/Math.sqrt(count);
    move(a,cx*k,cz*k);move(b,-cx*k,-cz*k);
    shapes[i]=pose(a).map(prepare);shapes[j]=pose(b).map(prepare);
   }
  }
 }
 return stats;
}
