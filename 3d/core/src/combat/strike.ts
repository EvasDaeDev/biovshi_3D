import {clampStrikeAim,strikeBearing} from './strike-sector.js';
import {compensateHead} from '../animation/body-compensation.js';
import {lowTargetAmount,strikeTrajectory} from './strike-trajectory.js';
import {coordinatedStrikeBody} from './coordinated-strike.js';
import {strikeBody,type AuthoredMotion} from '../rig/authored-motion.js';
import type { Vec3,PhysicsSegmentPose } from '../types.js';
import { FIXED_DT } from '../fixed-clock.js';
import { proneStrikePose } from './prone-strike.js';
import { extraStrikePose } from './extra-strikes.js';
import {authoredArmStrike} from '../rig/arm-strike-ik.js';
import { solveTwoBone } from '../rig/two-bone.js';
export const STRIKE=Object.freeze({windup:.32,thrust:.20,recover:.26,cooldown:.90});
const ticks=(s:number)=>Math.ceil(s/FIXED_DT-1e-9);
const W=ticks(STRIKE.windup),T=ticks(STRIKE.thrust),R=ticks(STRIKE.recover),C=ticks(STRIKE.cooldown);
const smooth=(t:number)=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v);};
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export type StrikePhase='idle'|'windup'|'thrust'|'recover';
export type StrikeKind='arm'|'leg'|'head';
const CANCEL_TICKS=ticks(.24);
export interface StrikeVisual {readonly punch:Punch;readonly tick:number;readonly weight:number}
export interface StrikeChannel {readonly side:'L'|'R';readonly kind:'arm'|'leg';readonly targetId:number;readonly aim:Vec3;readonly targetSegment?:string}
export interface Punch {readonly secondary?:StrikeChannel;readonly kind?:StrikeKind;readonly prone?:boolean;readonly side:'L'|'R';readonly targetId:number;readonly aim:Vec3;readonly start:number;readonly yaw:number;readonly targetSegment?:string;readonly tempo?:number}
export interface StrikeSnapshot {readonly phase:StrikePhase;readonly kind?:StrikeKind;readonly prone?:boolean;readonly source:string|null;readonly targetId:number|null;readonly resolved:boolean;readonly hitIds?:readonly number[];readonly targetIds?:readonly number[];readonly secondarySource?:string}
export function usableArm(ids:readonly string[],side:'L'|'R'):boolean{
 return ids.includes('chest')&&ids.includes(side+'.upperArm')&&ids.includes(side+'.lowerArm');
}
export function usableStrike(ids:readonly string[],kind:StrikeKind,side:'L'|'R'):boolean{
 if(kind==='arm')return usableArm(ids,side);
 if(kind==='head')return ['chest','neck','head'].every(id=>ids.includes(id));
 return ids.includes('pelvis')&&['L','R'].every(s=>['upperLeg','lowerLeg','foot'].every(part=>ids.includes(s+'.'+part)));
}
export function strikeSource(kind:StrikeKind,side:'L'|'R'):string{return kind==='head'?'head':side+(kind==='leg'?'.foot':'.lowerArm');}
export function strikeOrigin(kind:StrikeKind,side:'L'|'R'):string{return kind==='head'?'neck':side+(kind==='leg'?'.upperLeg':'.upperArm');}
/** A grounded dual attack always leaves a leg available for support.
 * The primary must own the kick when present, so locomotion sees it. */
export function compatibleChannels(primary:Pick<Punch,'kind'|'side'|'targetId'|'prone'>,secondary:StrikeChannel):boolean{
 const kind=primary.kind??'arm';
 return !primary.prone&&secondary.targetId!==primary.targetId&&secondary.kind==='arm'&&(kind==='leg'||kind==='arm'&&primary.side!==secondary.side);
}
export function strikeChannels(p:Punch):readonly Punch[]{
 if(!p.secondary)return [p];
 const {secondary,...primary}=p;
 return [primary,{...secondary,start:p.start,yaw:p.yaw,...(p.tempo===undefined?{}:{tempo:p.tempo})}];
}
const sourcesUsable=(p:Punch,ids:readonly string[])=>strikeChannels(p).every(c=>usableStrike(ids,c.kind??'arm',c.side));
export class StrikeState{
 private current:Punch|null=null;private last=-Infinity;private done=false;private sequence=0;
 private contacted=new Set<number>();
 private cancelled:{punch:Punch;tick:number}|null=null;
 constructor(private readonly tempo=1){}
 get cooldownTicks():number{return Math.ceil(C*this.tempo-1e-9);}
 get attempts():number{return this.sequence;}
 ready(tick:number):boolean{return !this.current&&tick-this.last>=this.cooldownTicks&&(!this.cancelled||tick>=this.cancelled.tick+CANCEL_TICKS);}
 get punch():Punch|null{return this.current;}
 phase(tick:number):StrikePhase{
  if(!this.current)return 'idle';
  const age=(tick-this.current.start)/(this.current.tempo??1);
  return age<W?'windup':age<W+T?'thrust':age<W+T+R?'recover':'idle';
 }
 /** Cancel combat authority immediately; optionally retain an inert visual
  * sample. The sample has no target tracking or swept-contact authority. */
 advance(tick:number,allowed:boolean,ids:readonly string[],fade=false):void{
  if(this.cancelled&&(tick>=this.cancelled.tick+CANCEL_TICKS||!sourcesUsable(this.cancelled.punch,ids)))this.cancelled=null;
  if(this.current&&(!allowed||!sourcesUsable(this.current,ids)||this.phase(tick)==='idle')){
   if(fade&&!this.current.prone&&this.phase(tick)!=='idle'&&sourcesUsable(this.current,ids))
    this.cancelled={punch:this.current,tick};
   this.current=null;
  }
 }
 visual(tick:number):StrikeVisual|null{
  if(this.current)return {punch:this.current,tick,weight:1};
  if(!this.cancelled||tick>=this.cancelled.tick+CANCEL_TICKS)return null;
  return {punch:this.cancelled.punch,tick:this.cancelled.tick,weight:1-smooth((tick-this.cancelled.tick)/CANCEL_TICKS)};
 }
 start(tick:number,side:'L'|'R',targetId:number,aim:Vec3,yaw:number,targetSegment?:string,kind:StrikeKind='arm',prone=false,secondary?:StrikeChannel):boolean{
  if(!this.ready(tick)||secondary&&!compatibleChannels({side,kind,targetId,prone},secondary))return false;
  this.cancelled=null;
  this.current={side,kind,prone,targetId,aim:[...aim],start:tick,yaw,...(secondary?{secondary:{...secondary,aim:[...secondary.aim] as Vec3}}:{}),...(this.tempo===1?{}:{tempo:this.tempo}),...(targetSegment===undefined?{}:{targetSegment})};this.last=tick;this.done=false;this.contacted.clear();this.sequence++;return true;
 }
 /** Track the target only during preparation; commit the aim for thrust. */
 track(tick:number,aim:Vec3,targetId?:number):void{
  if(!this.current||this.phase(tick)!=='windup')return;
  if(targetId===undefined||targetId===this.current.targetId)this.current={...this.current,aim:[...aim]};
  else if(this.current.secondary?.targetId===targetId)this.current={...this.current,secondary:{...this.current.secondary,aim:[...aim]}};
 }
 get resolved():boolean{return this.done;}
 get multiTarget():boolean{return !!this.current?.secondary;}
 get exhausted():boolean{return !this.current||this.contacted.size>=(this.multiTarget?2:1)||this.done&&!this.multiTarget;}
 canContact(id:number):boolean{return !!this.current&&!this.exhausted&&!this.contacted.has(id)&&(id===this.current.targetId||id===this.current.secondary?.targetId);}
 resolveTarget(id:number):boolean{if(!this.canContact(id))return false;this.contacted.add(id);this.done=true;return true;}
 resolve():void{if(this.current)for(const p of strikeChannels(this.current))this.contacted.add(p.targetId);this.done=true;}
 snapshot(tick:number):StrikeSnapshot{return {phase:this.phase(tick),kind:this.current?.kind??'arm',prone:this.current?.prone??false,source:this.current?strikeSource(this.current.kind??'arm',this.current.side):null,targetId:this.current?.targetId??null,resolved:this.current!==null&&this.done,...(this.current&&this.multiTarget?{hitIds:[...this.contacted],targetIds:strikeChannels(this.current).map(p=>p.targetId),secondarySource:strikeSource(this.current.secondary!.kind,this.current.secondary!.side)}:{})};}
}
/** The actual rendered forearm and hand are the attacking geometry.
 * Preserve girdle attachment and nominal bone lengths. Aim is locked at start. */
export function punchPose(pose:readonly PhysicsSegmentPose[],punch:Punch,tick:number,ground:(x:number,z:number)=>number=()=>0,motion?:AuthoredMotion,weight=1,supportPlant?:Vec3,bodyAlreadyCoordinated=false):readonly PhysicsSegmentPose[]{
 weight=Math.max(0,Math.min(1,weight));if(weight===0)return pose;
 const age=(tick-punch.start)/(punch.tempo??1);if(age<0||age>=W+T+R||age===0)return pose;
 if(punch.prone)return proneStrikePose(pose,punch,age<W?'windup':age<W+T?'thrust':'recover',age<W?smooth(age/W):age<W+T?smooth((age-W+1)/T):smooth((age-W-T)/R),ground);
 const coordinated=!!motion?.stalk;
 if(coordinated&&punch.kind!=='head')punch={...punch,aim:clampStrikeAim(pose,punch.aim,punch.yaw),...(punch.secondary?{secondary:{...punch.secondary,aim:clampStrikeAim(pose,punch.secondary.aim,punch.yaw)}}:{})};
 const headReference=coordinated&&!bodyAlreadyCoordinated&&punch.kind!=='head'?pose.find(p=>p.id==='head')?.a:undefined;
 const stabilized=(parts:readonly PhysicsSegmentPose[])=>headReference?compensateHead(parts,headReference,.78):parts;
 const phase=age<W?'windup':age<W+T?'thrust':'recover';
 const progress=age<W?smooth(age/W):age<W+T?smooth((age-W+1)/T):smooth((age-W-T)/R);
 const load=phase==='windup'?progress:phase==='recover'?1-progress:1;
 if(motion&&!bodyAlreadyCoordinated){
  const amount=age<W?-.32*smooth(age/W):age<W+T?-.32+1.32*smooth((age-W+1)/T):1-smooth((age-W-T)/R);
  pose=coordinated?coordinatedStrikeBody(pose,punch,amount*weight,motion):strikeBody(pose,punch.kind==='leg'?'kick':punch.kind==='head'?'headbutt':'punch',punch.side,amount,motion);
 }
 // Both arm chains are solved against the same shared torso. For a
 // mixed attack, solve the arm before the kick's support/COM correction.
 if(coordinated&&punch.secondary&&!bodyAlreadyCoordinated){
  const [primary,secondary]=strikeChannels(punch);
  const other=punchPose(pose,secondary!,tick,ground,motion,weight,undefined,true);
  return stabilized(punchPose(other,primary!,tick,ground,motion,weight,supportPlant,true));
 }
 if(punch.kind&&punch.kind!=='arm')return stabilized(extraStrikePose(pose,punch,phase,progress,ground,coordinated?load*weight:1,coordinated,weight,supportPlant));
 const key=punch.side+'.',u=pose.find(p=>p.id===key+'upperArm'),l=pose.find(p=>p.id===key+'lowerArm'),h=pose.find(p=>p.id===key+'hand');
 if(!u||!l)return pose;
 const a=u.a,low=coordinated?lowTargetAmount(punch.aim,ground):0;
 const aimYaw=coordinated?punch.yaw+strikeBearing(pose,punch.aim,punch.yaw):punch.yaw;
 const back:Vec3=[a[0]-Math.sin(aimYaw)*.13,a[1]-.25+.24*low,a[2]+Math.cos(aimYaw)*.13];
 const base=l.b;
 const aim:Vec3=coordinated?[punch.aim[0],Math.max(punch.aim[1],ground(punch.aim[0],punch.aim[2])+Math.max(l.radius,h?.radius??0)),punch.aim[2]]:punch.aim;
 const rawTarget=coordinated?strikeTrajectory(base,back,aim,phase,progress,low,'arm',aimYaw,punch.side):age<W?mix(base,back,smooth(age/W)):age<W+T?mix(back,aim,smooth((age-W+1)/T)):mix(aim,base,smooth((age-W-T)/R));
 const target=weight===1?rawTarget:mix(base,rawTarget,weight);
 if(age===0)return pose;
 const strikePole:Vec3=[Math.cos(punch.yaw)*(punch.side==='L'?-1:1),-.65,Math.sin(punch.yaw)*(punch.side==='L'?-1:1)];
 const ik=coordinated?authoredArmStrike(u,l,target,punch.yaw,punch.side,load*weight):solveTwoBone(a,target,.36,.32,strikePole);
 const end=ik.end;
 return stabilized(pose.map(p=>p.id===u.id?{...p,b:ik.joint}:p.id===l.id?{...p,a:ik.joint,b:end}:h&&p.id===h.id?{...p,a:end,b:end}:p));
}
