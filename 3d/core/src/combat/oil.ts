import type { Vec3,PhysicsSegmentPose } from '../types.js';
import { LAB_SEGMENTS } from '../rig/anatomy.js';
import { FIXED_DT } from '../fixed-clock.js';
/** Source: v1 config, render/effects.js, game/loop.js.
 * Droplets are visual only; no invented global oil-volume health meter. */
export const OIL=Object.freeze({minInterval:.5,maxInterval:.7,limit:2000,drySeconds:18,failureMin:10,failureMax:15});
export interface OilMark {readonly id:number;readonly fighterId:number;readonly point:Vec3;readonly tick:number}
export interface OilSnapshot {readonly wounds:readonly string[];readonly failureTick:number|null}
interface Wound {id:string;parent:string;nextTick:number}
const parentById=new Map(LAB_SEGMENTS.map(p=>[p.id,p.parent]));
const ticks=(s:number)=>Math.ceil(s/FIXED_DT);
const span=(lo:number,hi:number,r:number)=>ticks(lo+(hi-lo)*r);
export function hasWorkingLimb(ids:readonly string[]):boolean{
 return ['L','R'].some(side=>['Arm','Leg'].some(kind=>ids.includes(side+'.upper'+kind)&&ids.includes(side+'.lower'+kind)));
}
export class OilState{
 private wounds=new Map<string,Wound>();
 private deadline:number|null=null;
 cut(root:string,removed:readonly string[],active:readonly string[],tick:number,random:()=>number):void{
  for(const [id,w] of this.wounds)if(removed.includes(w.parent))this.wounds.delete(id);
  const parent=parentById.get(root);
  if(parent&&active.includes(parent))this.wounds.set(root,{id:root,parent,nextTick:tick+span(OIL.minInterval,OIL.maxInterval,random())});
 }
 advance(tick:number,active:readonly string[],pose:()=>readonly PhysicsSegmentPose[],random:()=>number,emit:(id:string,origin:Vec3)=>void):boolean{
  if(!this.wounds.size){this.deadline=null;return false;}
  if(hasWorkingLimb(active))this.deadline=null;
  else if(this.deadline===null)this.deadline=tick+span(OIL.failureMin,OIL.failureMax,random());
  if(this.deadline!==null&&tick>=this.deadline)return true;
  let parts:readonly PhysicsSegmentPose[]|undefined;
  for(const w of this.wounds.values()){
   if(tick<w.nextTick)continue;
   parts??=pose();const p=parts.find(v=>v.id===w.parent);
   if(p){
    const origin=w.parent==='pelvis'||w.parent==='chest'?(w.id.startsWith('L.')?p.a:p.b):p.b;
    emit(w.id,origin);
   }
   w.nextTick=tick+span(OIL.minInterval,OIL.maxInterval,random());
  }
  return false;
 }
 clear():void{this.wounds.clear();this.deadline=null;}
 snapshot():OilSnapshot{return {wounds:[...this.wounds.keys()],failureTick:this.deadline};}
}
