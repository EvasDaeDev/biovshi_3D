import { LAB_SEGMENTS,severingChain } from '../rig/anatomy.js';
import { FIXED_DT } from '../fixed-clock.js';
/** Native 3D rules, sourced from src/config.js and src/robot/{robot,anatomy}.js.
 * Central torso capsules remain attached at zero HP. Endurance is the
 * remaining v1 trauma budget, reduced by lost anatomy (not by movement). */
export const DAMAGE=Object.freeze({segmentHP:3.6,headHP:7.2,pelvisHP:4.8,invulnerabilitySeconds:.28,traumaThreshold:24,headMultiplier:1.5,lostCapacityFraction:.5});
export type IncapacitationCause='head-loss'|'torso-failure'|'trauma'|'oil-loss'|'manual';
export interface SegmentHealth {readonly id:string;readonly hp:number;readonly maxHp:number;readonly attached:boolean}
export interface HealthSnapshot {readonly segments:readonly SegmentHealth[];readonly trauma:number;readonly traumaThreshold:number;readonly endurance:number;readonly maxEndurance:number;readonly baseEndurance:number;readonly lostSegments:number;readonly cause:IncapacitationCause|null}
export interface DamageResult {readonly amount:number;readonly remainingHP:number;readonly critical:boolean;readonly detached:readonly string[];readonly cause:IncapacitationCause|null}
interface Part {hp:number;maxHp:number;attached:boolean;lastHit:number}
const definitions=new Map(LAB_SEGMENTS.map(p=>[p.id,p]));
const maxHp=(id:string)=>id==='head'?DAMAGE.headHP:id==='pelvis'?DAMAGE.pelvisHP:DAMAGE.segmentHP;
// Keep fractional HP exact to display precision without rounding each hit
// to whole HP. Retain sub-unit damage supported by the core API.
const precise=(n:number)=>Number(n.toPrecision(15));
const cooldownTicks=Math.ceil(DAMAGE.invulnerabilitySeconds/FIXED_DT);
export class DamageState {
 private parts=new Map<string,Part>();
 private trauma=0;private lost=LAB_SEGMENTS.length;private cause:IncapacitationCause|null=null;
 constructor(ids:readonly string[]){
  for(const id of ids)if(definitions.has(id))this.parts.set(id,{hp:maxHp(id),maxHp:maxHp(id),attached:true,lastHit:-Infinity});
  this.lost=LAB_SEGMENTS.length-this.parts.size;
 }
 get maxEndurance():number{return DAMAGE.traumaThreshold*(1-DAMAGE.lostCapacityFraction*this.lost/LAB_SEGMENTS.length);}
 get endurance():number{return this.cause?0:Math.max(0,this.maxEndurance-this.trauma);}
 apply(id:string,amount:number,tick:number):DamageResult|null{
  if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(tick)||tick<0)throw new RangeError('Invalid damage');
  const p=this.parts.get(id);
  if(this.cause||!p?.attached||p.hp<=0||tick-p.lastHit<cooldownTicks)return null;
  const actual=Math.min(amount,p.hp);p.hp=precise(p.hp-actual);p.lastHit=tick;
  this.trauma=precise(this.trauma+actual*(id==='head'?DAMAGE.headMultiplier:1));
  let detached:string[]=[],cause:IncapacitationCause|null=null;
  if(p.hp===0){
   if(!definitions.get(id)!.protected){
    detached=severingChain(id).filter(key=>this.parts.get(key)?.attached);
    this.detach(detached);
    if(detached.includes('head'))cause='head-loss';
   }
  }
  if(!cause&&this.trauma>=this.maxEndurance)cause='trauma';
  if(cause)this.finish(cause);
  return {amount:actual,remainingHP:p.hp,critical:amount===2,detached,cause};
 }
 canDamage(id:string,tick:number):boolean{const p=this.parts.get(id);return !this.cause&&!!p?.attached&&p.hp>0&&tick-p.lastHit>=cooldownTicks;}
 /** Synchronizes lab-only fracture; no trauma from artificial stress contacts. */
 detach(ids:readonly string[]):void{for(const id of ids){const p=this.parts.get(id);if(p?.attached){p.hp=0;p.attached=false;this.lost++;}}}
 finish(cause:IncapacitationCause):void{this.cause??=cause;}
 snapshot():HealthSnapshot{return {segments:[...this.parts].map(([id,p])=>({id,hp:p.hp,maxHp:p.maxHp,attached:p.attached})),trauma:this.trauma,traumaThreshold:this.maxEndurance,endurance:this.endurance,maxEndurance:this.maxEndurance,baseEndurance:DAMAGE.traumaThreshold,lostSegments:this.lost,cause:this.cause};}
}
