import type {AuthoredMotion} from '../rig/authored-motion.js';
import type { PhysicsSegmentPose } from '../types.js';
import { closestAim,type PunchChoice } from './punch-choice.js';
import { punchPose,usableStrike,strikeOrigin,type Punch,type StrikeKind } from './strike.js';
import { firstStrikeContact } from './swept-contact.js';
export interface ExtraChoice extends PunchChoice {kind:'leg'|'head'}
/** Evaluate real attack geometry before committing to a kick or head strike.
 * Bounded candidate list; actual contact still resolved at fixed ticks. */
export function chooseExtra(pose:readonly PhysicsSegmentPose[],ids:readonly string[],victim:readonly PhysicsSegmentPose[],yaw:number,eligible:(id:string)=>boolean,kind:'leg'|'head',ground:(x:number,z:number)=>number,motion?:AuthoredMotion,groundTarget=false,score?:(choice:PunchChoice)=>number):ExtraChoice|null{
 let best:ExtraChoice|null=null;
 const targets=kind==='head'?['head','neck','chest','L.upperArm','R.upperArm']:['pelvis','abdomen','L.upperLeg','R.upperLeg','L.lowerLeg','R.lowerLeg','L.foot','R.foot'];
 // A grounded victim has its head, torso and arms at foot height.
 // Keep the accepted standing-victim target order; only broaden the grounded case.
 const candidates=kind==='leg'&&groundTarget?[...targets,...victim.map(p=>p.id).filter(id=>!targets.includes(id))]:targets;
 for(const id of candidates){
  if(!eligible(id))continue;
  const part=victim.find(v=>v.id===id);if(!part)continue;
  const sides=kind==='head'?['L'] as const:['L','R'] as const;
  for(const side of sides){
   if(!usableStrike(ids,kind,side))continue;
   const origin=pose.find(v=>v.id===strikeOrigin(kind,side))?.a;if(!origin)continue;
   const aim=closestAim(origin,part),distance=Math.hypot(aim[0]-origin[0],aim[1]-origin[1],aim[2]-origin[2]);
   if(distance>(kind==='head'?.33+.19:.99+.13)+part.radius-.015+(motion?.12:0))continue;
   const p:Punch={side,kind,targetId:0,aim,start:0,yaw,targetSegment:id};
   let before=punchPose(pose,p,19,ground,motion);
   for(const age of [23,27,31]){
    const after=punchPose(pose,p,age,ground,motion),contactId=firstStrikeContact(before,after,victim,victim,side,kind);
    if(contactId){if(eligible(contactId)){
     const choice:ExtraChoice={side,kind,id,aim,contactId,distance};
     if(!score)return choice;
     if(!best||score(choice)>score(best))best=choice;
    }break;}
    before=after;
   }
  }
 }
 return best;
}
