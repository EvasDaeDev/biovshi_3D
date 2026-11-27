import type {Vec3} from '../types.js';
import type {RigPose} from './gait.js';

export function poseJointAnchor(part:RigPose,byId:ReadonlyMap<string,RigPose>):Vec3{
 if(part.id==='pelvis')return part.a.map((value,index)=>(value+part.b[index]!)/2) as unknown as Vec3;
 if(part.id==='chest')return byId.get('abdomen')!.b;
 if(part.id==='head')return byId.get('neck')!.b;
 if(part.id.endsWith('.foot'))return byId.get(part.id.replace('.foot','.lowerLeg'))!.b;
 return part.a;
}

export function poseRotation([x,y,z]:Vec3):(p:Vec3)=>Vec3{
 const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
 return ([a,b,c])=>{
  const i=cz*a-sz*b,j=sz*a+cz*b,k=cy*c-sy*i;
  return [cy*i+sy*c,cx*j-sx*k,sx*j+cx*k];
 };
}
