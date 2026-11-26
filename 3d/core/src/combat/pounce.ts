import type {PhysicsSegmentPose,Vec3} from '../types.js';
import type {AuthoredMotion} from '../rig/authored-motion.js';
import {FIXED_DT} from '../fixed-clock.js';
import {pounceOffset} from '../rig/pounce-timing.js';
export {POUNCE,pounceOffset} from '../rig/pounce-timing.js';
import {closestAim,type PunchChoice} from './punch-choice.js';
import {punchPose,usableStrike,strikeOrigin,type Punch,type StrikeKind} from './strike.js';
import {reserveTarget} from './reach-reserve.js';
import {firstStrikeContact} from './swept-contact.js';
import {strikeBearing,SIDE_STRIKE_LIMIT} from './strike-sector.js';
const moved=(pose:readonly PhysicsSegmentPose[],d:Vec3):readonly PhysicsSegmentPose[]=>pose.map(p=>({...p,a:p.a.map((v,i)=>v+d[i]!) as unknown as Vec3,b:p.b.map((v,i)=>v+d[i]!) as unknown as Vec3}));
export function choosePounce(pose:readonly PhysicsSegmentPose[],ids:readonly string[],victim:readonly PhysicsSegmentPose[],yaw:number,eligible:(id:string)=>boolean,kind:StrikeKind,ground:(x:number,z:number)=>number,motion:AuthoredMotion,score:(p:PunchChoice)=>number,reserve=false):PunchChoice|null{
 if(!usableStrike(ids,'leg','L')||!usableStrike(ids,'leg','R'))return null;
 const at=(tick:number)=>moved(pose,pounceOffset(tick*FIXED_DT,yaw));
 const near=at(27);
 const rangeTarget=reserve?reserveTarget(pose,victim):victim;
 const options:{choice:PunchChoice;rank:number}[]=[];
 for(const side of (kind==='head'?['L'] as const:['L','R'] as const)){
  if(!usableStrike(ids,kind,side))continue;
  const origin=near.find(p=>p.id===strikeOrigin(kind,side))?.a;if(!origin)continue;
  for(const part of victim){
   if(!eligible(part.id))continue;
   const aim=closestAim(origin,part),distance=Math.hypot(aim[0]-origin[0],aim[1]-origin[1],aim[2]-origin[2]);
   if(distance>(kind==='arm'?.94:kind==='leg'?1.2:.57)+part.radius||Math.abs(strikeBearing(near,aim,yaw))>(kind==='head'?.65:SIDE_STRIKE_LIMIT))continue;
   options.push({choice:{side,id:part.id,aim,distance,contactId:part.id,pounce:true},rank:distance-(part.id==='head'?.32:0)});
  }
 }
 options.sort((a,b)=>a.rank-b.rank);
 let best:PunchChoice|null=null;
 for(const {choice} of options.slice(0,6)){
  const p:Punch={side:choice.side,kind,targetId:0,aim:choice.aim,start:0,yaw,pounce:true,fastThrust:true};
  let before=punchPose(at(19),p,19,ground,motion);
  for(const tick of [21,24,28]){
   const after=punchPose(at(tick),p,tick,ground,motion);
   let id=firstStrikeContact(before,after,rangeTarget,rangeTarget,choice.side,kind);
   if(id&&reserve)id=firstStrikeContact(before,after,victim,victim,choice.side,kind);
   if(id){if(eligible(id)){const c={...choice,contactId:id};if(!best||score(c)>score(best))best=c;}break;}
   before=after;
  }
 }
 return best;
}
