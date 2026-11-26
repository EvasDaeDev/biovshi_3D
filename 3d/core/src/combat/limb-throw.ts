import type {PhysicsSegmentPose,Vec3} from '../types.js';
import {FIXED_DT} from '../fixed-clock.js';
import {DAMAGE,type HealthSnapshot} from './damage.js';
import {LAB_SEGMENTS,severingChain} from '../rig/anatomy.js';
import {mobilityFor} from '../rig/mobility.js';
import {usableArm} from './strike.js';
import {sweptContact} from './swept-contact.js';
export const LIMB_THROW=Object.freeze({healthy:.75,critical:.25,accuracy:.8,damage:5,minRange:2,maxRange:5.5,windupTicks:27,gravity:9.81,maxSeconds:1.6});
export interface ThrowPlan{readonly targetId:number;readonly root:string;readonly start:number;readonly aim:Vec3}
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const midpoint=(p:PhysicsSegmentPose):Vec3=>[(p.a[0]+p.b[0])*.5,(p.a[1]+p.b[1])*.5,(p.a[2]+p.b[2])*.5];
export function sacrificeArm(ids:readonly string[],health:HealthSnapshot,side:'L'|'R'):string|null{
 if(health.cause||health.endurance<LIMB_THROW.healthy*health.baseEndurance||mobilityFor(ids).mode!=='biped'||!usableArm(ids,'L')||!usableArm(ids,'R'))return null;
 const root=side+'.upperArm',branch=severingChain(root).filter(id=>ids.includes(id)),part=health.segments.find(p=>p.id===root&&p.attached);
 if(!part||part.hp<=0||!ids.includes(side+'.hand'))return null;
 const after=ids.filter(id=>!branch.includes(id));
 if(mobilityFor(after).mode!=='biped'||!usableArm(after,side==='L'?'R':'L'))return null;
 const max=health.maxEndurance-health.baseEndurance*DAMAGE.lostCapacityFraction*branch.length/LAB_SEGMENTS.length;
 return health.endurance-(health.maxEndurance-max)-part.hp>max*LIMB_THROW.critical?root:null;
}
export function throwVelocity(origin:Vec3,target:Vec3,observed:Vec3,accurate:boolean,side:1|-1):Vec3{
 const dx=target[0]-origin[0],dz=target[2]-origin[2],d=Math.hypot(dx,dz);
 const t=clamp(d/8,.34,.75),lead=observed.map(v=>clamp(v,-5.5,5.5)) as unknown as Vec3;
 const predicted=add(target,[lead[0]*t,lead[1]*t,lead[2]*t]);
 const n=Math.max(d,.001),aim:Vec3=accurate?predicted:add(predicted,[side*1.45*(-dz/n),0,side*1.45*(dx/n)]);
 return [(aim[0]-origin[0])/t,(aim[1]-origin[1]+.5*LIMB_THROW.gravity*t*t)/t,(aim[2]-origin[2])/t];
}
export class ThrowDecision{
 private rng:number;used=false;retry=0;plan:ThrowPlan|null=null;
 constructor(seed:number,id:number){let h=(seed^Math.imul(id+1,0x27d4eb2d)^0x401b8c23)>>>0;h=Math.imul(h^(h>>>16),0x85ebca6b);this.rng=(h^(h>>>13))>>>0;}
 sample():{accurate:boolean;side:1|-1}{
  this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;
  const accurate=this.rng/4294967296<LIMB_THROW.accuracy;
  this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;
  return {accurate,side:this.rng<0x80000000?-1:1};
 }
}
export class LimbFlight{
 age=0;readonly origin:Vec3;
 constructor(readonly id:number,readonly owner:number,readonly targetId:number,readonly parts:readonly PhysicsSegmentPose[],readonly initial:Vec3,readonly accurate:boolean){
  const centers=parts.map(midpoint);this.origin=[0,1,2].map(i=>centers.reduce((s,p)=>s+p[i]!,0)/centers.length) as unknown as Vec3;
 }
 center(t:number):Vec3{return add(this.origin,[this.initial[0]*t,this.initial[1]*t-.5*LIMB_THROW.gravity*t*t,this.initial[2]*t]);}
 velocity(t:number):Vec3{return [this.initial[0],this.initial[1]-LIMB_THROW.gravity*t,this.initial[2]];}
 pose(t:number):readonly PhysicsSegmentPose[]{
  const center=this.center(t),c=Math.cos(7*t),s=Math.sin(7*t);
  const point=(p:Vec3):Vec3=>{const d=sub(p,this.origin);return add(center,[c*d[0]-s*d[2],d[1],s*d[0]+c*d[2]]);};
  return this.parts.map(p=>({...p,a:point(p.a),b:point(p.b)}));
 }
 /** One fixed step with real swept-capsule contact. No damage from the
  * accuracy roll, only from the first physical interception. */
 advance(targets:readonly {id:number;previous:readonly PhysicsSegmentPose[];current:readonly PhysicsSegmentPose[]}[],clear:(a:Vec3,b:Vec3,pad?:number)=>boolean,ground:(x:number,z:number)=>number){
  const from=this.age,to=from+FIXED_DT,old=this.pose(from),next=this.pose(to);
  let stop=1,ended=false,hit:{fighterId:number;segmentId:string;point:Vec3}|null=null;
  // Check full swept capsule clearance before handing off to physical debris.
  const blocked=!clear(this.center(from),this.center(to))||next.some((p,i)=>!clear(old[i]!.a,p.a,p.radius)||!clear(old[i]!.b,p.b,p.radius)||!clear(p.a,p.b,p.radius));
  if(blocked){stop=0;ended=true;}
  if(!ended&&next.some(p=>[p.a,p.b].some(v=>v[1]-p.radius<=ground(v[0],v[2])))){ended=true;stop=1;}
  if(stop>0){
   for(const b of targets){
    if(b.id===this.owner)continue;
    const prev=new Map(b.previous.map(p=>[p.id,p]));
    for(const [i,p] of next.entries())for(const q of b.current){
     const q0=prev.get(q.id);if(!q0)continue;
     // Conservative per-capsule broad phase before the expensive sweep.
     const a=midpoint(p),v=midpoint(q);
     if(Math.hypot(a[0]-v[0],a[1]-v[1],a[2]-v[2])>1.5+Math.hypot(...this.initial)*FIXED_DT)continue;
     const t=sweptContact(old[i]!,p,q0,q);
     if(t!==null&&t<stop){stop=t;ended=true;hit={fighterId:b.id,segmentId:q.id,point:v};}
    }
   }
  }
  this.age=from+(to-from)*stop;
  return {ended:ended||this.age>=LIMB_THROW.maxSeconds,hit,parts:this.pose(this.age),velocity:blocked?[0,Math.min(0,this.velocity(this.age)[1]),0] as Vec3:this.velocity(this.age)};
 }
}
