import type {Vec3} from '../types.js';
export interface ImpactMotionSample {
 readonly torso:Vec3;
 readonly head:Vec3;
 readonly leftArm:Vec3;
 readonly rightArm:Vec3;
 readonly compression:number;
}
const zero=():Vec3=>[0,0,0];
const empty=():ImpactMotionSample=>({torso:zero(),head:zero(),leftArm:zero(),rightArm:zero(),compression:0});
const scale=(p:Vec3,k:number):Vec3=>[p[0]*k,p[1]*k,p[2]*k];
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
function blend(a:ImpactMotionSample,b:ImpactMotionSample,t:number):ImpactMotionSample{
 return {torso:mix(a.torso,b.torso,t),head:mix(a.head,b.head,t),leftArm:mix(a.leftArm,b.leftArm,t),rightArm:mix(a.rightArm,b.rightArm,t),compression:a.compression+(b.compression-a.compression)*t};
}
/** World-directed, bounded nominal-rig pose offsets. Repeated hits rebase
 * from the current evaluated sample; no additive growth and no pose-query
 * mutation. Health, recoil and incapacitation remain separate. */
export class ImpactMotion {
 private start=empty();private peak=empty();private current=empty();
 private age=.78;private rise=.085;
 hit(segment:string,dx:number,dz:number,critical=false):void{
  const n=Math.hypot(dx,dz);
  const dir:Vec3=n>1e-8?[dx/n,0,dz/n]:[0,0,0];
  const head=segment==='head'||segment==='neck',central=head||['pelvis','abdomen','chest'].includes(segment);
  const leg=/Leg$|foot$/.test(segment),arm=/Arm$|hand$/.test(segment);
  const k=critical?1.2:1;
  this.start=this.current;
  this.peak={
   torso:scale(dir,(central?.105:leg?.075:.045)*k),
   head:scale(dir,(head?.13:central?.065:.025)*k),
   leftArm:scale(dir,(arm&&segment.startsWith('L.')?.13:central?.035:.015)*k),
   rightArm:scale(dir,(arm&&segment.startsWith('R.')?.13:central?.035:.015)*k),
   compression:(leg?.045:central?.025:.012)*k
  };
  this.rise=head?.065:leg?.11:.085;this.age=0;
 }
 advance(dt:number):void{
  if(!Number.isFinite(dt)||dt<0)throw new RangeError('Invalid impact delta');
  this.age=Math.min(.78,this.age+dt);
  this.current=this.age<this.rise?blend(this.start,this.peak,smooth(this.age/this.rise)):
   blend(this.peak,empty(),smooth((this.age-this.rise)/(.78-this.rise)));
 }
 get sample():ImpactMotionSample{return blend(this.current,this.current,0);}
 clear():void{this.start=this.peak=this.current=empty();this.age=.78;}
}
/** Only rotate vectors, never translate them with the actor root. */
export function localImpact(v:Vec3,yaw:number):Vec3{
 const c=Math.cos(yaw),s=Math.sin(yaw);return [c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];
}
