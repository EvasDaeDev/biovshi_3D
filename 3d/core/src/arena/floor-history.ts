/** P4 round-floor handoff, inspired by v1 src/render/floor-history.js.
 * Only settled physical remains are archived. The renderer owns their visual
 * appearance; Rapier will rebuild static low cones from this plain data.
 * No Three/Rapier/DOM types or original 2D save contracts leak into core. */
export const FLOOR_VERSION=1 as const;
export const FLOOR_OIL_LIMIT=2000;
export interface FloorVec3 {readonly x:number;readonly y:number;readonly z:number}
export interface FloorRotation extends FloorVec3 {readonly w:number}
export interface FloorMound {readonly id:string;readonly source:'segment'|'branch'|'body';readonly x:number;readonly z:number;readonly radius:number;readonly height:number}
export interface FloorVisual {readonly id:string;readonly fighterId:number;readonly segmentId:string;readonly settled:true;readonly length:number;readonly radius:number;readonly position:FloorVec3;readonly rotation:FloorRotation}
export interface FloorOilMark {readonly id:string;readonly fighterId:number;readonly tick:number;readonly point:readonly [number,number,number]}
export interface FloorHistory {readonly schemaVersion:1;readonly arenaId:string;readonly mounds:readonly FloorMound[];readonly visuals:readonly FloorVisual[];readonly oilMarks:readonly FloorOilMark[]}
type RecordValue=Record<string,unknown>;
const object=(v:unknown):v is RecordValue=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const positive=(v:unknown)=>number(v)&&v>0;
const vec=(v:unknown):FloorVec3=>{
 if(!object(v)||!number(v.x)||!number(v.y)||!number(v.z))throw new RangeError('Invalid floor vector');
 return {x:v.x,y:v.y,z:v.z};
};
const quat=(v:unknown):FloorRotation=>{
 const p=vec(v);
 if(!object(v)||!number(v.w))throw new RangeError('Invalid floor rotation');
 const length=Math.hypot(p.x,p.y,p.z,v.w);
 if(Math.abs(length-1)>.002)throw new RangeError('Unnormalized floor rotation');
 return {...p,w:v.w};
};
/** Strict, deep-copying boundary for JSON save/load and round-to-round import.
 * IDs are recanonicalized so old fighters, branches and new round debris
 * cannot reuse mesh keys or collider IDs. */
export function readFloorHistory(input:unknown,arenaId:string):FloorHistory{
 if(!object(input)||input.schemaVersion!==FLOOR_VERSION||
    typeof arenaId!=='string'||!arenaId.length||arenaId.length>128||input.arenaId!==arenaId||
    !Array.isArray(input.mounds)||!Array.isArray(input.visuals)||!Array.isArray(input.oilMarks)||
    input.mounds.length>5000||input.visuals.length>10000||input.oilMarks.length>FLOOR_OIL_LIMIT)
  throw new RangeError('Invalid floor version, scope or collection size');
 const mounds:FloorMound[]=input.mounds.map((raw:unknown,i:number)=>{
  if(!object(raw)||!['body','branch','segment'].includes(String(raw.source))||
     !number(raw.x)||!number(raw.z)||!positive(raw.radius)||!positive(raw.height)||
     raw.height>.300001||raw.radius>8)throw new RangeError('Invalid archived floor mound');
  return {id:'floor:m:'+i,source:raw.source as FloorMound['source'],x:raw.x,z:raw.z,radius:raw.radius,height:raw.height};
 });
 const visuals:FloorVisual[]=input.visuals.map((raw:unknown,i:number)=>{
  if(!object(raw)||!Number.isSafeInteger(raw.fighterId)||Number(raw.fighterId)<0||
     typeof raw.segmentId!=='string'||!raw.segmentId||raw.segmentId.length>64||
     raw.settled!==true||!number(raw.length)||raw.length<0||raw.length>4||
     !positive(raw.radius)||raw.radius>1)throw new RangeError('Invalid archived visual anatomy');
  return {id:'floor:v:'+i,fighterId:raw.fighterId as number,segmentId:raw.segmentId,
    settled:true,length:raw.length,radius:raw.radius,position:vec(raw.position),rotation:quat(raw.rotation)};
 });
 const oilMarks:FloorOilMark[]=input.oilMarks.map((raw:unknown,i:number)=>{
  if(!object(raw)||!Number.isSafeInteger(raw.fighterId)||Number(raw.fighterId)<0||
     !Array.isArray(raw.point)||raw.point.length!==3||!raw.point.every(number))
   throw new RangeError('Invalid archived oil stain');
  // Older blood is fully dry at the next round. Avoid a new timer on old IDs.
  return {id:'floor:o:'+i,fighterId:raw.fighterId as number,tick:-1080,
    point:[raw.point[0] as number,raw.point[1] as number,raw.point[2] as number]};
 });
 return {schemaVersion:FLOOR_VERSION,arenaId,mounds,visuals,oilMarks};
}
/** Normalize current settled snapshots plus already archived floor into a
 * detached, JSON-safe document. Oil storage is intentionally bounded by the
 * existing instanced renderer capacity, preserving newest marks. */
export function createFloorHistory(arenaId:string,mounds:readonly unknown[],visuals:readonly unknown[],oilMarks:readonly unknown[]):FloorHistory{
 return readFloorHistory({schemaVersion:FLOOR_VERSION,arenaId,mounds,visuals,oilMarks:oilMarks.slice(-FLOOR_OIL_LIMIT)},arenaId);
}
