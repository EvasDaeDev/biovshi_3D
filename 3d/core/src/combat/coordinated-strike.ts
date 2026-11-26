import {counterArms} from '../animation/body-compensation.js';
import type {Vec3,PhysicsSegmentPose} from '../types.js';
import type {Punch} from './strike.js';
import type {AuthoredMotion} from '../rig/authored-motion.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mid=(p:PhysicsSegmentPose):Vec3=>[(p.a[0]+p.b[0])*.5,(p.a[1]+p.b[1])*.5,(p.a[2]+p.b[2])*.5];
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const yaw=(v:Vec3,a:number):Vec3=>[v[0]*Math.cos(a)+v[2]*Math.sin(a),v[1],-v[0]*Math.sin(a)+v[2]*Math.cos(a)];
const pitch=(v:Vec3,a:number):Vec3=>[v[0],v[1]*Math.cos(a)-v[2]*Math.sin(a),v[1]*Math.sin(a)+v[2]*Math.cos(a)];
/** Coherent torso turn. The abdomen starts at its original attachment;
 * the chest and all upper descendants follow the same rigid transform.
 * Kick pelvis is reconnected to the legs by the shared support IK. */
export function coordinatedStrikeBody(pose:readonly PhysicsSegmentPose[],p:Punch,amount:number,motion:AuthoredMotion):readonly PhysicsSegmentPose[]{
 if(amount===0)return pose;
 const hip=pose.find(v=>v.id==='pelvis'),abdomen=pose.find(v=>v.id==='abdomen'),chest=pose.find(v=>v.id==='chest');
 if(!hip||!abdomen||!chest)return pose;
 const kind=p.kind??'arm',side=p.side==='L'?-1:1;
 const slot=kind==='leg'?'kick':kind==='head'?'headbutt':'punch';
 const reference=motion[slot]?.get(kind==='leg'?'pelvis':'chest');
 const axis=reference?sub(reference.b,reference.a):[1,0,0];
 const authoredTurn=Math.abs(Math.atan2(axis[2]!,axis[0]!));
 const turn=side*amount*Math.min(.65,.32+authoredTurn*.35);
 const pivot=kind==='leg'?mid(hip):abdomen.a;
 const shoulder=pose.find(v=>v.id===p.side+'.upperArm')?.a??mid(chest);
 // Low arm attacks bend toward a real target; no scaling of reach.
 const low=kind==='arm'?clamp((shoulder[1]-p.aim[1]-.35)*.55,0,.48):0;
 // Real shoulder advancement for a punch; counter-lean against the
 // extended kicking leg. No change to bone lengths or damage reach.
 const bend=amount*(kind==='head'?-.26:kind==='arm'?-.22-low:.20);
 const baseYaw=kind==='leg'?turn:kind==='head'?side*amount*.08:turn*.45;
 const body=(point:Vec3):Vec3=>{
  const local=yaw(sub(point,pivot),p.yaw);
  return add(pivot,yaw(yaw(pitch(local,bend),-p.yaw),baseYaw));
 };
 const chestCenter=body(mid(chest));
 const upper=(point:Vec3):Vec3=>add(chestCenter,yaw(sub(body(point),chestCenter),kind==='leg'?-turn*.55:kind==='arm'?turn*.55:0));
 const moved=pose.map(v=>{
  if(kind==='leg'&&v.id==='pelvis')return {...v,a:body(v.a),b:body(v.b)};
  if(v.id==='abdomen')return {...v,a:body(v.a),b:body(v.b)};
  if(v.id==='chest'||v.id==='neck'||v.id==='head'||/Arm$|hand$/.test(v.id))return {...v,a:upper(v.a),b:upper(v.b)};
  return v;
 });
 return counterArms(moved,kind,p.side,p.yaw,amount);
}
