import type {AuthoredMotion} from '../rig/authored-motion.js';
import type { PhysicsSegmentPose } from '../types.js';
import { closestAim,type PunchChoice } from './punch-choice.js';
import { punchPose,usableStrike,strikeOrigin,strikeSource,type Punch } from './strike.js';
import {reserveTarget} from './reach-reserve.js';
import { firstStrikeContact } from './swept-contact.js';
export function chooseProneStrike(pose:readonly PhysicsSegmentPose[],ids:readonly string[],victim:readonly PhysicsSegmentPose[],yaw:number,eligible:(id:string)=>boolean,kind:'arm'|'head',ground:(x:number,z:number)=>number,sequence:number,reserve=false,motion?:AuthoredMotion):PunchChoice|null{
 const choices:PunchChoice[]=[];
 const rangeTarget=reserve?reserveTarget(pose,victim):victim;
 for(const side of (kind==='head'?['L']:['L','R']) as ('L'|'R')[]){
  if(!usableStrike(ids,kind,side))continue;
  const source=strikeSource(kind,side,ids);
  const origin=pose.find(v=>v.id===strikeOrigin(kind,side))!.a;
  for(const part of victim){
   if(!eligible(part.id))continue;
   const aim=closestAim(origin,part),distance=Math.hypot(aim[0]-origin[0],aim[1]-origin[1],aim[2]-origin[2]);
   if(distance>(kind==='head'?.52:source.endsWith('.upperArm')?.47:.763)+part.radius-.01)continue;
   const p:Punch={side,kind,prone:true,targetId:0,aim,start:0,yaw,targetSegment:part.id};
   let before=punchPose(pose,p,19,ground,motion),moved=false;
   for(const age of [23,27,31]){
    const after=punchPose(pose,p,age,ground,motion);
    const a=before.find(v=>v.id===source)!,b=after.find(v=>v.id===source)!;
    moved||=Math.hypot(a.b[0]-b.b[0],a.b[1]-b.b[1],a.b[2]-b.b[2])>.005;
    let contactId=firstStrikeContact(before,after,rangeTarget,rangeTarget,side,kind);
    if(contactId&&reserve)contactId=firstStrikeContact(before,after,victim,victim,side,kind);
    // At the start of thrust a constrained chain may still be on the
    // ground and touching the opponent. Inspect the remaining thrust before
    // discarding an otherwise reachable candidate with no source movement.
    if(contactId&&moved){if(eligible(contactId))choices.push({side,id:part.id,aim,contactId,distance});break;}
    before=after;
   }
  }
 }
 const distinct=[...new Map(choices.sort((a,b)=>b.distance-a.distance).map(c=>[c.contactId,c])).values()];
 return distinct.length?distinct[sequence%distinct.length]!:null;
}
