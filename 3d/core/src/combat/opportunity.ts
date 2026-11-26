import type {PhysicsSegmentPose} from '../types.js';
import type {PunchChoice} from './punch-choice.js';
import type {StrikeKind,StrikeSnapshot} from './strike.js';
import type {PatientTraits} from './patient-profile.js';
export interface FightOpportunity{
 readonly distance:number;readonly facing:number;readonly grounded:boolean;
 readonly opponent:StrikeSnapshot;readonly temperament:PatientTraits['temperament'];
 readonly lastKind?:StrikeKind;readonly lastContact?:string;
}
/** Distance is still primary, but visibly impaired / distracted targets are
 * more inviting. No access to opponents' health or random damage rolls. */
export function targetPriority(distance:number,facing:number,parts:readonly PhysicsSegmentPose[]):number{
 const ids=new Set(parts.map(p=>p.id));
 const complete=['L','R'].reduce((n,side)=>n+Number(ids.has(side+'.upperLeg')&&ids.has(side+'.lowerLeg'))+Number(ids.has(side+'.upperArm')&&ids.has(side+'.lowerArm')),0);
 return distance-.14*(4-complete)-.28*Math.min(1,Math.abs(facing)/Math.PI);
}
/** Score only geometrically previewed contacts. Short, safe attacks and
 * exposed active sources are preferred, repeated identical contacts less so.
 * Neither score nor intention ever grants damage authority. */
export function attackScore(kind:StrikeKind,c:PunchChoice,context:FightOpportunity):number{
 const reach=kind==='arm'?.68:kind==='leg'?.99:.33;
 const threat=context.opponent.phase==='windup'||context.opponent.phase==='thrust';
 const recovery=context.opponent.phase==='recover';
 let score=1.1-.65*c.distance/reach;
 if(kind==='arm')score+=.23;
 if(kind==='leg')score+=context.grounded?.95:context.distance>.68?.28:-.16;
 if(kind==='head')score+=context.distance<.42?.32:-.25;
 if(c.contactId===context.opponent.source&&threat)score+=.32;
 if(recovery&&kind==='arm')score+=.18;
 if(/Leg$|foot$/.test(c.contactId)&&kind==='leg')score+=.12;
 if(context.lastKind===kind&&context.lastContact===c.contactId)score-=.23;
 if(context.temperament==='impulsive'&&kind==='head')score+=.14;
 if(context.temperament==='hesitant'&&kind==='leg'&&!context.grounded)score-=.15;
 return score;
}
export function shouldBackstep(context:FightOpportunity,ready:boolean,urgent:boolean):boolean{
 return !urgent&&!ready&&!context.grounded&&context.temperament!=='impulsive'&&context.distance<1.1&&Math.abs(context.facing)<.85&&(context.opponent.phase==='windup'||context.opponent.phase==='thrust');
}
