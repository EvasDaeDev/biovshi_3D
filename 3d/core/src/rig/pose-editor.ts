import {LAB_SEGMENTS} from './anatomy.js';
import {PatientGait,type RigPose} from './gait.js';
import {constrainRig} from './rig-constraints.js';
import type {Vec3} from '../types.js';

export const POSE_SLOTS={
 stance:'Стойка',balance:'Баланс на одной ноге',kick:'Пинок',punch:'Удар рукой',
 headbutt:'Удар головой',hurt:'Получение урона',jump:'Прыжок',
} as const;
export type PoseSlot=keyof typeof POSE_SLOTS;
export interface PoseSegment extends RigPose{
 readonly length:number;
 readonly enabled:boolean;
}
export interface PoseDocument{
 readonly schemaVersion:1;
 readonly slots:Partial<Record<PoseSlot,readonly PoseSegment[]>>;
}

export function referencePose():PoseSegment[]{
 return new PatientGait([0,0,0]).pose(0,[0,0,0],0,0).map(p=>{
  const segment=LAB_SEGMENTS.find(s=>s.id===p.id)!;
  return {...p,length:segment.nominalLength,enabled:true};
 });
}

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
   return {id:def.id,a:point(p.a),b:point(p.b),radius:p.radius,length:p.length,enabled:p.enabled};
  });
 }
 return {schemaVersion:1,slots};
}

/** The editor and the procedural rig use the same connected skeleton. */
export function buildEditedPose(parts:readonly PoseSegment[]):readonly RigPose[]{
 const byId=new Map(parts.map(p=>[p.id,p]));
 const lengths=new Map(parts.map(p=>[p.id,p.length]));
 return constrainRig(parts,lengths).filter(part=>{
  let def=LAB_SEGMENTS.find(s=>s.id===part.id);
  while(def){
   if(!byId.get(def.id)?.enabled)return false;
   const parent=def.parent;
   def=parent===null?undefined:LAB_SEGMENTS.find(s=>s.id===parent);
  }
  return true;
 });
}
