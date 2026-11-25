import { MOVEMENT } from '../rig/movement-timing.js';
import { usableStrike } from './strike.js';
import { tacticalEscape, type PointXZ, type EscapeGoalClear } from './escape.js';

/** Anatomical eligibility, not a promise that an individual hit can connect.
 * The native leg strike requires a second intact leg for support. */
export function hasAttackSource(ids:readonly string[],expandedStrikes:boolean):boolean{
 return usableStrike(ids,'arm','L')||usableStrike(ids,'arm','R')||
  (expandedStrikes&&(usableStrike(ids,'head','L')||usableStrike(ids,'leg','L')));
}

export interface FleeActor extends PointXZ {readonly id:number}
const metres=(cm:number)=>cm*MOVEMENT.walkSpeed/(32*1.2);
const wall=5.65;
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const distance=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
const clearance=(p:PointXZ)=>wall-Math.max(Math.abs(p.x),Math.abs(p.z));
export const DISARMED=Object.freeze({commitTicks:108,arrival:metres(22),occupiedRadius:metres(35)});

/** Port src/systems/ai.js:fleeAllAttackers.
 * Sample the same 24 headings and 75/125/170-unit lengths, score the
 * nearest of ALL armed enemies, then fall back to v1 tacticalEscape.
 * The geometry callbacks are the existing native arena navigation adapter. */
export function fleeAllAttackers(
 a:FleeActor,
 threats:readonly PointXZ[],
 occupied:readonly PointXZ[],
 goalClear:EscapeGoalClear,
 directClear:(goal:PointXZ)=>boolean,
):PointXZ|null{
 if(!threats.length)return null;
 const nearest=threats.reduce((best,foe)=>distance(a,foe)<distance(a,best)?foe:best,threats[0]!);
 const starting=Math.min(...threats.map(t=>distance(a,t)));
 let best:PointXZ|null=null,bestScore=-Infinity;
 for(let i=0;i<24;i++){
  const theta=i*Math.PI/12+(a.id%3)*.07;
  for(const cm of [75,125,170]){
   const p={x:clamp(a.x+Math.cos(theta)*metres(cm),-wall,wall),z:clamp(a.z+Math.sin(theta)*metres(cm),-wall,wall)};
   if(distance(a,p)<metres(24)||!goalClear(p)||occupied.some(o=>distance(o,p)<DISARMED.occupiedRadius))continue;
   const d=Math.min(...threats.map(t=>distance(t,p)));
   const score=d-starting+Math.min(d,metres(200))*.2-(directClear(p)?0:metres(60))-Math.max(0,metres(45)-clearance(p))*.4;
   if(score>bestScore){best=p;bestScore=score;}
  }
 }
 return best??tacticalEscape(a,nearest,a.id%2?-1:1,occupied,goalClear);
}
