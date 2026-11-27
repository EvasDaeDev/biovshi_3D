import {poseJointAnchor,poseRotation} from './pose-joints.js';
import type {Vec3} from '../types.js';
import {LAB_SEGMENTS} from './anatomy.js';
import {buildEditedPose,referencePose,type PoseDocument,type PoseSegment,type PoseSlot} from './pose-editor.js';
import {PATIENT_SCALE} from './patient-scale.js';
import type {RigPose} from './gait.js';

const plus=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const minus=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const times=(a:Vec3,k:number):Vec3=>[a[0]*k,a[1]*k,a[2]*k];
type Joint={origin:Vec3;world:(p:Vec3)=>Vec3};
interface StandingAdjustment {
 readonly spine:number;
 readonly thorax:number;
 readonly neck:number;
 readonly feet:readonly [Vec3,Vec3];
}
export type AuthoredMotion=Readonly<Partial<Record<PoseSlot,ReadonlyMap<string,RigPose>>>> & {
 readonly torso?:Readonly<Partial<Record<PoseSlot,Pick<StandingAdjustment,'spine'|'thorax'>>>>;
 readonly standing?:Readonly<Partial<Record<'stance'|'aggressive',StandingAdjustment>>>;
};

interface CompiledSlot {
 readonly pose:ReadonlyMap<string,RigPose>;
 readonly spine:number;
 readonly thorax:number;
}
function compileSlot(parts:readonly PoseSegment[]):CompiledSlot{
 const settings=new Map(parts.map(part=>[part.id,part]));
 const joints=new Map<string,Joint>(),pose=new Map<string,RigPose>();
 const rig=buildEditedPose(parts),byId=new Map(rig.map(part=>[part.id,part]));
 for(const part of rig){
  const params=settings.get(part.id)!;
  const parentId=LAB_SEGMENTS.find(def=>def.id===part.id)!.parent;
  const parent=parentId?joints.get(parentId):null;
  const origin=poseJointAnchor(part,byId);
  const local=plus(minus(origin,parent?.origin??[0,0,0]),params.offset??[0,0,0]);
  const rotate=poseRotation(params.rotation??[0,0,0]),bind=params.bindOffset??[0,0,0];
  const world=(point:Vec3):Vec3=>{
   const moved=plus(local,rotate(plus(point,bind)));return parent?parent.world(moved):moved;
  };
  joints.set(part.id,{origin,world});
  pose.set(part.id,{...part,a:times(world(minus(part.a,origin)),1/PATIENT_SCALE),b:times(world(minus(part.b,origin)),1/PATIENT_SCALE)});
 }
 const abdomen=pose.get('abdomen');
 const chest=joints.get('chest');
 // A chest capsule spans the shoulders. Rotation around that axis leaves
 // its endpoints unchanged, so recover its up axis from the editor joint.
 const chestUp=chest?minus(chest.world([0,1,0]),chest.world([0,0,0])):null;
 return {pose,spine:abdomen?pitch(abdomen):0,thorax:chestUp?Math.atan2(-chestUp[2],chestUp[1]):0};
}

const standingSlots=['stance','aggressive'] as const;
const baseline=new Map<PoseSlot,CompiledSlot>();
const limit=(n:number,max:number)=>Math.max(-max,Math.min(max,n));
const pitch=(part:RigPose)=>Math.atan2(part.a[2]-part.b[2],part.b[1]-part.a[1]);

/** Evaluate the editor's XYZ transforms in hierarchy order, once per round.
 * Apply edits relative to the calibrated standing targets and retain IK. */
export function compileAuthoredMotion(doc:PoseDocument):AuthoredMotion{
 const result:Partial<Record<PoseSlot,ReadonlyMap<string,RigPose>>>={};
 const torso:Partial<Record<PoseSlot,Pick<StandingAdjustment,'spine'|'thorax'>>>={};
 const standing:Partial<Record<typeof standingSlots[number],StandingAdjustment>>={};
 const delta=(value:number,reference:number)=>Math.atan2(Math.sin(value-reference),Math.cos(value-reference));
 for(const [name,parts] of Object.entries(doc.slots)){
  const slot=name as PoseSlot,compiled=compileSlot(parts);
  const defaults=baseline.get(slot)??compileSlot(referencePose(slot));
  baseline.set(slot,defaults);
  result[slot]=compiled.pose;
  torso[slot]={spine:limit(delta(compiled.spine,defaults.spine),Math.PI/3),thorax:limit(delta(compiled.thorax,defaults.thorax),Math.PI/3)};
  if(slot!=='stance'&&slot!=='aggressive')continue;
  const neck=compiled.pose.get('neck'),referenceNeck=defaults.pose.get('neck');
  const foot=(id:string):Vec3=>{
   const part=compiled.pose.get(id),reference=defaults.pose.get(id);
   const diff=part&&reference?minus(part.a,reference.a):[0,0,0];
   return [limit(diff[0],.14),0,limit(diff[2],.18)];
  };
  standing[slot]={...torso[slot],neck:neck&&referenceNeck?limit(delta(pitch(neck),pitch(referenceNeck)),Math.PI/3):0,feet:[foot('L.foot'),foot('R.foot')]};
 }
 return {...result,standing,torso};
}

/** Body turn shared by strike preview and the live collision pose. The IK
 * stage that follows owns the striking endpoint and the planted foot. */
export function strikeBody(pose:readonly RigPose[],slot:'punch'|'kick'|'headbutt',side:'L'|'R',amount:number,motion:AuthoredMotion):readonly RigPose[]{
 const axis=slot==='kick'?'pelvis':'chest';
 const hinge=pose.find(p=>p.id===axis),reference=motion[slot]?.get(axis);
 if(!hinge||!amount)return pose;
 const center=slot==='headbutt'?(pose.find(p=>p.id==='abdomen')?.b??hinge.a):times(plus(hinge.a,hinge.b),.5);
 const authoredAxis=reference?minus(reference.b,reference.a):null;
 const authoredTurn=authoredAxis?Math.abs(Math.atan2(authoredAxis[2],authoredAxis[0])):0;
 const yaw=(side==='L'?-1:1)*amount*(slot==='headbutt'?.1:Math.min(.65,.32+authoredTurn*.35));
 const twist=poseRotation([0,yaw,0]);
 const turn=(p:Vec3):Vec3=>{
  const offset=twist(minus(p,center));
  const torso=slot==='headbutt'?motion.headbutt?.get('abdomen'):undefined;
  if(!torso)return plus(center,offset);
  const bend=Math.atan2(torso.b[2]-torso.a[2],torso.b[1]-torso.a[1]);
  const bodyYaw=-Math.atan2(hinge.b[2]-hinge.a[2],hinge.b[0]-hinge.a[0]);
  const local=poseRotation([0,-bodyYaw,0])(offset);
  return plus(center,poseRotation([0,bodyYaw,0])(poseRotation([bend*amount*.55,0,0])(local)));
 };
 const displaced=new Map<string,RigPose>();
 for(const part of pose){
  if(slot==='kick'){
   if(part.id==='pelvis')displaced.set(part.id,{...part,a:turn(part.a),b:turn(part.b)});
   else if(part.id.endsWith('upperLeg'))displaced.set(part.id,{...part,a:turn(part.a)});
  }else if(part.id==='chest'||part.id==='neck'||part.id==='head'||/Arm$|hand$/.test(part.id)){
   displaced.set(part.id,{...part,a:turn(part.a),b:turn(part.b)});
  }
 }
 return pose.map(p=>displaced.get(p.id)??p);
}
