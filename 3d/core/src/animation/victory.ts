import type {PhysicsSegmentPose,Vec3} from '../types.js';
import {crouchPunchBase} from '../combat/crouch-punch.js';

const PREPARE=13,FLIGHT=25,LAND=14;
const CYCLE=PREPARE+FLIGHT+LAND;
export const VICTORY_TICKS=3*CYCLE;
const smooth=(t:number)=>t*t*(3-2*t);
const clamp=(t:number)=>Math.max(0,Math.min(1,t));
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];

/** A post-result pose overlay. The gameplay root and debris stay on the physics timeline. */
export function victoryPose(pose:readonly PhysicsSegmentPose[],yaw:number,tick:number,ground:(x:number,z:number)=>number):readonly PhysicsSegmentPose[]{
  if(tick<=0||tick>=VICTORY_TICKS)return pose;
  const phase=tick%CYCLE;
  const flight=clamp((phase-PREPARE)/FLIGHT);
  const lift=.29*4*flight*(1-flight);
  const landing=phase-PREPARE-FLIGHT;
  const squat=phase<PREPARE
    ? .24*Math.sin(Math.PI*phase/PREPARE)**2
    : landing>0?.17*Math.sin(Math.PI*landing/LAND)**2:0;
  const base=crouchPunchBase(pose,yaw,squat,ground);

  const reach=smooth(clamp(tick/PREPARE))*smooth(clamp((VICTORY_TICKS-tick)/LAND));
  const weight=reach*(.77+.23*Math.sin(Math.PI*flight));
  const sin=Math.sin(yaw),cos=Math.cos(yaw);
  const byId=new Map(base.map(p=>[p.id,p]));
  const moved=new Map<string,PhysicsSegmentPose>();
  for(const [side,sign] of [['L',-1],['R',1]] as const){
    const upper=byId.get(side+'.upperArm'),lower=byId.get(side+'.lowerArm'),hand=byId.get(side+'.hand');
    if(!upper)continue;
    const raise=(part:PhysicsSegmentPose,origin:Vec3,targetPitch:number,targetSide:number):Vec3=>{
      const [x,y,z]=sub(part.b,part.a),length=Math.hypot(x,y,z);
      const forward=x*sin-z*cos,lateral=x*cos+z*sin;
      const startPitch=Math.atan2(forward,-y);
      const target=startPitch+Math.atan2(Math.sin(targetPitch-startPitch),Math.cos(targetPitch-startPitch));
      const pitch=startPitch+(target-startPitch)*weight;
      const sideways=lateral+(length*targetSide-lateral)*weight;
      const projected=Math.sqrt(Math.max(0,length**2-sideways**2));
      const forwardRaised=Math.sin(pitch)*projected;
      return add(origin,[sin*forwardRaised+cos*sideways,-Math.cos(pitch)*projected,-cos*forwardRaised+sin*sideways]);
    };
    const elbow=raise(upper,upper.a,2.68,sign*.32);
    moved.set(upper.id,{...upper,b:elbow});
    if(!lower)continue;
    const wrist=raise(lower,elbow,2.97,sign*.19);
    moved.set(lower.id,{...lower,a:elbow,b:wrist});
    if(hand){
      const shift=sub(wrist,lower.b);
      moved.set(hand.id,{...hand,a:add(hand.a,shift),b:add(hand.b,shift)});
    }
  }
  const offset:Vec3=[0,lift,0];
  return base.map(part=>{
    const p=moved.get(part.id)??part;
    return {...p,a:add(p.a,offset),b:add(p.b,offset)};
  });
}
