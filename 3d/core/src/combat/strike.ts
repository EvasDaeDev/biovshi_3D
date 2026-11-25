import {coordinatedStrikeBody} from './coordinated-strike.js';
import {strikeBody,type AuthoredMotion} from '../rig/authored-motion.js';
import type { Vec3,PhysicsSegmentPose } from '../types.js';
import { FIXED_DT } from '../fixed-clock.js';
import { proneStrikePose } from './prone-strike.js';
import { extraStrikePose } from './extra-strikes.js';
import { solveTwoBone } from '../rig/two-bone.js';
export const STRIKE=Object.freeze({windup:.32,thrust:.20,recover:.26,cooldown:.90});
const ticks=(s:number)=>Math.ceil(s/FIXED_DT-1e-9);
const W=ticks(STRIKE.windup),T=ticks(STRIKE.thrust),R=ticks(STRIKE.recover),C=ticks(STRIKE.cooldown);
const smooth=(t:number)=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v);};
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export type StrikePhase='idle'|'windup'|'thrust'|'recover';
export type StrikeKind='arm'|'leg'|'head';
export interface Punch {readonly kind?:StrikeKind;readonly prone?:boolean;readonly side:'L'|'R';readonly targetId:number;readonly aim:Vec3;readonly start:number;readonly yaw:number;readonly targetSegment?:string}
export interface StrikeSnapshot {readonly phase:StrikePhase;readonly kind?:StrikeKind;readonly prone?:boolean;readonly source:string|null;readonly targetId:number|null;readonly resolved:boolean}
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
export class StrikeState{
 private current:Punch|null=null;private last=-Infinity;private done=false;private sequence=0;
 get attempts():number{return this.sequence;}
 ready(tick:number):boolean{return !this.current&&tick-this.last>=C;}
 get punch():Punch|null{return this.current;}
 phase(tick:number):StrikePhase{
  if(!this.current)return 'idle';
  const age=tick-this.current.start;
  return age<W?'windup':age<W+T?'thrust':age<W+T+R?'recover':'idle';
 }
 advance(tick:number,allowed:boolean,ids:readonly string[]):void{
  if(this.current&&(!allowed||!usableStrike(ids,this.current.kind??'arm',this.current.side)||this.phase(tick)==='idle'))this.current=null;
 }
 start(tick:number,side:'L'|'R',targetId:number,aim:Vec3,yaw:number,targetSegment?:string,kind:StrikeKind='arm',prone=false):boolean{
  if(this.current||tick-this.last<C)return false;
  this.current={side,kind,prone,targetId,aim:[...aim],start:tick,yaw,...(targetSegment===undefined?{}:{targetSegment})};this.last=tick;this.done=false;this.sequence++;return true;
 }
 /** Track the target only during preparation; commit the aim for thrust. */
 track(tick:number,aim:Vec3):void{
  if(this.current&&this.phase(tick)==='windup')this.current={...this.current,aim:[...aim]};
 }
 get resolved():boolean{return this.done;}
 resolve():void{this.done=true;}
 snapshot(tick:number):StrikeSnapshot{return {phase:this.phase(tick),kind:this.current?.kind??'arm',prone:this.current?.prone??false,source:this.current?strikeSource(this.current.kind??'arm',this.current.side):null,targetId:this.current?.targetId??null,resolved:this.current!==null&&this.done};}
}
/** The actual rendered forearm and hand are the attacking geometry.
 * Preserve girdle attachment and nominal bone lengths. Aim is locked at start. */
export function punchPose(pose:readonly PhysicsSegmentPose[],punch:Punch,tick:number,ground:(x:number,z:number)=>number=()=>0,motion?:AuthoredMotion):readonly PhysicsSegmentPose[]{
 const age=tick-punch.start;if(age<0||age>=W+T+R||age===0)return pose;
 if(punch.prone)return proneStrikePose(pose,punch,age<W?'windup':age<W+T?'thrust':'recover',age<W?smooth(age/W):age<W+T?smooth((age-W+1)/T):smooth((age-W-T)/R),ground);
 const coordinated=!!motion?.stalk;
 const phase=age<W?'windup':age<W+T?'thrust':'recover';
 const progress=age<W?smooth(age/W):age<W+T?smooth((age-W+1)/T):smooth((age-W-T)/R);
 const load=phase==='windup'?progress:phase==='recover'?1-progress:1;
 if(motion){
  const amount=age<W?-.32*smooth(age/W):age<W+T?-.32+1.32*smooth((age-W+1)/T):1-smooth((age-W-T)/R);
  pose=coordinated?coordinatedStrikeBody(pose,punch,amount,motion):strikeBody(pose,punch.kind==='leg'?'kick':punch.kind==='head'?'headbutt':'punch',punch.side,amount,motion);
 }
 if(punch.kind&&punch.kind!=='arm')return extraStrikePose(pose,punch,phase,progress,ground,coordinated?load:1);
 const key=punch.side+'.',u=pose.find(p=>p.id===key+'upperArm'),l=pose.find(p=>p.id===key+'lowerArm'),h=pose.find(p=>p.id===key+'hand');
 if(!u||!l)return pose;
 const a=u.a,back:Vec3=[a[0]-Math.sin(punch.yaw)*.13,a[1]-.25,a[2]+Math.cos(punch.yaw)*.13];
 const base=l.b;
 const target=age<W?mix(base,back,smooth(age/W)):age<W+T?mix(back,punch.aim,smooth((age-W+1)/T)):mix(punch.aim,base,smooth((age-W-T)/R));
 if(age===0)return pose;
 const strikePole:Vec3=[Math.cos(punch.yaw)*(punch.side==='L'?-1:1),-.65,Math.sin(punch.yaw)*(punch.side==='L'?-1:1)];
 const basePole:Vec3=[u.b[0]-u.a[0],u.b[1]-u.a[1],u.b[2]-u.a[2]];
 const pole=coordinated?mix(basePole,strikePole,load):strikePole;
 const ik=solveTwoBone(a,target,.36,.32,pole);
 const end=ik.end;
 return pose.map(p=>p.id===u.id?{...p,b:ik.joint}:p.id===l.id?{...p,a:ik.joint,b:end}:h&&p.id===h.id?{...p,a:end,b:end}:p);
}
