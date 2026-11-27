import type {PhysicsSegmentPose,Vec3} from '../types.js';
import {LAB_SEGMENTS} from './anatomy.js';
import type {PoseSegment} from './pose-editor.js';

export interface SegmentDimensions {
 readonly length:number;
 readonly radius:number;
 readonly offset?:Vec3;
 readonly collider?:{readonly length?:number;readonly radius?:number};
}
export type SharedAnatomy=ReadonlyMap<string,SegmentDimensions>;
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a:Vec3,n:number):Vec3=>[a[0]*n,a[1]*n,a[2]*n];
const mid=(p:PhysicsSegmentPose)=>mul(add(p.a,p.b),.5);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a:Vec3,fallback:Vec3)=>{const length=Math.hypot(...a);return length>1e-8?mul(a,1/length):fallback;};
const girdle=(id:string)=>id==='pelvis'||id==='chest';
const definitions=new Map(LAB_SEGMENTS.map(part=>[part.id,part]));
const socket=(id:string,parent:PhysicsSegmentPose):Vec3=>{
 if(id==='abdomen'||id==='neck')return mid(parent);
 if(id.endsWith('.upperLeg')||id.endsWith('.upperArm'))return id.startsWith('L.')?parent.a:parent.b;
 return parent.b;
};

export function useSharedAnatomy(parts:readonly PoseSegment[],reference:readonly PoseSegment[]|undefined):readonly PoseSegment[]{
 if(!reference||parts===reference)return parts;
 const byId=new Map(reference.map(part=>[part.id,part]));
 return parts.map(part=>{
  const dimensions=byId.get(part.id);
  if(!dimensions)return part;
  const {collider,...settings}=part;
  return {...settings,length:dimensions.length,radius:dimensions.radius,...(dimensions.collider?{collider:dimensions.collider}:{})};
 });
}

/** Capsule axes are centred on the segment. Keep the animation endpoints
 * intact since they also drive attachments, mesh orientation and IK. */
export function physicalCapsule(part:PhysicsSegmentPose):PhysicsSegmentPose{
 const spec=part.collider;
 if(!spec)return part;
 const radius=spec.radius??part.radius,axis=sub(part.b,part.a);
 const length=Math.hypot(...axis),center=mid(part);
 const half=spec.length!==undefined&&length>1e-9?mul(axis,spec.length/(2*length)):null;
 return {id:part.id,a:half?sub(center,half):part.a,b:half?add(center,half):part.b,radius};
}

export function fitSharedAnatomy(pose:readonly PhysicsSegmentPose[],anatomy:SharedAnatomy|undefined):readonly PhysicsSegmentPose[]{
 if(!anatomy?.size)return pose;
 const old=new Map(pose.map(part=>[part.id,part])),next=new Map<string,PhysicsSegmentPose>();
 const chest=old.get('chest'),abdomen=old.get('abdomen');
 const lateral=chest?unit(sub(chest.b,chest.a),[1,0,0]):[1,0,0] as Vec3;
 const thorax=chest&&abdomen?sub(mid(chest),abdomen.b):[0,1,0] as Vec3;
 const across=thorax[0]*lateral[0]+thorax[1]*lateral[1]+thorax[2]*lateral[2];
 const bodyUp=unit(sub(thorax,mul(lateral,across)),[0,1,0]);
 for(const part of pose){
  const spec=anatomy.get(part.id),parent=definitions.get(part.id)?.parent;
  const from=parent?old.get(parent):undefined,to=parent?next.get(parent):undefined;
  let offset=from&&to&&from!==to?sub(socket(part.id,to),socket(part.id,from)):null;
  if(spec?.offset){
   const up=part.id==='head'&&from?unit(sub(from.b,from.a),bodyUp):bodyUp;
   const forward=unit(cross(lateral,up),[0,0,1]);
   const [x,y,z]=spec.offset;
   offset=add(offset??[0,0,0],add(add(mul(lateral,x),mul(up,y)),mul(forward,z)));
  }
  if(!offset&&!spec){next.set(part.id,part);continue;}
  let a=offset?add(part.a,offset):part.a,b=offset?add(part.b,offset):part.b;
  if(spec){
   const axis=sub(b,a),length=Math.hypot(...axis);
   if(length>1e-9&&Math.abs(length-spec.length)>1e-7){
    const resized=mul(axis,spec.length/length);
    if(girdle(part.id)){a=add(a,mul(sub(axis,resized),.5));}
    b=add(a,resized);
   }
  }
  const collider=spec?.collider??part.collider;
  next.set(part.id,{...part,a,b,radius:spec?.radius??part.radius,...(collider?{collider}:{})});
 }
 return Array.from(next.values());
}
