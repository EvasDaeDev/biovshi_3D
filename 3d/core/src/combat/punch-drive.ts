import type {PhysicsSegmentPose,Vec3} from '../types.js';
import {solveTwoBone} from '../rig/two-bone.js';

const sides=['L','R'] as const;
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a:Vec3,k:number):Vec3=>[a[0]*k,a[1]*k,a[2]*k];

/** Shift and turn the hips into the blow, anchored at the current ankles.
 * The renderer, strike preview and swept contact all use this same pose. */
export function plantPunchDrive(pose:readonly PhysicsSegmentPose[],yaw:number,turn:number,drive:number):readonly PhysicsSegmentPose[]{
 const pelvis=pose.find(part=>part.id==='pelvis');
 if(!pelvis||drive===0)return pose;
 const legs=sides.map(side=>({thigh:pose.find(part=>part.id===side+'.upperLeg'),
  shin:pose.find(part=>part.id===side+'.lowerLeg'),foot:pose.find(part=>part.id===side+'.foot')}));
 if(legs.some(leg=>!leg.thigh||!leg.shin||!leg.foot))return pose;
 const pivot=scale(add(pelvis.a,pelvis.b),.5);
 const transformAt=(weight:number)=>{
  const angle=turn*weight,c=Math.cos(angle),s=Math.sin(angle);
  const forward=.145*drive*weight;
  const shift:Vec3=[Math.sin(yaw)*forward,-.085*Math.abs(drive)*weight,-Math.cos(yaw)*forward];
  return (point:Vec3):Vec3=>{
   const [x,y,z]=sub(point,pivot);
   return add(add(pivot,shift),[c*x+s*z,y,-s*x+c*z]);
  };
 };
 // Shrink the transfer only as far as needed to preserve ankle contact.
 // A discrete choice between preset offsets would jump during the thrust.
 const reachable=(transform:ReturnType<typeof transformAt>)=>legs.every(({thigh,shin})=>{
  const distance=Math.hypot(...sub(transform(thigh!.a),shin!.b));
  return distance<=.99&&distance>=.01;
 });
 let transform=transformAt(1);
 if(!reachable(transform)){
  let low=0,high=1;
  for(let sample=0;sample<8;sample++){
   const weight=(low+high)/2;
   if(reachable(transformAt(weight)))low=weight;
   else high=weight;
  }
  if(low===0)return pose;
  transform=transformAt(low);
 }
 const driven=legs.map(({thigh,shin})=>{
  const u=thigh!,l=shin!,hip=transform(u.a);
  const knee=solveTwoBone(hip,l.b,.49,.50,sub(u.b,u.a)).joint;
  return {u,l,hip,knee};
 });
 const [left,right]=driven;
 return pose.map(part=>{
  if(part===left!.u||part===right!.u){
   const leg=part===left!.u?left!:right!;
   return {...part,a:leg.hip,b:leg.knee};
  }
  if(part===left!.l||part===right!.l)return {...part,a:(part===left!.l?left!:right!).knee};
  if(part.id.endsWith('.foot'))return part;
  return {...part,a:transform(part.a),b:transform(part.b)};
 });
}
