import { FIXED_DT } from '../fixed-clock.js';
import { MOVEMENT } from '../rig/movement-timing.js';
import type { PhysicsSegmentPose,Vec3 } from '../types.js';
import type { PointXZ } from './escape.js';
// Same calibration as movement-timing.ts and escape.ts.
const metres=(cm:number)=>cm*MOVEMENT.walkSpeed/(32*1.2);
const rad=(deg:number)=>deg*Math.PI/180;
const ticks=(s:number)=>Math.ceil(s/FIXED_DT-1e-9);
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const distance=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
export const VISION=Object.freeze({fov:rad(100),range:metres(300),nearby:metres(75),touch:metres(32),limit:rad(60),scanSpeed:rad(20),trackSpeed:rad(40),memoryTicks:ticks(2.4),arrival:metres(35)});
export interface VisionBody extends PointXZ {readonly id:number;readonly yaw:number;readonly parts:readonly PhysicsSegmentPose[]}
export type SightClear=(from:Vec3,to:Vec3)=>boolean;
const clearAll:SightClear=()=>true;
const mid=(p:PhysicsSegmentPose):Vec3=>[(p.a[0]+p.b[0])/2,(p.a[1]+p.b[1])/2,(p.a[2]+p.b[2])/2];
const center=(a:VisionBody):Vec3=>{const p=a.parts.find(p=>p.id==='chest')??a.parts.find(p=>p.id==='pelvis');return p?mid(p):[a.x,0,a.z];};
const eye=(a:VisionBody,yaw:number):Vec3|null=>{const h=a.parts.find(p=>p.id==='head');return h?[h.a[0]+Math.sin(yaw)*h.radius,h.a[1],h.a[2]-Math.cos(yaw)*h.radius]:null;};
/** Port v1 robot/perception.js and systems/perception.js. Horizontal
 * sight sector from eye, circular nearby sense from torso, test root,
 * eye and torso of the target. A geometry adapter can reject rays. */
export function notices(a:VisionBody,b:VisionBody,gazeYaw:number,clear:SightClear=clearAll):boolean{
 const e=eye(a,gazeYaw),c=center(a),otherEye=eye(b,b.yaw);
 if(!e)return distance(a,b)<VISION.touch;
 const targets:Vec3[]=[[b.x,center(b)[1],b.z],center(b)];
 if(otherEye)targets.push(otherEye);
 return targets.some(p=>{
  const dx=p[0]-e[0],dz=p[2]-e[2];
  return (Math.hypot(p[0]-c[0],p[2]-c[2])<=VISION.nearby&&clear(c,p))
   ||(Math.hypot(dx,dz)<=VISION.range&&Math.abs(wrap(Math.atan2(dx,-dz)-gazeYaw))<=VISION.fov*.5&&clear(e,p));
 });
}
export interface VisionMemory {readonly id:number;readonly point:PointXZ;readonly until:number}
export interface PerceptionSnapshot {readonly gazeYaw:number;readonly look:number;readonly visibleIds:readonly number[];readonly memory:VisionMemory|null;readonly patrol:PointXZ|null}
export class PatientPerception{
 private look=0;private direction=1;private memory:VisionMemory|null=null;private goal:PointXZ|null=null;private goalUntil=0;private visible:number[]=[];private rng:number;
 constructor(seed:number,id:number){this.rng=(seed^Math.imul(id+1,0x7feb352d)^0x846ca68b)>>>0;this.direction=id%2?1:-1;}
 private random():number{this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
 gaze(bodyYaw:number):number{return bodyYaw+this.look;}
 setVisible(ids:readonly number[]):void{this.visible=[...ids];}
 /** v1 updateHead: bounded local tracking or reflected scan. */
 advanceLook(bodyYaw:number,origin:PointXZ,target:PointXZ|null):void{
  if(target){
   const desired=clamp(wrap(Math.atan2(target.x-origin.x,-(target.z-origin.z))-bodyYaw),-VISION.limit,VISION.limit);
   this.look=clamp(this.look+clamp(desired-this.look,-VISION.trackSpeed*FIXED_DT,VISION.trackSpeed*FIXED_DT),-VISION.limit,VISION.limit);
  }else{
   this.look+=this.direction*VISION.scanSpeed*FIXED_DT;
   if(this.look>VISION.limit){this.look=2*VISION.limit-this.look;this.direction=-1;}
   if(this.look<-VISION.limit){this.look=-2*VISION.limit-this.look;this.direction=1;}
  }
 }
 remember(id:number,point:PointXZ,tick:number):void{this.memory={id,point:{x:point.x,z:point.z},until:tick+VISION.memoryTicks};this.goal=null;}
 recalled(tick:number,here:PointXZ,activeIds:readonly number[]):VisionMemory|null{
  if(this.memory&&(tick>=this.memory.until||!activeIds.includes(this.memory.id)||distance(here,this.memory.point)<VISION.arrival))this.memory=null;
  return this.memory?{...this.memory,point:{...this.memory.point}}:null;
 }
 /** v1 patrol: 30 medium-range samples, prefer interior, 3.5–5.5 s.
  * Convex arena, no interior opaque walls; cones remain traversable. */
 patrol(tick:number,here:PointXZ):PointXZ{
  if(!this.goal||tick>this.goalUntil||distance(here,this.goal)<metres(28)){
   const bound=5.65-metres(55),candidates:PointXZ[]=[];
   for(let i=0;i<30;i++){
    const p={x:(this.random()*2-1)*bound,z:(this.random()*2-1)*bound},d=distance(here,p);
    if(d>metres(90)&&d<metres(290))candidates.push(p);
   }
   this.goal=candidates.sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0]??{x:here.x*.55,z:here.z*.55};
   this.goalUntil=tick+ticks(3.5+this.random()*2);
  }
  return {...this.goal};
 }
 clear():void{this.visible=[];this.memory=null;this.goal=null;this.look=0;}
 snapshot(bodyYaw:number):PerceptionSnapshot{return {gazeYaw:this.gaze(bodyYaw),look:this.look,visibleIds:[...this.visible],memory:this.memory?{...this.memory,point:{...this.memory.point}}:null,patrol:this.goal?{...this.goal}:null};}
}
