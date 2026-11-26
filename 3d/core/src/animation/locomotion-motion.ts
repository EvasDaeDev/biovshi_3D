import {BASE_MOTION_PROFILE,type MotionProfile} from './motion-profile.js';
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const follow=(x:number,target:number,dt:number,tau:number)=>x+(target-x)*(1-Math.exp(-dt/tau));
/** Deterministic secondary motion driven by support and stride, never
 * independent joint noise. All values advance only at fixed ticks. */
export class LocomotionMotion {
 constructor(private readonly profile:MotionProfile=BASE_MOTION_PROFILE){}
 private prepared=-1;
 private elapsed=0;
 private drive=0;
 private pelvis=0;
 private chest=0;
 private arms=0;
 private weight=0;
 private inertia=0;
 /** The future supporting foot is loaded before the other foot lifts. */
 prepare(swing:0|1,dt:number):boolean{
  if(this.prepared!==swing){this.prepared=swing;this.elapsed=0;}
  this.elapsed+=dt;
  return this.elapsed>=.085;
 }
 clearPreparation():void{this.prepared=-1;this.elapsed=0;}
 advance(dt:number,speed:number,phase:number,support:-1|0|1):void{
  const drive=clamp(speed/.9,-1,1);
  this.drive=follow(this.drive,drive,dt,.13);
  this.inertia=follow(this.inertia,clamp(drive-this.drive,-1,1),dt,.09);
  const stride=clamp(phase,-1,1)*Math.min(1,Math.abs(speed)/.9);
  this.pelvis=follow(this.pelvis,stride,dt,.055);
  this.chest=follow(this.chest,this.pelvis,dt,.12*this.profile.lag);
  this.arms=follow(this.arms,this.chest,dt,.17*this.profile.lag);
  this.weight=follow(this.weight,support,dt,.12);
 }
 get sample(){return {drive:this.drive,pelvis:this.pelvis,chest:this.chest,arms:this.arms,weight:this.weight,inertia:this.inertia};}
}
/** Subtle side-to-side asymmetry; no random changes to a planted foot. */
export function organicSwing(side:0|1,swing:number,lift:number,asymmetry=1){
 const sign=side===0?1:-1;
 return {duration:swing*(1+sign*.035*asymmetry),lift:lift*(1-sign*.06*asymmetry)};
}
