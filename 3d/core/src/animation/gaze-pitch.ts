import type {Vec3} from '../types.js';
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export const REST_GAZE_PITCH=-.14;
/** Pitch below the horizon is negative. Observe the selected capsule, not
 * hidden victim state. Pitch is advanced exactly once per fixed tick. */
export class GazePitch{
 private value=REST_GAZE_PITCH;
 get pitch(){return this.value;}
 advance(dt:number,eye:Vec3,target:Vec3|null):void{
  const desired=target?clamp(Math.atan2(target[1]-eye[1],Math.max(.08,Math.hypot(target[0]-eye[0],target[2]-eye[2]))),-1.15,.18):REST_GAZE_PITCH;
  this.value+=clamp((desired-this.value)*(1-Math.exp(-dt/.12)),-2.8*dt,2.8*dt);
 }
}
