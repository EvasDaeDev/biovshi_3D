import type { Vec3 } from '../types.js';
import type { RigPose } from './gait.js';
import { analyzeSupport,rigCenterOfMass } from './support.js';
import { solveTwoBone } from './two-bone.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
/** Small quasi-static weight transfer toward the current stance patch.
 * The original world-space ankle targets are retained, and leg IK is solved
 * again after moving the torso. No impulse or dynamic fall decision here. */
export function balanceStandingPose(pose:readonly RigPose[],active:readonly string[],stance:readonly string[],ground:(x:number,z:number)=>number,continuous?:{points:readonly [Vec3,Vec3];weight:number;yaw?:number}):readonly RigPose[]{
 if(!stance.length&&!continuous)return pose;
 let x=0,z=0;
 if(continuous){
  const com=rigCenterOfMass(pose,new Set(active));if(!com)return pose;
  const [left,right]=continuous.points,w=(Math.max(-1,Math.min(1,continuous.weight))+1)*.5;
  x=left[0]*(1-w)+right[0]*w-com[0];z=left[2]*(1-w)+right[2]*w-com[2];
  const distance=Math.hypot(x,z),k=distance>1e-8?Math.max(0,distance-.09)/distance:0;x*=k;z*=k;
 }else{
  const state=analyzeSupport(pose.filter(p=>active.includes(p.id)),ground,new Set(stance));[x,z]=state.correction;
 }
 const amount=Math.hypot(x,z);
 if(amount<1e-6&&!continuous)return pose;
 const k=amount>1e-6?Math.min(continuous?.035:.055,amount*.65)/amount:0,shift:[number,number,number]=[x*k,0,z*k];
 // Re-solve against actual foot targets, rather than using the already
 // clamped result of the first IK solve. Lower the pelvis continuously
 // when reach is exhausted, retaining a small flexion margin.
 const yaw=continuous?.yaw,stable=yaw!==undefined;
 const ankleOffset:Vec3=stable?[-Math.sin(yaw)*.055,.04,Math.cos(yaw)*.055]:[0,0,0];
 if(stable&&continuous){
  const hip=pose.find(p=>p.id==='pelvis')!;
  let drop=0;
  for(let i=0;i<2;i++){
   const origin=add(i===0?hip.a:hip.b,shift),ankle=add(continuous.points[i]!,ankleOffset);
   const h=Math.hypot(origin[0]-ankle[0],origin[2]-ankle[2]);
   const allowed=Math.sqrt(Math.max(0,.982**2-h*h));
   drop=Math.max(drop,origin[1]-ankle[1]-allowed);
  }
  shift[1]=-Math.min(.25,drop);
 }
 const moved=pose.map(p=>({...p,a:add(p.a,shift),b:add(p.b,shift)}));
 const index=new Map(moved.map((p,i)=>[p.id,i])),raw=new Map(pose.map(p=>[p.id,p]));
 const hip=moved[index.get('pelvis')!]!;
 for(const side of ['L','R']){
  const uid=side+'.upperLeg',lid=side+'.lowerLeg',fid=side+'.foot';
  const upper=raw.get(uid)!,lower=raw.get(lid)!,foot=raw.get(fid)!;
  const origin=side==='L'?hip.a:hip.b;
  const target=stable&&continuous?add(continuous.points[side==='L'?0:1],ankleOffset):lower.b;
  // The previous upper-bone direction can become parallel to the ankle
  // axis and flip the knee during secondary balance. Use an anatomical
  // forward pole in the authored body frame instead.
  const pole:Vec3=stable?[Math.sin(yaw),.02,-Math.cos(yaw)]:sub(upper.b,upper.a);
  const leg=solveTwoBone(origin,target,.49,.50,pole);
  const f=stable?sub(leg.end,ankleOffset):add(leg.end,sub(foot.a,lower.b));
  moved[index.get(uid)!]={...upper,a:origin,b:leg.joint};
  moved[index.get(lid)!]={...lower,a:leg.joint,b:leg.end};
  moved[index.get(fid)!]={...foot,a:f,b:f};
 }
 return moved;
}
