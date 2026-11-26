import type { Vec3 } from '../types.js';
import type { RigPose } from './gait.js';
import { LAB_SEGMENTS } from './anatomy.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a:Vec3,n:number):Vec3=>[a[0]*n,a[1]*n,a[2]*n];
const center=(p:RigPose):Vec3=>scale(add(p.a,p.b),.5);
const unit=(v:Vec3,fallback:Vec3):Vec3=>{const l=Math.hypot(...v);return l>1e-9?scale(v,1/l):fallback;};
const lengths=new Map(LAB_SEGMENTS.map(p=>[p.id,p.nominalLength]));
/** Rebuild a connected skeleton from desired directions, not independently
 * interpolated endpoints. The full nominal rig is supplied before filtering
 * absent parts, so no missing limb can invalidate the transform chain. */
export function constrainRig(pose:readonly RigPose[],customLengths:ReadonlyMap<string,number>=lengths,scaleOffsets=1,curvedThorax=false,neckFollow=0):readonly RigPose[]{
 const length=(id:string)=>customLengths.get(id)??lengths.get(id)!;
 const raw=new Map(pose.map(p=>[p.id,p])),out=new Map<string,RigPose>();
 const get=(id:string)=>raw.get(id)!;
 const put=(id:string,a:Vec3,b:Vec3=a)=>out.set(id,{id,a,b,radius:get(id).radius});
 const girdle=(id:string,c:Vec3)=>{const p=get(id),axis=unit(sub(p.b,p.a),[1,0,0]),half=scale(axis,length(id)/2);
  put(id,sub(c,half),add(c,half));};
 const hip=center(get('pelvis')),oldChest=center(get('chest'));
 const spine=unit(sub(oldChest,hip),[0,1,0]);
 // Fixed anatomical attachment offsets from the two girdle centres.
 const abdomenStart=add(hip,scale(spine,.10*scaleOffsets)),abdomenEnd=add(abdomenStart,scale(spine,length('abdomen')));
 const thorax=curvedThorax?unit([spine[0]*1.22,spine[1],spine[2]*1.22],spine):spine;
 const chest=add(abdomenEnd,scale(thorax,.14*scaleOffsets));
 girdle('pelvis',hip);put('abdomen',abdomenStart,abdomenEnd);girdle('chest',chest);
 const resting=unit(sub(get('head').a,oldChest),spine);
 let headAxis=resting;
 if(neckFollow>0){
  // The chest capsule spans the shoulders. Remove that axis from the
  // thoracic spine direction so the neck inherits shoulder roll as well.
  const across=unit(sub(get('chest').b,get('chest').a),[1,0,0]);
  const along=thorax[0]*across[0]+thorax[1]*across[1]+thorax[2]*across[2];
  const up=unit(sub(thorax,scale(across,along)),thorax);
  headAxis=unit(add(scale(resting,1-neckFollow),scale(up,neckFollow)),up);
 }
 const neckEnd=add(chest,scale(headAxis,length('neck')));
 put('neck',chest,neckEnd);put('head',add(neckEnd,scale(headAxis,.10*scaleOffsets)));
 for(const side of ['L','R']){
  for(const [upper,lower,end,girdleId] of [['upperLeg','lowerLeg','foot','pelvis'],['upperArm','lowerArm','hand','chest']] as const){
   const u=side+'.'+upper,l=side+'.'+lower,e=side+'.'+end;
   const g=out.get(girdleId)!,origin=side==='L'?g.a:g.b;
   const ru=get(u),rl=get(l),re=get(e);
   const joint=add(origin,scale(unit(sub(ru.b,ru.a),[0,-1,0]),length(u)));
   const tip=add(joint,scale(unit(sub(rl.b,rl.a),[0,-1,0]),length(l)));
   put(u,origin,joint);put(l,joint,tip);put(e,add(tip,sub(re.a,rl.b)));
  }
 }
 return LAB_SEGMENTS.map(p=>out.get(p.id)!);
}
