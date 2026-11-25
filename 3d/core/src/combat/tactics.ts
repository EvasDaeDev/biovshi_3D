import { FIXED_DT } from '../fixed-clock.js';
import type { PatientTraits } from './patient-profile.js';
const ticks=(s:number)=>Math.ceil(s/FIXED_DT-1e-9);
export interface Opponent {readonly id:number;readonly distance:number}
export interface TacticalSnapshot {readonly targetId:number|null;readonly commitmentUntil:number;readonly mode:'search'|'pursuit'|'retreat'|'strike'|'inactive'|'relocate'|'pincer'|'memory';readonly retaliationId:number|null}
const nearest=(opponents:readonly Opponent[]):Opponent|undefined=>opponents.reduce<Opponent|undefined>((best,o)=>!best||o.distance<best.distance||(o.distance===best.distance&&o.id<best.id)?o:best,undefined);
/** Bounded, imperfect attention: lock a target, notice a new attacker with
 * a delay, and briefly back away after a hard hit. No omniscient path search. */
export class CombatTactics {
 private target:number|null=null;private until=0;
 private threat:{id:number;ready:number;expires:number}|null=null;
 private retreatUntil=0;private retreatCooldown=0;
 private rng:number;
 private mode:TacticalSnapshot['mode']='search';
 constructor(seed:number,id:number){this.rng=(seed^Math.imul(id+1,0x85ebca6b)^0xc2b2ae35)>>>0;}
 private random():number{this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
 hit(attacker:number,tick:number,critical:boolean,traits:PatientTraits):void{
  if(attacker!==this.target){
   // Repeated hits by the same attacker do not restart the notice timer.
   if(!this.threat||this.threat.id!==attacker)this.threat={id:attacker,ready:tick+Math.max(ticks(.12),traits.reactionTicks),expires:tick+ticks(2.5)};
   else this.threat.expires=tick+ticks(2.5);
  }
  if(critical&&traits.temperament==='hesitant'&&tick>=this.retreatCooldown){
   this.retreatUntil=tick+ticks(.75);this.retreatCooldown=tick+ticks(4);
  }
 }
 choose(tick:number,opponents:readonly Opponent[],lockedId?:number,activeIds?:readonly number[]):number|null{
  if(this.threat&&(tick>=this.threat.expires||!(activeIds??opponents.map(o=>o.id)).includes(this.threat.id)))this.threat=null;
  const current=opponents.find(o=>o.id===this.target),preferred=nearest(opponents);
  const locked=opponents.find(o=>o.id===lockedId);
  const threat=this.threat&&tick>=this.threat.ready?opponents.find(o=>o.id===this.threat!.id&&o.distance<3):undefined;
  const next=locked??threat??(current&&tick<this.until&&current.distance<4?current:preferred);
  if(next&&next.id!==this.target){this.target=next.id;this.until=tick+ticks(1.3+this.random()*.7);}
  if(threat&&next?.id===threat.id)this.threat=null;
  if(!next){this.target=null;this.until=0;this.mode='search';}
  return this.target;
 }
 retreating(tick:number):boolean{return tick<this.retreatUntil;}
 setMode(mode:TacticalSnapshot['mode']):void{this.mode=mode;if(mode==='inactive'){this.target=null;this.threat=null;this.until=0;this.retreatUntil=0;}}
 snapshot():TacticalSnapshot{return {targetId:this.target,commitmentUntil:this.until,mode:this.mode,retaliationId:this.threat?.id??null};}
}
