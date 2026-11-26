import type {HealthSnapshot} from './damage.js';
import {FIXED_DT} from '../fixed-clock.js';
export const DISTRESS=Object.freeze({critical:.25,hysteriaChance:.10,minFlee:4,maxFlee:7});
export type DistressMode='normal'|'prey'|'hysteria'|'last-stand';
export interface DistressSnapshot {readonly mode:DistressMode;readonly until:number|null}
export function vulnerable(health:HealthSnapshot,workingLimbs:number):boolean{
 return workingLimbs<=1||health.endurance<=DISTRESS.critical*health.maxEndurance||
 health.segments.reduce((n,p)=>n+(p.attached?p.hp:0),0)<=DISTRESS.critical*health.segments.reduce((n,p)=>n+p.maxHp,0);
}
/** One decision per life at the first critical episode. Running out of
 * time does not reset the flee budget when the same victim changes target. */
export class DistressState{
 private mode:DistressMode='normal';private until:number|null=null;private rng:number;private checked=false;
 constructor(seed:number,id:number){let h=(seed^Math.imul(id+1,0x9e3779b9)^0x739a20cf)>>>0;h=Math.imul(h^(h>>>16),0x85ebca6b);this.rng=(h^(h>>>13))>>>0;}
 private roll():number{this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
 advance(tick:number,weak:boolean,critical:boolean,armed:boolean):DistressMode{
  if(!this.checked&&critical&&armed){this.checked=true;if(this.roll()<DISTRESS.hysteriaChance){this.mode='hysteria';this.until=null;}}
  if(this.mode==='normal'&&weak){this.mode='prey';this.until=tick+Math.ceil((DISTRESS.minFlee+(DISTRESS.maxFlee-DISTRESS.minFlee)*this.roll())/FIXED_DT);}
  if(this.mode==='prey'&&this.until!==null&&tick>=this.until){this.mode='last-stand';this.until=null;}
  return this.mode;
 }
 snapshot():DistressSnapshot{return {mode:this.mode,until:this.until};}
}
