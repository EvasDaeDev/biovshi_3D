import type { Vec3 } from '../types.js';
import type { RigPose } from './gait.js';
import type { Mobility } from './mobility.js';
import { MOVEMENT,CRAWL_TIMING,HORROR_CRAWL_TIMING } from './movement-timing.js';
import { solveTwoBone } from './two-bone.js';
type Ground=(x:number,z:number)=>number;
type Side='L'|'R';
export interface CrawlAnchor {readonly segmentId:string;readonly phase:'recover'|'plant';readonly point:Vec3;readonly valid:boolean}
interface Arm {phase:'recover'|'plant';age:number;from:Vec3;target:Vec3;point:Vec3;count:number}
const sides=['L','R'] as const;
const radius=.083;
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const endpoint=(pose:readonly RigPose[],side:Side)=>pose.find(p=>p.id===side+'.lowerArm')!.b;
const segmentId=(side:Side,count:number)=>side+(count===3?'.hand':'.lowerArm');
const clear=(p:RigPose,ground:Ground)=>[0,.5,1].every(t=>{
 const x=p.a[0]+(p.b[0]-p.a[0])*t,y=p.a[1]+(p.b[1]-p.a[1])*t,z=p.a[2]+(p.b[2]-p.a[2])*t;
 return y-p.radius>=ground(x,z)-1e-8;
});
/** World-space support targets. Only advance mutates the cycle; pose solves
 * are pure so collision iterations and render snapshots cannot advance it. */
export class CrawlAnchors {
 private arms:[Arm|null,Arm|null]=[null,null];
 constructor(private readonly organic=false){}
 private get timing(){return this.organic?HORROR_CRAWL_TIMING:CRAWL_TIMING;}
 reset():void{this.arms=[null,null];}
 advance(dt:number,speed:number,yaw:number,pose:readonly RigPose[],mobility:Mobility,ground:Ground,bracingSide:Side|null=null):void{
  const moving=Math.abs(speed)>.005,dir=speed<0?-1:1,plantSeconds=this.timing.plant;
  for(let i=0;i<2;i++){
   const side=sides[i]!,count=mobility.arms[i]??0;
   if(count<2){this.arms[i]=null;continue;}
   const current=endpoint(pose,side),shoulder=pose.find(p=>p.id===side+'.upperArm')!.a;
   const landing=():Vec3=>{
    const reach=this.timing.reach+Math.min(this.organic?.10:.07,Math.abs(speed)*MOVEMENT.stepLeadSeconds);
    const x=shoulder[0]+Math.cos(yaw)*(i===0?-.10:.10)+Math.sin(yaw)*reach*dir;
    const z=shoulder[2]+Math.sin(yaw)*(i===0?-.10:.10)-Math.cos(yaw)*reach*dir;
    const y=ground(x,z)+radius;
    if(this.organic){
     // Bound horizontal reach by the actual shoulder height; preserve a
     // flexed elbow and leave margin for movement during the swing.
     const horizontal=Math.hypot(x-shoulder[0],z-shoulder[2]),max=Math.sqrt(Math.max(.01,.64**2-(y-shoulder[1])**2));
     if(horizontal>max){const k=max/horizontal,px=shoulder[0]+(x-shoulder[0])*k,pz=shoulder[2]+(z-shoulder[2])*k;return [px,ground(px,pz)+radius,pz];}
    }
    return [x,y,z];
   };
   let a=this.arms[i];
   if(!a||a.count!==count){
    const start:Vec3=[current[0],ground(current[0],current[2])+radius,current[2]];
    const age=bracingSide?(side===bracingSide?0:plantSeconds):i===0?plantSeconds:plantSeconds*.5;
    a={phase:'plant',age,from:start,target:start,point:start,count};
    this.arms[i]=a;
   }
   if(a.phase==='plant'){
    a.point=[a.point[0],ground(a.point[0],a.point[2])+radius,a.point[2]];
    if(!moving)continue;
    a.age+=dt;
    if(a.age>=plantSeconds){a.phase='recover';a.age=0;a.from=current;a.target=landing();a.point=current;}
   }else{
    a.age=Math.min(this.timing.swing,a.age+dt);
    const q=a.age/this.timing.swing,t=q*q*(3-2*q);
    const x=a.from[0]+(a.target[0]-a.from[0])*t,z=a.from[2]+(a.target[2]-a.from[2])*t;
    a.point=[x,Math.max(ground(x,z)+radius,a.from[1]+(a.target[1]-a.from[1])*t)+Math.sin(Math.PI*q)*.095,z];
    if(q===1){a.phase='plant';a.age=0;a.point=[a.target[0],ground(a.target[0],a.target[2])+radius,a.target[2]];}
   }
  }
 }
 apply(pose:readonly RigPose[],mobility:Mobility,ground:Ground,weight=1):readonly RigPose[]{
  if(weight===0||!this.arms.some(Boolean))return pose;
  const result=[...pose],index=new Map(result.map((p,i)=>[p.id,i]));
  for(let i=0;i<2;i++){
   const a=this.arms[i],side=sides[i]!;
   if(!a||a.count!==mobility.arms[i])continue;
   const u=index.get(side+'.upperArm')!,l=index.get(side+'.lowerArm')!,h=index.get(side+'.hand')!,upper=result[u]!,lower=result[l]!,hand=result[h]!;
   const end=lower.b;
   const target:Vec3=weight===1?a.point:[end[0]+(a.point[0]-end[0])*weight,end[1]+(a.point[1]-end[1])*weight,end[2]+(a.point[2]-end[2])*weight];
   const bend:Vec3=weight===1?[0,1,0]:[
    (lower.a[0]-upper.a[0])*(1-weight),
    (lower.a[1]-upper.a[1])*(1-weight)+weight*.36,
    (lower.a[2]-upper.a[2])*(1-weight)
   ];
   const ik=solveTwoBone(upper.a,target,.36,.32,bend);
   const pu={...upper,b:ik.joint},pl={...lower,a:ik.joint,b:ik.end},ph={...hand,a:ik.end,b:ik.end};
   // Never gain a plant by penetrating terrain; keep the corrected base pose
   // if the candidate chain cannot fit. A later swing can replant it.
   if(!clear(pu,ground)||!clear(pl,ground)||(a.count===3&&!clear(ph,ground)))continue;
   result[u]=pu;result[l]=pl;result[h]=ph;
  }
  return result;
 }
 snapshot(pose:readonly RigPose[],mobility:Mobility,ground:Ground):readonly CrawlAnchor[]{
  const out:CrawlAnchor[]=[];
  for(let i=0;i<2;i++){
   const a=this.arms[i],side=sides[i]!;
   if(!a||a.count!==mobility.arms[i])continue;
   const lower=pose.find(p=>p.id===side+'.lowerArm');if(!lower||!pose.some(p=>p.id===segmentId(side,a.count)))continue;
   const end=lower.b,valid=a.phase==='plant'&&distance(end,a.point)<.002&&Math.abs(end[1]-radius-ground(end[0],end[2]))<.002;
   out.push({segmentId:segmentId(side,a.count),phase:a.phase,point:[...a.point],valid});
  }
  return out;
 }
}
