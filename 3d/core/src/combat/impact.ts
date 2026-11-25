import {ImpactMotion} from '../animation/impact-motion.js';
import type { Vec3 } from '../types.js';
import { FIXED_DT } from '../fixed-clock.js';
export const IMPACT=Object.freeze({duration:.52,limbSpeed:.34,centralSpeed:.49,decay:7.5});
const ticks=Math.ceil(IMPACT.duration/FIXED_DT);
export class ImpactState {
 private remaining=0;private vx=0;private vz=0;
 private motion=new ImpactMotion();
 get reaction(){return this.motion.sample;}
 hit(segment:string,dx:number,dz:number,critical=false):void{
  this.motion.hit(segment,dx,dz,critical);
  const n=Math.hypot(dx,dz)||1,speed=['head','neck','pelvis','abdomen','chest'].includes(segment)?IMPACT.centralSpeed:IMPACT.limbSpeed;
  this.remaining=ticks;this.vx=dx/n*speed;this.vz=dz/n*speed;
 }
 get active():boolean{return this.remaining>0;}
 get slow():number{const t=1-this.remaining/ticks;return .18+.82*t*t*(3-2*t);}
 advance(dt:number):Vec3{
  this.motion.advance(dt);
  if(!this.active)return [0,0,0];
  const p:Vec3=[this.vx*dt,0,this.vz*dt],decay=Math.exp(-dt*IMPACT.decay);
  this.vx*=decay;this.vz*=decay;this.remaining--;
  return p;
 }
 clear():void{this.motion.clear();this.remaining=0;this.vx=0;this.vz=0;}
 snapshot(){return {active:this.active,remainingSeconds:this.remaining*FIXED_DT,slow:this.slow};}
}
