import type {PointXZ} from './escape.js';
import type {PatientTraits} from './patient-profile.js';
import type {StrikeKind,StrikePhase} from './strike.js';
import {FIXED_DT} from '../fixed-clock.js';
export type RaidPhase='search'|'observe'|'flank'|'rush'|'attack'|'withdraw'|'reassess';
export interface RaidProfile {readonly patience:number;readonly risk:number;readonly safeDistance:number;readonly drive:number;readonly initiative:number;readonly openingTicks:number;readonly searchPace:number;readonly counterTicks:number;readonly preferredStrike:StrikeKind;readonly side:1|-1}
export interface RaidOpponent extends PointXZ {readonly id:number;readonly yaw:number;readonly threatening:boolean;readonly grounded:boolean;readonly recovering?:boolean}
export interface RaidSnapshot {readonly phase:RaidPhase;readonly targetId:number|null;readonly goal:PointXZ|null;readonly attempts:number;readonly hits:number;readonly rush:number;readonly profile:RaidProfile}
export interface RaidInput {readonly tick:number;readonly here:PointXZ;readonly target:RaidOpponent|null;readonly visible:readonly RaidOpponent[];readonly strike:StrikePhase;readonly interrupted:boolean;readonly ready:boolean;readonly clear:(goal:PointXZ)=>boolean;readonly defiant?:boolean;readonly hysterical?:boolean}
export interface RaidIntent {readonly phase:RaidPhase;readonly goal:PointXZ|null;readonly pace:number;readonly sprint:boolean;readonly attack:boolean}
const ticks=(s:number)=>Math.ceil(s/FIXED_DT-1e-9);
const dist=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const bearing=(a:PointXZ,b:PointXZ)=>Math.atan2(b.x-a.x,-(b.z-a.z));
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
function pathDistance(a:PointXZ,b:PointXZ,p:PointXZ):number{
 const dx=b.x-a.x,dz=b.z-a.z,n=dx*dx+dz*dz;
 const t=n>1e-9?clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/n,0,1):0;
 return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
export function raidProfile(seed:number,id:number,temperament:PatientTraits['temperament']):RaidProfile{
 let h=Math.imul((seed^Math.imul(id+1,0x9e3779b9))>>>0,0x85ebca6b)>>>0;h=(h^(h>>>16))>>>0;
 const u=(h&255)/255,aggressive=temperament==='impulsive',cautious=temperament==='hesitant';
 return Object.freeze({patience:(aggressive?.32:cautious?.70:.48)+u*.18,risk:(aggressive?.78:cautious?.26:.48)+(((h>>>8)&255)/255-.5)*.10,
  safeDistance:(aggressive?1.45:cautious?2.05:1.75)+u*.18,drive:.85+((h>>>10)&255)/255*.30,initiative:.86+((h>>>18)&255)/255*.28,
  openingTicks:8+((h>>>8)&63),searchPace:.65+((h>>>23)&127)/127*.35,
  counterTicks:7+((h>>>15)&7),preferredStrike:(['arm','leg','head'] as const)[(h>>>19)%3]!,side:(h&256)?1:-1});
}
/** Typical series vary with opportunity, up to eight attempts; the ceiling is only a safety bound.
 * Commitment builds heat, damage reinforces it. Heat weakens the response
 * to a visible counterattack; it never changes hit or damage authority. */
export function seriesRisk(profile:RaidProfile,rush:number):number{
 return profile.risk+(1-profile.risk)*clamp(rush,0,1)*.85;
}
export function continueSeries(profile:RaidProfile,attempts:number,rush:number,landed:boolean,target:RaidOpponent,exposure:number,bias:number):boolean{
 if(attempts>=8)return false;
 const heat=clamp(rush,0,1),danger=target.threatening&&!target.grounded;
 if(danger&&seriesRisk(profile,heat)<.48)return false;
 const value=.83+.12*profile.risk+.12*heat+.12*clamp(exposure,0,1)
  +(target.grounded?.16:0)+(target.recovering?.10:0)-(landed?0:.10)
  -.13*Math.max(0,attempts-2)-(danger?.50*(1-.85*heat):0)+clamp(bias,-.16,.16);
 return value>=.49;
}
/** Prefer the unguarded side, but avoid the attack lanes of other observed
 * patients. Geometry callbacks reject blocked routes; no hidden enemy data. */
export function approachLane(here:PointXZ,target:RaidOpponent,visible:readonly RaidOpponent[],profile:RaidProfile,side:1|-1,clear:(p:PointXZ)=>boolean):PointXZ|null{
 const angle=bearing(target,here),others=visible.filter(o=>o.id!==target.id);
 let best:PointXZ|null=null,bestScore=-Infinity;
 for(const offset of [side*.65,-side*.65,side*1.05,-side*1.05,0]){
  const a=angle+offset,r=1.35,goal={x:target.x+Math.sin(a)*r,z:target.z-Math.cos(a)*r};
  if(!clear(goal)||others.some(o=>dist(goal,o)<.85||pathDistance(here,goal,o)<.48&&dist(here,o)>.48))continue;
  // An approach through the victim itself is not a flank.
  if(pathDistance(here,goal,target)<.73)continue;
  const exposure=Math.abs(wrap(a-target.yaw))/Math.PI;
  const crowd=others.reduce((sum,o)=>sum+Math.max(0,1.6-pathDistance(here,goal,o))*(o.threatening?1.4:1),0);
  const score=(target.grounded?0:exposure*(1.4-profile.risk*.5))-dist(here,goal)*.32-crowd*.9+(offset*side>0?.09:0);
  if(score>bestScore){bestScore=score;best=goal;}
 }
 return best;
}
export function withdrawalLane(here:PointXZ,threats:readonly PointXZ[],profile:RaidProfile,clear:(p:PointXZ)=>boolean):PointXZ|null{
 if(!threats.length)return null;
 const start=Math.min(...threats.map(t=>dist(here,t)));
 let best:PointXZ|null=null,score=-Infinity;
 for(let i=0;i<12;i++)for(const r of [1.1,1.8,2.4]){
  const a=i*Math.PI/6+profile.side*.11,goal={x:here.x+Math.sin(a)*r,z:here.z-Math.cos(a)*r};
  if(!clear(goal)||threats.some(t=>dist(goal,t)<.85||pathDistance(here,goal,t)<Math.min(.72,dist(here,t))-.04))continue;
  const safety=Math.min(...threats.map(t=>dist(goal,t)));
  if(safety<start+.20)continue;
  const value=Math.min(safety,profile.safeDistance+.45)*1.8-r*.22;
  if(value>score){score=value;best=goal;}
 }
 return best;
}
/** Stateful tactical episode, not a time-indexed attack script. Timeouts
 * only bound failed approaches. Contact and damage remain outside this module. */
export class RaidState{
 readonly profile:RaidProfile;
 private phase:RaidPhase='search';private targetId:number|null=null;private goal:PointXZ|null=null;
 private since=0;private deadline=0;private retry=0;private attempts=0;private side:1|-1;private remembered:PointXZ|null=null;
 private lastTarget:number|null=null;private approachPreference=0;
 private hits=0;private rush=0;private landed=false;private bias=0;private rng:number;
 constructor(private readonly seed:number,private readonly id:number,temperament:PatientTraits['temperament']){
  this.profile=raidProfile(seed,id,temperament);this.side=this.profile.side;
  this.rng=(seed^Math.imul(id+1,0x27d4eb2d)^0x6b932a11)>>>0;
 }
 private random():number{
  this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;
  return this.rng/4294967296;
 }
 private clearSeries(){this.attempts=0;this.hits=0;this.rush=0;this.landed=false;this.bias=0;}
 private enter(phase:RaidPhase,tick:number,seconds:number,goal:PointXZ|null=null){this.phase=phase;this.since=tick;this.deadline=tick+ticks(seconds);this.goal=goal;this.retry=tick;}
 reset(tick:number){this.enter('search',tick,0);this.targetId=null;this.clearSeries();this.remembered=null;}
 lockedTarget():number|undefined{return this.phase==='flank'||this.phase==='rush'||this.phase==='attack'?this.targetId??undefined:undefined;}
 reconsider():boolean{return this.phase==='search'||this.phase==='observe'||this.phase==='reassess';}
 targetPenalty(id:number):number{
  const h=Math.imul((this.seed^Math.imul(this.id+1,0x7feb352d)^Math.imul(id+1,0x9e3779b9))>>>0,0x85ebca6b);
  const preference=((h^(h>>>16))&255)/255;
  return (this.reconsider()&&id===this.lastTarget?.22:0)+preference*.24;
 }
 strikePreference(kind:StrikeKind):number{return kind===this.profile.preferredStrike?.14:0;}
 committed(tick:number,targetId:number){
  if(this.targetId!==targetId||this.phase!=='rush'&&this.phase!=='attack')return;
  this.attempts++;this.landed=false;this.rush=clamp(this.rush+.14*this.profile.drive,0,1);
  // One stable willingness sample per committed attack; no per-tick rerolls.
  this.bias=(this.random()-.5)*.32;
  if(this.phase!=='attack')this.enter('attack',tick,10.8);
 }
 damagedTarget(targetId:number,companion=false):void{
  if(this.phase!=='attack'||this.targetId!==targetId&&!companion||!this.attempts||this.landed)return;
  this.landed=true;this.hits++;this.rush=clamp(this.rush+.12*this.profile.drive,0,1);
 }
 private withdraw(tick:number){this.lastTarget=this.targetId;this.side=this.side===1?-1:1;this.enter('withdraw',tick,2.1);}
 private finish(tick:number,threatened:boolean){
  if(threatened){this.withdraw(tick);return;}
  // Ending a series is not an instruction to take a backward step.
  this.lastTarget=this.targetId;this.side=this.side===1?-1:1;
  this.enter('reassess',tick,this.profile.patience*.7);
 }
 private intent(goal:PointXZ|null,pace:number,sprint:boolean,attack:boolean):RaidIntent{return {phase:this.phase,goal,pace,sprint,attack};}
 advance(i:RaidInput):RaidIntent{
  const {tick,here,target,visible,strike,interrupted,ready,clear}=i;
  // Low-endurance last stand has a bounded offensive series, never a
  // fresh retreat cycle. Hysteria commits all eight attempts if reachable,
  // even against telegraphs. Physical interruption still belongs to IK.
  if(i.defiant){
   if(!target){if(strike==='idle')this.reset(tick);return this.intent(null,0,false,false);}
   const d=dist(here,target);
   if(this.targetId!==target.id){this.clearSeries();this.targetId=target.id;this.enter('attack',tick,10.8);}
   if(strike!=='idle')return this.intent(target,d>.72?.65:0,false,false);
   if(this.phase==='reassess'){
    if(tick<this.deadline)return this.intent(null,0,false,false);
    this.clearSeries();this.enter('attack',tick,10.8);
   }
   if(this.attempts>=8||(!i.hysterical&&this.attempts>0&&!continueSeries(this.profile,this.attempts,this.rush,this.landed,{...target,threatening:false},1,this.bias))){
    this.enter('reassess',tick,i.hysterical?.12:.30);return this.intent(null,0,false,false);
   }
   if(this.phase!=='attack')this.enter('attack',tick,10.8);
   return this.intent(target,d>.60?1:0,d>1.6,true);
  }
  if(target&&target.id===this.targetId)this.remembered={x:target.x,z:target.z};
  const active=strike!=='idle',danger=visible.filter(o=>!o.grounded&&dist(here,o)<1.45&&(o.threatening||dist(here,o)<.95));
  const close=visible.filter(o=>dist(here,o)<1.35);
  // Two adjacent opponents can lie along one swing. Keep pincer/third
  // party avoidance, but do not categorically abort a committed sweep.
  const sharedLane=close.length===2&&dist(close[0]!,close[1]!)<.65&&Math.abs(wrap(bearing(here,close[0]!)-bearing(here,close[1]!)))<.85&&!close.some(o=>o.threatening);
  const crowded=close.length>=2&&!sharedLane;
  // The candidate selected this tick is already our intended opponent,
  // even before observe acquires its ID. Do not mistake it for a third
  // party. Close telegraphed attacks are still handled in observe/rush
  // and the situation-dependent series evaluation.
  const intendedTarget=target?.id??this.targetId;
  const counter=!!target&&!target.grounded&&target.threatening&&dist(here,target)<1.45;
  if(this.phase!=='withdraw'&&(crowded||interrupted||danger.some(o=>o.id!==intendedTarget)&&!active&&!sharedLane||this.phase==='reassess'&&counter))this.withdraw(tick);
  if(this.phase==='attack'&&this.attempts>0&&(strike==='recover'||!active)){
   const exposure=target?Math.abs(wrap(bearing(target,here)-target.yaw))/Math.PI:0;
   if(!target||target.id!==this.targetId||dist(here,target)>1.45||tick>=this.deadline||!continueSeries(this.profile,this.attempts,this.rush,this.landed,target,exposure,this.bias))this.finish(tick,counter);
  }
  if(this.phase==='withdraw'){
   const threats:PointXZ[]=visible.length?[...visible]:this.remembered?[this.remembered]:[];
   const safe=threats.every(t=>dist(here,t)>=this.profile.safeDistance);
   if(!active&&(safe&&tick-this.since>=ticks(.35)||tick>=this.deadline)){
    this.targetId=null;this.clearSeries();this.enter('reassess',tick,this.profile.patience*.7);
    return this.intent(null,0,false,false);
   }
   if(tick>=this.retry||this.goal&&!clear(this.goal)){
    this.goal=withdrawalLane(here,threats,this.profile,clear);this.retry=tick+12;
   }
   return this.intent(this.goal,1,true,false);
  }
  if(this.phase==='reassess'){
   if(active||tick<this.deadline)return this.intent(null,0,false,false);
   this.reset(tick);
  }
  if(!target){
   if(this.targetId!==null&&(this.phase==='attack'||this.phase==='rush')){
    this.finish(tick,false);return this.intent(null,0,false,false);
   }
   this.reset(tick);return this.intent(null,0,false,false);
  }
  const d=dist(here,target),exposure=Math.abs(wrap(bearing(target,here)-target.yaw));
  if(this.targetId!==target.id){
   this.targetId=target.id;this.remembered={x:target.x,z:target.z};this.clearSeries();
   this.approachPreference=this.random();
   this.enter('observe',tick,this.profile.patience*(.85+this.approachPreference*.30));
  }
  if(active)return this.intent(target,d>.72?.5+.4*this.rush:0,false,false);
  if(this.phase==='observe'){
   // Close threat triggers separation instead of a stationary face-off.
   if(d<.85&&target.threatening&&this.profile.risk<.5){this.withdraw(tick);return this.advance(i);}
   if(tick<this.deadline)return this.intent(null,0,false,false);
   if(target.grounded||d<1.12||exposure>1.15+(this.approachPreference-.5)*.55&&d<2.6){this.enter('rush',tick,1.8*this.profile.initiative);}
   else this.enter('flank',tick,1.35*this.profile.initiative);
  }
  if(this.phase==='flank'){
   if(tick>=this.retry||this.goal&&!clear(this.goal)){this.goal=approachLane(here,target,visible,this.profile,this.side,clear);this.retry=tick+15;}
   if(d<1.10||target.grounded||exposure>1.10&&d<2.4||this.goal&&dist(here,this.goal)<.28||tick>=this.deadline){
    // Do not charge through a third patient's occupied lane.
    if(visible.some(o=>o.id!==target.id&&pathDistance(here,target,o)<.65&&dist(here,o)<2)){
     this.withdraw(tick);return this.advance(i);
    }
    this.enter('rush',tick,1.8*this.profile.initiative);
   }else if(this.goal)return this.intent(this.goal,.75/this.profile.initiative,false,false);
   else return this.intent(null,0,false,false);
  }
  if(this.phase==='rush'){
   // A vulnerable moving target may need a longer straight approach.
   // Re-evaluation still occurs when a real threat appears.
   if(target.grounded&&d>1.05&&tick>=this.deadline&&tick-this.since<ticks(4.0))this.deadline=tick+ticks(.65);
   if(tick>=this.deadline||target.threatening&&d<1.15&&this.profile.risk<.4&&!ready){this.finish(tick,counter);return this.advance(i);}
   return this.intent(target,.86+.14*this.profile.searchPace,d>1.05,true);
  }
  if(this.phase==='attack'){
   if(tick>=this.deadline||d>1.45){this.finish(tick,counter);return this.advance(i);}
   return this.intent(target,d>.65?.65+.35*this.rush:0,false,true);
  }
  return this.intent(null,0,false,false);
 }
 snapshot():RaidSnapshot{return {phase:this.phase,targetId:this.targetId,goal:this.goal?{...this.goal}:null,attempts:this.attempts,hits:this.hits,rush:this.rush,profile:this.profile};}
}
