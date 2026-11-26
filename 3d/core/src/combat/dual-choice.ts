import type {PhysicsSegmentPose} from '../types.js';
import type {AuthoredMotion} from '../rig/authored-motion.js';
import {closestAim} from './punch-choice.js';
import {compatibleChannels,punchPose,usableStrike,type Punch,type StrikeChannel} from './strike.js';
import {reserveTarget} from './reach-reserve.js';
import {firstStrikeContact} from './swept-contact.js';
import {strikeBearing,SIDE_STRIKE_LIMIT} from './strike-sector.js';
/** Bounded shared-pose preview. No independent torso simulations or
 * guaranteed damage: both channels must intersect their own target. */
export function chooseSecondChannel(pose:readonly PhysicsSegmentPose[],ids:readonly string[],primary:Punch,victim:readonly PhysicsSegmentPose[],eligible:(id:string)=>boolean,otherId:number,other:readonly PhysicsSegmentPose[],otherEligible:(id:string)=>boolean,motion:AuthoredMotion,ground:(x:number,z:number)=>number,reserve=false):StrikeChannel|null{
 if(primary.prone||primary.kind==='head'||primary.targetId===otherId)return null;
 const primaryRange=reserve?reserveTarget(pose,victim):victim;
 const secondaryRange=reserve?reserveTarget(pose,other):other;
 const candidates:{channel:StrikeChannel;distance:number}[]=[];
 for(const side of ['L','R'] as const){
  if(!usableStrike(ids,'arm',side))continue;
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
   if(!a){
    const kind=primary.kind??'arm';
    const id=firstStrikeContact(before,after,primaryRange,primaryRange,primary.side,kind);
    const actual=id&&reserve?firstStrikeContact(before,after,victim,victim,primary.side,kind):id;
    a=actual!==null&&eligible(actual);
   }
   if(!b){
    const id=firstStrikeContact(before,after,secondaryRange,secondaryRange,channel.side,'arm');
    const actual=id&&reserve?firstStrikeContact(before,after,other,other,channel.side,'arm'):id;
    b=actual!==null&&otherEligible(actual);
   }
   if(a&&b)return channel;
   before=after;
  }
 }
 return null;
}
