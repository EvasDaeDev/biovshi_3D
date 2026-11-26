import type {PhysicsSegmentPose} from '../types.js';
import type {AuthoredMotion} from '../rig/authored-motion.js';
import {closestAim} from './punch-choice.js';
import {compatibleChannels,punchPose,usableArm,type Punch,type StrikeChannel} from './strike.js';
import {firstStrikeContact} from './swept-contact.js';
import {strikeBearing,SIDE_STRIKE_LIMIT} from './strike-sector.js';
/** Bounded shared-pose preview. No independent torso simulations or
 * guaranteed damage: both channels must intersect their own target. */
export function chooseSecondChannel(pose:readonly PhysicsSegmentPose[],ids:readonly string[],primary:Punch,victim:readonly PhysicsSegmentPose[],eligible:(id:string)=>boolean,otherId:number,other:readonly PhysicsSegmentPose[],otherEligible:(id:string)=>boolean,motion:AuthoredMotion,ground:(x:number,z:number)=>number):StrikeChannel|null{
 if(primary.prone||primary.kind==='head'||primary.targetId===otherId)return null;
 const candidates:{channel:StrikeChannel;distance:number}[]=[];
 for(const side of ['L','R'] as const){
  if(!usableArm(ids,side))continue;
  const origin=pose.find(p=>p.id===side+'.upperArm')?.a;if(!origin)continue;
  for(const part of other){
   if(!otherEligible(part.id))continue;
   const aim=closestAim(origin,part),distance=Math.hypot(...aim.map((v,i)=>v-origin[i]!));
   if(distance>.68+part.radius+.083+.26||Math.abs(strikeBearing(pose,aim,primary.yaw))>SIDE_STRIKE_LIMIT)continue;
   const channel:StrikeChannel={side,kind:'arm',targetId:otherId,aim,targetSegment:part.id};
   if(compatibleChannels(primary,channel))candidates.push({channel,distance});
  }
 }
 candidates.sort((a,b)=>a.distance-b.distance);
 for(const {channel} of candidates.slice(0,6)){
  const dual={...primary,secondary:channel};let a=false,b=false,before=punchPose(pose,dual,19,ground,motion);
  for(const tick of [23,27,31]){
   const after=punchPose(pose,dual,tick,ground,motion);
   if(!a){const id=firstStrikeContact(before,after,victim,victim,primary.side,primary.kind??'arm');a=id!==null&&eligible(id);}
   if(!b){const id=firstStrikeContact(before,after,other,other,channel.side,'arm');b=id!==null&&otherEligible(id);}
   if(a&&b)return channel;
   before=after;
  }
 }
 return null;
}
