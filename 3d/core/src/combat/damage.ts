import { LAB_SEGMENTS,severingChain } from '../rig/anatomy.js';
import { FIXED_DT } from '../fixed-clock.js';
/** Native 3D rules, sourced from src/config.js and src/robot/{robot,anatomy}.js.
 * Three central torso capsules stay attached; their destruction is terminal. */
export const DAMAGE=Object.freeze({segmentHP:3,headHP:6,pelvisHP:4,invulnerabilitySeconds:.28,traumaThreshold:24,headMultiplier:1.5});
export type IncapacitationCause='head-loss'|'torso-failure'|'trauma'|'oil-loss'|'manual';
export interface SegmentHealth {readonly id:string;readonly hp:number;readonly maxHp:number;readonly attached:boolean}
export interface HealthSnapshot {readonly segments:readonly SegmentHealth[];readonly trauma:number;readonly traumaThreshold:number;readonly cause:IncapacitationCause|null}
export interface DamageResult {readonly amount:number;readonly remainingHP:number;readonly critical:boolean;readonly detached:readonly string[];readonly cause:IncapacitationCause|null}
interface Part {hp:number;maxHp:number;attached:boolean;lastHit:number}
const definitions=new Map(LAB_SEGMENTS.map(p=>[p.id,p]));
const maxHp=(id:string)=>id==='head'?DAMAGE.headHP:id==='pelvis'?DAMAGE.pelvisHP:DAMAGE.segmentHP;
const cooldownTicks=Math.ceil(DAMAGE.invulnerabilitySeconds/FIXED_DT);
export class DamageState {
 private parts=new Map<string,Part>();
 private trauma=0;private cause:IncapacitationCause|null=null;
 constructor(ids:readonly string[]){
  for(const id of ids)if(definitions.has(id))this.parts.set(id,{hp:maxHp(id),maxHp:maxHp(id),attached:true,lastHit:-Infinity});
 }
 apply(id:string,amount:number,tick:number):DamageResult|null{
  if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(tick)||tick<0)throw new RangeError('Invalid damage');
  const p=this.parts.get(id);
  if(this.cause||!p?.attached||p.hp<=0||tick-p.lastHit<cooldownTicks)return null;
  const actual=Math.min(amount,p.hp);p.hp-=actual;p.lastHit=tick;
  this.trauma+=actual*(id==='head'?DAMAGE.headMultiplier:1);
  let detached:string[]=[],cause:IncapacitationCause|null=null;
  if(p.hp===0){
   if(definitions.get(id)!.protected)cause='torso-failure';
   else{
    detached=severingChain(id).filter(key=>this.parts.get(key)?.attached);
    this.detach(detached);
    if(detached.includes('head'))cause='head-loss';
   }
  }
  if(!cause&&this.trauma>=DAMAGE.traumaThreshold)cause='trauma';
  if(cause)this.finish(cause);
  return {amount:actual,remainingHP:p.hp,critical:amount===2,detached,cause};
 }
 /** Synchronizes lab-only fracture; no trauma from artificial stress contacts. */
 detach(ids:readonly string[]):void{for(const id of ids){const p=this.parts.get(id);if(p){p.hp=0;p.attached=false;}}}
 finish(cause:IncapacitationCause):void{this.cause??=cause;}
 snapshot():HealthSnapshot{return {segments:[...this.parts].map(([id,p])=>({id,hp:p.hp,maxHp:p.maxHp,attached:p.attached})),trauma:this.trauma,traumaThreshold:DAMAGE.traumaThreshold,cause:this.cause};}
}
