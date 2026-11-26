import type { Vec3 } from '../types.js';
import type { RigPose } from './gait.js';
import { analyzeSupport,rigCenterOfMass } from './support.js';
import { solveTwoBone } from './two-bone.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
/** Small quasi-static weight transfer toward the current stance patch.
 * The original world-space ankle targets are retained, and leg IK is solved
 * again after moving the torso. No impulse or dynamic fall decision here. */
export function balanceStandingPose(pose:readonly RigPose[],active:readonly string[],stance:readonly string[],ground:(x:number,z:number)=>number,continuous?:{points:readonly [Vec3,Vec3];weight:number}):readonly RigPose[]{
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
 if(amount<1e-6)return pose;
 const k=Math.min(continuous?.035:.055,amount*.65)/amount,shift:Vec3=[x*k,0,z*k];
 const moved=pose.map(p=>({...p,a:add(p.a,shift),b:add(p.b,shift)}));
 const index=new Map(moved.map((p,i)=>[p.id,i])),raw=new Map(pose.map(p=>[p.id,p]));
 const hip=moved[index.get('pelvis')!]!;
 for(const side of ['L','R']){
  const uid=side+'.upperLeg',lid=side+'.lowerLeg',fid=side+'.foot';
  const upper=raw.get(uid)!,lower=raw.get(lid)!,foot=raw.get(fid)!;
  const origin=side==='L'?hip.a:hip.b;
  const leg=solveTwoBone(origin,lower.b,.49,.50,sub(upper.b,upper.a));
  const f=add(leg.end,sub(foot.a,lower.b));
  moved[index.get(uid)!]={...upper,a:origin,b:leg.joint};
  moved[index.get(lid)!]={...lower,a:leg.joint,b:leg.end};
  moved[index.get(fid)!]={...foot,a:f,b:f};
 }
 return moved;
}
