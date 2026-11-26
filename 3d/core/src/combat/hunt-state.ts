import {FIXED_DT} from '../fixed-clock.js';
export type HuntPhase='search'|'observe'|'stalk'|'burst'|'recover'|'engage'|'flee';
export interface HuntSnapshot {readonly phase:HuntPhase;readonly targetId:number|null;readonly since:number;readonly until:number}
export interface HuntInput {
 readonly tick:number;readonly targetId:number;readonly distance:number;
 readonly visible:boolean;readonly clear:boolean;readonly aligned:boolean;
 readonly exposed:boolean;readonly grounded:boolean;readonly urgent:boolean;
 readonly interrupted:boolean;
}
const ticks=(s:number)=>Math.ceil(s/FIXED_DT-1e-9);
const pace:Record<HuntPhase,number>={search:1,observe:0,stalk:.52,burst:.86,recover:.22,engage:1,flee:1};
/** A committed observation is associated with a specific perceived target.
 * Independent seeded timing; no global periodic acceleration or hidden HP.
 * These are movement intentions, not attack or damage authorisation. */
export class HuntState{
 private phase:HuntPhase='search';private targetId:number|null=null;
 private since=0;private until=0;private rng:number;
 constructor(seed:number,id:number){this.rng=(seed^Math.imul(id+1,0x45d9f3b)^0x7f4a7c15)>>>0;}
 private random(){this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
 private enter(phase:HuntPhase,tick:number,seconds=0):void{
  this.phase=phase;this.since=tick;this.until=tick+ticks(seconds);
 }
 reset(tick:number,phase:'search'|'flee'='search'):void{
  if(this.phase!==phase||this.targetId!==null)this.enter(phase,tick);
  this.targetId=null;
 }
 advance(input:HuntInput):{pace:number;sprint:boolean;holding:boolean}{
  const {tick,targetId,distance,visible,clear,aligned,exposed,grounded,urgent,interrupted}=input;
  if(!visible){this.reset(tick);return this.intent();}
  if(this.targetId!==targetId){this.targetId=targetId;this.enter('observe',tick,.38+this.random()*.36);}
  if(interrupted){if(this.phase!=='recover')this.enter('recover',tick,.25);return this.intent();}
  // Never block existing close-range previews, especially grounded victims.
  if(distance<=1.25||(grounded&&distance<=2.65)||urgent){
   if(this.phase!=='engage')this.enter('engage',tick);
   return this.intent();
  }
  if(this.phase==='engage'||this.phase==='search'||this.phase==='flee')this.enter('observe',tick,.30+this.random()*.24);
  const opportunity=clear&&aligned&&exposed&&distance<=2.8;
  switch(this.phase){
   case 'observe':
    if(tick>=this.until)this.enter(opportunity?'burst':'stalk',tick,opportunity?.35+this.random()*.22:.9+this.random()*.6);
    break;
   case 'stalk':
    if(opportunity)this.enter('burst',tick,.35+this.random()*.22);
    else if(tick>=this.until)this.enter('observe',tick,.24+this.random()*.30);
    break;
   case 'burst':
    if(!clear||!aligned||tick>=this.until)this.enter('recover',tick,.24+this.random()*.18);
    break;
   case 'recover':
    if(tick>=this.until)this.enter('stalk',tick,.8+this.random()*.45);
    break;
  }
  return this.intent();
 }
 private intent(){return {pace:pace[this.phase],sprint:this.phase==='burst',holding:this.phase==='observe'||this.phase==='recover'};}
 snapshot():HuntSnapshot{return {phase:this.phase,targetId:this.targetId,since:this.since,until:this.until};}
}
