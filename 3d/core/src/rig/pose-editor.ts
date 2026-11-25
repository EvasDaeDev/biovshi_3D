import {PATIENT_HEIGHT} from './patient-scale.js';
import {LAB_SEGMENTS} from './anatomy.js';
import {PatientGait,type RigPose} from './gait.js';
import {constrainRig} from './rig-constraints.js';
import type {Vec3} from '../types.js';

const standingPose=new PatientGait([0,0,0]).pose(0,[0,0,0],0,0);
const editorEnvelope=constrainRig(standingPose);
const height=Math.max(...editorEnvelope.map(p=>Math.max(p.a[1],p.b[1])+p.radius))-
 Math.min(...editorEnvelope.map(p=>Math.min(p.a[1],p.b[1])-p.radius));
const editorScale=PATIENT_HEIGHT/height;

export const POSE_SLOTS={
 stance:'Стойка',balance:'Баланс на одной ноге',kick:'Пинок',punch:'Удар рукой',
 headbutt:'Удар головой',hurt:'Получение урона',jump:'Прыжок',
} as const;
export type PoseSlot=keyof typeof POSE_SLOTS;
export interface PoseSegment extends RigPose{
 readonly length:number;
 readonly enabled:boolean;
 readonly offset?:Vec3;
 readonly rotation?:Vec3;
}
export interface PoseDocument{
 readonly schemaVersion:1;
 readonly stature?:1.65;
 readonly slots:Partial<Record<PoseSlot,readonly PoseSegment[]>>;
}

// Joint rotations in radians relative to the procedural standing skeleton.
const rotations:Record<PoseSlot,Record<string,Vec3>>={
 stance:{},
 balance:{'R.upperLeg':[.85,0,.18],'R.lowerLeg':[-1.25,0,0],'L.upperArm':[.15,0,-1.15],'R.upperArm':[.3,0,1.05]},
 kick:{'L.upperLeg':[1.42,.16,-.12],'L.lowerLeg':[-.18,0,0],'R.upperArm':[.35,0,.7],chest:[-.18,.22,.13]},
 punch:{chest:[-.12,.48,0],'R.upperArm':[1.36,-.12,.16],'R.lowerArm':[.3,0,0],'L.lowerArm':[1.35,0,0]},
 headbutt:{abdomen:[-.49,.1,0],neck:[-.34,0,.08],'L.upperArm':[-.42,0,-.27],'R.upperArm':[-.55,0,.25]},
 hurt:{abdomen:[.45,-.22,.28],neck:[.32,.18,-.24],'L.upperArm':[.35,0,-.8],'R.lowerArm':[1.28,0,0]},
 jump:{'L.upperLeg':[.96,0,-.18],'R.upperLeg':[.52,0,.19],'L.lowerLeg':[-1.25,0,0],'R.lowerLeg':[-.97,0,0],'L.upperArm':[1.6,0,-.61],'R.upperArm':[1.13,0,.58]},
};
export function referencePose(slot:PoseSlot='stance'):PoseSegment[]{
 return standingPose.map(p=>{
  const segment=LAB_SEGMENTS.find(s=>s.id===p.id)!;
  return {...p,a:scalePoint(p.a),b:scalePoint(p.b),radius:p.radius*editorScale,length:segment.nominalLength*editorScale,enabled:true,rotation:rotations[slot][p.id]??[0,0,0],offset:slot==='jump'&&p.id==='pelvis'?[0,.32*editorScale,0]:[0,0,0]};
 });
}

const scalePoint=([x,y,z]:Vec3):Vec3=>[x*editorScale,y*editorScale,z*editorScale];

const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const number=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
function point(value:unknown):Vec3{
 if(!Array.isArray(value)||value.length!==3||!value.every(n=>number(n,-8,8)))
  throw new RangeError('Координаты капсулы должны быть в пределах ±8 м.');
 return [value[0]!,value[1]!,value[2]!];
}

export function readPoseDocument(value:unknown):PoseDocument{
 if(!record(value)||value.schemaVersion!==1||!record(value.slots))
  throw new RangeError('Ожидается JSON редактора поз версии 1.');
 const legacy=value.stature===undefined;
 if(!legacy&&value.stature!==1.65)throw new RangeError('Некорректный масштаб позы.');
 const slots:PoseDocument['slots']={};
 for(const [slot,entries] of Object.entries(value.slots)){
  if(!Object.hasOwn(POSE_SLOTS,slot)||!Array.isArray(entries)||entries.length!==LAB_SEGMENTS.length)
   throw new RangeError('Неизвестная поза или неполный набор сегментов.');
  const byId=new Map(entries.map(p=>[p?.id,p]));
  slots[slot as PoseSlot]=LAB_SEGMENTS.map(def=>{
   const p=byId.get(def.id);
   if(!record(p)||!number(p.radius,.01,.5)||
    !number(p.length,def.nominalLength===0?0:.02,def.nominalLength===0?0:1.5)||
    typeof p.enabled!=='boolean'||(def.protected&&!p.enabled))
    throw new RangeError('Некорректный сегмент '+def.id);
   const metric=legacy?editorScale:1;
   const position=(v:unknown)=>legacy?scalePoint(point(v)):point(v);
   return {id:def.id,a:position(p.a),b:position(p.b),radius:p.radius*metric,length:p.length*metric,enabled:p.enabled,offset:position(p.offset??[0,0,0]),rotation:point(p.rotation??[0,0,0])};
  });
 }
 return {schemaVersion:1,stature:1.65,slots};
}

/** The editor and the procedural rig use the same connected skeleton. */
export function buildEditedPose(parts:readonly PoseSegment[]):readonly RigPose[]{
 const byId=new Map(parts.map(p=>[p.id,p]));
 const lengths=new Map(parts.map(p=>[p.id,p.length]));
 return constrainRig(parts,lengths,editorScale).filter(part=>{
  let def=LAB_SEGMENTS.find(s=>s.id===part.id);
  while(def){
   if(!byId.get(def.id)?.enabled)return false;
   const parent=def.parent;
   def=parent===null?undefined:LAB_SEGMENTS.find(s=>s.id===parent);
  }
  return true;
 });
}
