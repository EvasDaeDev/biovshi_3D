import type { Vec3 } from '../types.js';
import { solveTwoBone } from './two-bone.js';
import { LAB_SEGMENTS } from './anatomy.js';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
interface Foot { plant:Vec3; start:Vec3; target:Vec3; phase:number; moving:boolean }
export interface RigPose { readonly id:string; readonly a:Vec3; readonly b:Vec3; readonly radius:number }
export class PatientGait {
  private walkTime=0; private moveAmount=0; private next=0;
  private feet:[Foot,Foot];
  constructor(root:Vec3){
    const foot=(side:number):Foot=>{const p=add(root,[side*.18,.055,0]);return {plant:p,start:p,target:p,phase:0,moving:false};};
    this.feet=[foot(-1),foot(1)];
  }
  advance(root:Vec3,yaw:number,speed:number,dt:number):void{
    const sprint=Math.abs(speed)>1.4;
    this.moveAmount+=(clamp(Math.abs(speed)/1.9)-this.moveAmount)*(1-Math.exp(-4*dt));
    this.walkTime+=dt*Math.abs(speed)*5.2;
    for(const f of this.feet)if(f.moving){
      f.phase=Math.min(1,f.phase+dt*(sprint?3.8:2.8));
      const t=f.phase*f.phase*(3-2*f.phase),p=mix(f.start,f.target,t);
      f.plant=[p[0],p[1]+Math.sin(Math.PI*f.phase)*(sprint?.19:.13),p[2]];
      if(f.phase===1){f.moving=false;f.plant=f.target;}
    }
    const ideal=(side:number,lead:number):Vec3=>add(root,[Math.cos(yaw)*side*.18+Math.sin(yaw)*lead,.055,Math.sin(yaw)*side*.18-Math.cos(yaw)*lead]);
    if(Math.abs(speed)>.09&&!this.feet.some(f=>f.moving)){
      const f=this.feet[this.next]!;const target=ideal(this.next===0?-1:1,Math.sign(speed)*(sprint?.35:.23));
      if(dist(f.plant,target)>.23){f.start=f.plant;f.target=target;f.phase=0;f.moving=true;this.next=1-this.next;}
    }
    if(Math.abs(speed)<=.09)this.feet.forEach((f,i)=>{if(!f.moving&&dist(f.plant,root)>.75)f.plant=ideal(i===0?-1:1,-.02);});
  }
  pose(id:number,root:Vec3,yaw:number,t:number):readonly RigPose[]{
    const moving=this.moveAmount,sway=Math.sin(t*.88+id*1.4),sway2=Math.sin(t*1.37+id*.9),breathing=Math.sin(t*1.95+id*.6);
    const lateral=(.018*sway+.009*sway2)*(1-moving*.42),roll=(.045*Math.sin(t*.88+id*.9)+.019*sway2)*(1-moving*.35);
    const lean=moving*.045+Math.sin(t*.72+id)*.012,bob=moving*.018*Math.sin(this.walkTime*2)+breathing*.006;
    const hip:Vec3=[lateral,1.02+bob,0],chest:Vec3=[-lateral*.35,1.51+bob,-.035-lean*.5];
    const head:Vec3=[-lateral*.65+.012*Math.sin(t*.62+id),1.89+bob,-.045-lean*.24];
    const chestPose=add(chest,[-roll*.12,0,lean*.18]);
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const world=(p:Vec3):Vec3=>add(root,[c*p[0]-s*p[2],p[1],s*p[0]+c*p[2]]);
    const local=(p:Vec3):Vec3=>{const x=p[0]-root[0],z=p[2]-root[2];return [c*x+s*z,p[1]-root[1],-s*x+c*z];};
    const points=new Map<string,readonly [Vec3,Vec3]>();
    const put=(key:string,a:Vec3,b:Vec3=a)=>points.set(key,[world(a),world(b)]);
    put('torso',hip,chestPose);put('neck',chestPose,add(head,[0,-.14,0]));put('head',head);
    for(let i=0;i<2;i++){
      const side=i===0?-1:1,key=i===0?'L.':'R.',hipRoot=add(hip,[side*.17,-.055,0]),shoulder=add(chest,[side*.34,.05,0]);
      const f=local(this.feet[i]!.plant),foot:Vec3=[f[0],Math.max(.045,f[1]),f[2]];
      const ankle=add(foot,[0,.04,.055]),ik=solveTwoBone(hipRoot,ankle,.49,.50,[0,.02,-1]);
      put(key+'upperLeg',hipRoot,ik.joint);put(key+'lowerLeg',ik.joint,ik.end);put(key+'foot',add(ik.end,[0,-.04,-.055]));
      const swing=moving*Math.sin(this.walkTime+(side===1?Math.PI:0));
      const elbow=add(shoulder,[side*.055,-.31,.08+swing*.12]),hand=add(shoulder,[side*.06,-.59,-.06+swing*.22]);
      put(key+'upperArm',shoulder,elbow);put(key+'lowerArm',elbow,hand);put(key+'hand',hand);
    }
    return LAB_SEGMENTS.map(def=>{const [a,b]=points.get(def.id)!;return {id:def.id,a,b,radius:def.radius};});
  }
}
