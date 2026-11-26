import type { Vec3 } from '../types.js';
import type { RigPose } from './gait.js';
import { rigCenterOfMass } from './support.js';
import { solveTwoBone } from './two-bone.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const center=(p:RigPose):Vec3=>[(p.a[0]+p.b[0])*.5,(p.a[1]+p.b[1])*.5,(p.a[2]+p.b[2])*.5];
const bound=(x:number,z:number,max:number):readonly [number,number]=>{const n=Math.hypot(x,z),k=n>max?max/n:1;return [x*k,z*k];};
/** Quasi-static single support. Rotate the connected rig about its pelvis
 * toward the actual planted foot, recompute COM from surviving parts,
 * and solve legs again without changing the supporting foot's world target.
 * Tilt is preferred to translation; the latter handles residual reach error.
 * No dynamic angular momentum or forces are integrated here. */
export function balanceSingleSupport(pose:readonly RigPose[],active:readonly string[],side:'L'|'R',plant:Vec3,ground:(x:number,z:number)=>number,swingTarget?:Vec3,load=1,yaw?:number):readonly RigPose[]{
 load=Math.max(0,Math.min(1,load));
 const ids=new Set(active),index=new Map(pose.map((p,i)=>[p.id,i]));
 const get=(id:string)=>pose[index.get(id)!]!;
 const hip=get('pelvis'),pivot=center(hip),uid=side+'.upperLeg',lid=side+'.lowerLeg',fid=side+'.foot';
 const offset=sub(get(lid).b,get(fid).a),ankle=add(plant,offset);
 const target:Vec3=[plant[0],plant[1],plant[2]];
 let tx=0,tz=0,sx=0,sz=0;
 const build=():readonly RigPose[]=>{
  const rawAngle=Math.hypot(tx,tz),ux=rawAngle>1e-9?tx/rawAngle:1,uz=rawAngle>1e-9?tz/rawAngle:0,angle=rawAngle*load,c=Math.cos(angle),s=Math.sin(angle);
  const rot=(p:Vec3):Vec3=>{
   const x=p[0]-pivot[0],y=p[1]-pivot[1],z=p[2]-pivot[2],h=x*ux+z*uz,delta=h*(c-1)+y*s;
   return [p[0]+ux*delta+sx*load,pivot[1]+y*c-h*s,p[2]+uz*delta+sz*load];
  };
  const joint=rot(side==='L'?hip.a:hip.b);
  // Lower the body if the fixed target is outside the normal reach.
  // Horizontal reach is handled by bounded translation below.
  const horizontal=Math.hypot(joint[0]-ankle[0],joint[2]-ankle[2]);
  const allowed=Math.sqrt(Math.max(0,.985**2-horizontal**2));
  const drop=Math.max(0,joint[1]-ankle[1]-allowed);
  const transform=(p:Vec3):Vec3=>{const v=rot(p);return [v[0],v[1]-drop,v[2]];};
  const out=pose.map(p=>({...p,a:transform(p.a),b:transform(p.b)}));
  const pelvis=out[index.get('pelvis')!]!;
  for(const k of ['L','R'] as const){
   const u=k+'.upperLeg',l=k+'.lowerLeg',f=k+'.foot',upper=get(u),lower=get(l),foot=get(f);
   const root=k==='L'?pelvis.a:pelvis.b;
   if(!upper)continue;
   if(!lower){
    const target=swingTarget??transform(upper.b);
    const direction=sub([target[0],Math.max(target[1],ground(target[0],target[2])+upper.radius),target[2]],root);
    const distance=Math.hypot(...direction);
    const end:Vec3=distance>1e-8?[root[0]+.49*direction[0]/distance,root[1]+.49*direction[1]/distance,root[2]+.49*direction[2]/distance]:transform(upper.b);
    out[index.get(u)!]={...upper,a:root,b:end};
    continue;
   }
   const footOffset=foot?sub(lower.b,foot.a):[0,0,0] as const;
   const raw=swingTarget&&k!==side?swingTarget:transform(foot?.a??lower.b);
   // The other, incomplete leg can follow the body, but cannot drive
   // the correction or be counted as an additional supporting foot.
   const end:Vec3=k===side?ankle:add([raw[0],Math.max(raw[1],ground(raw[0],raw[2])+(foot??lower).radius),raw[2]],footOffset);
   const pole:Vec3=yaw===undefined?sub(upper.b,upper.a):[Math.sin(yaw),.02,-Math.cos(yaw)];
   const ik=solveTwoBone(root,end,.49,.50,pole);
   const p=sub(ik.end,footOffset);
   out[index.get(u)!]={...upper,a:root,b:ik.joint};
   out[index.get(l)!]={...lower,a:ik.joint,b:ik.end};
   if(foot)out[index.get(f)!]={...foot,a:p,b:p};
  }
  return out;
 };
 let result=build();
 // Four bounded COM corrections; the lever length is only a numerical
 // gain, not a fixed body offset. All corrections depend on actual mass.
 for(let i=0;i<4;i++){
  const com=rigCenterOfMass(result,ids);if(!com)break;
  const dx=target[0]-com[0],dz=target[2]-com[2];
  if(Math.hypot(dx,dz)<.008)break;
  [tx,tz]=bound(tx+dx/.45,tz+dz/.45,.52);
  result=build();
 }
 // If angular reach alone cannot center the mass, transfer the pelvis
 // horizontally by the remaining error, keeping the same foot anchor.
 for(let i=0;i<2;i++){
  const com=rigCenterOfMass(result,ids);if(!com)break;
  const dx=target[0]-com[0],dz=target[2]-com[2];
  if(Math.hypot(dx,dz)<.008)break;
  [sx,sz]=bound(sx+dx*1.2,sz+dz*1.2,.18);
  result=build();
 }
 return result;
}
