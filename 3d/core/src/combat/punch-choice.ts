import type { Vec3,PhysicsSegmentPose } from '../types.js';
import { punchPose,usableArm,type Punch } from './strike.js';
import { firstStrikeContact } from './swept-contact.js';
export interface PunchChoice {side:'L'|'R';id:string;aim:Vec3;contactId:string;distance:number}
export function closestAim(origin:Vec3,part:PhysicsSegmentPose):Vec3{
 const v=part.b.map((x,i)=>x-part.a[i]!) as [number,number,number];
 const length=v[0]**2+v[1]**2+v[2]**2;
 const t=length?Math.max(0,Math.min(1,((origin[0]-part.a[0])*v[0]+(origin[1]-part.a[1])*v[1]+(origin[2]-part.a[2])*v[2])/length)):0;
 return [part.a[0]+v[0]*t,part.a[1]+v[1]*t,part.a[2]+v[2]*t];
}
/** Select from attacks whose actual fixed-length IK can contact a live
 * damageable capsule in a static preview. The preview does not deal damage;
 * real moving geometry is still tested during thrust. */
export function choosePunch(pose:readonly PhysicsSegmentPose[],ids:readonly string[],victim:readonly PhysicsSegmentPose[],yaw:number,eligible:(id:string)=>boolean,sequence:number):PunchChoice|null{
 const choices:PunchChoice[]=[];
 const order=['chest','L.lowerArm','R.lowerArm','head','abdomen','L.upperArm','R.upperArm','neck','pelvis','L.hand','R.hand','L.upperLeg','R.upperLeg'];
 for(const id of order){
  if(!eligible(id))continue;
  const part=victim.find(p=>p.id===id);if(!part)continue;
  for(const side of ['L','R'] as const){
   if(!usableArm(ids,side))continue;
   const shoulder=pose.find(p=>p.id===side+'.upperArm')!.a,aim=closestAim(shoulder,part);
   const distance=Math.hypot(shoulder[0]-aim[0],shoulder[1]-aim[1],shoulder[2]-aim[2]);
   if(distance>.68+part.radius+.083-.015)continue;
   const punch:Punch={side,targetId:0,aim,start:0,yaw};
   let before=punchPose(pose,punch,19),contactId:string|null=null;
   for(const age of [23,27,31]){
    const after=punchPose(pose,punch,age);
    contactId=firstStrikeContact(before,after,victim,victim,side);
    if(contactId)break;
    before=after;
   }
   if(contactId&&eligible(contactId))choices.push({side,id,aim,contactId,distance});
  }
 }
 // De-duplicate actual hit segments, prefer shortest source for each.
 const distinct=[...new Map(choices.sort((a,b)=>b.distance-a.distance).map(c=>[c.contactId,c])).values()];
 // Reachable chest remains an option; a depleted chest cannot be selected.
 return distinct.length?distinct[sequence%distinct.length]!:null;
}
