import { FIXED_DT } from '../fixed-clock.js';
/** Effective points, independent of progression and equipment storage. */
export interface PatientProfile {
 readonly movement:number;readonly critical:number;readonly turning:number;
 readonly temperament?:'impulsive'|'hesitant'|'balanced';
}
export interface PatientTraits {
 readonly movementMultiplier:number;readonly criticalChance:number;readonly turnMultiplier:number;
 readonly temperament:'impulsive'|'hesitant'|'balanced'|'baseline';
 readonly reactionTicks:number;readonly recoveryTicks:number;readonly pursuit:number;
}
function interpolate(points:number,values:readonly number[]):number{
 const n=Math.max(0,Math.min(values.length-1,points-4)),lo=Math.floor(n),hi=Math.ceil(n);
 return values[lo]!+(values[hi]!-values[lo]!)*(n-lo);
}
// Port of src/garage/model.js, including fractional effective points.
export function statMultiplier(points:number):number{return points<=4?1+(points-3)*.2:1.2+interpolate(points,[0,.15,.30,.40,.50,.60]);}
export function critChance(points:number):number{return points<=4?Math.max(0,(points-2)*.15):interpolate(points,[.30,.38,.45,.50,.55,.60]);}
const ticks=(seconds:number)=>Math.ceil(seconds/FIXED_DT-1e-9);
export function patientTraits(p?:PatientProfile):PatientTraits{
 if(!p)return {movementMultiplier:1,criticalChance:0,turnMultiplier:1,temperament:'baseline',reactionTicks:0,recoveryTicks:0,pursuit:1};
 if(![p.movement,p.critical,p.turning].every(v=>Number.isFinite(v)&&v>=2))throw new RangeError('Invalid patient effective points');
 const temperament=p.temperament??'balanced';
 if(!['impulsive','hesitant','balanced'].includes(temperament))throw new RangeError('Invalid patient temperament');
 const behavior=temperament==='impulsive'?{reactionTicks:ticks(.08),recoveryTicks:0,pursuit:1}:temperament==='hesitant'?{reactionTicks:ticks(.30),recoveryTicks:ticks(.22),pursuit:.82}:{reactionTicks:ticks(.16),recoveryTicks:ticks(.10),pursuit:.92};
 return {movementMultiplier:statMultiplier(p.movement),criticalChance:critChance(p.critical),turnMultiplier:statMultiplier(p.turning),temperament,...behavior};
}
/** Per-actor deterministic RNG independent from oil, wander and other actors.
 * Consume a roll only for a real eligible contact, not aim previews. */
export class PatientBehavior {
 readonly traits:PatientTraits;
 private rng:number;
 private targetId:number|null=null;private noticedAt=0;private nextAttack=0;
 constructor(seed:number,id:number,p?:PatientProfile){
  this.traits=patientTraits(p);this.rng=(seed^Math.imul(id+1,0x9e3779b9)^0x85ebca6b)>>>0;
 }
 notice(id:number,tick:number):void{
  if(this.targetId!==id){this.targetId=id;this.noticedAt=tick;}
 }
 ready(tick:number):boolean{return tick>=this.noticedAt+this.traits.reactionTicks&&tick>=this.nextAttack;}
 started(tick:number,baseCooldown:number):void{this.nextAttack=tick+baseCooldown+this.traits.recoveryTicks;}
 damage():1|2{
  if(this.traits.criticalChance===0)return 1;
  this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;
  return this.rng/4294967296<this.traits.criticalChance?2:1;
 }
 snapshot(){return {...this.traits,targetId:this.targetId,noticedAt:this.noticedAt,nextAttack:this.nextAttack};}
}
