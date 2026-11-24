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
  private supportShift=0; private supportDrop=0;
  private feet:[Foot,Foot];
  constructor(root:Vec3,yaw=0){
    const foot=(side:number):Foot=>{const p=add(root,[Math.cos(yaw)*side*.18,.055,Math.sin(yaw)*side*.18]);return {plant:p,start:p,target:p,phase:0,moving:false};};
    this.feet=[foot(-1),foot(1)];
  }
  advance(root:Vec3,yaw:number,speed:number,dt:number,ground:(x:number,z:number)=>number=()=>root[1],support:readonly [boolean,boolean]=[true,true]):void{
    const sprint=Math.abs(speed)>1.4;
    const single=support[0]!==support[1];
    const blend=1-Math.exp(-5*dt);
    this.supportShift+=((single?(support[0]?-.12:.12):0)-this.supportShift)*blend;
    this.supportDrop+=((single?.055:(!support[0]&&!support[1]?.28:0))-this.supportDrop)*blend;
    this.moveAmount+=(clamp(Math.abs(speed)/1.9)-this.moveAmount)*(1-Math.exp(-4*dt));
    this.walkTime+=dt*Math.abs(speed)*5.2;
    for(let i=0;i<2;i++){
      const f=this.feet[i]!;
      if(!support[i]){f.moving=false;continue;}
      if(!f.moving){f.plant=[f.plant[0],ground(f.plant[0],f.plant[2])+.055,f.plant[2]];continue;}
      f.phase=Math.min(1,f.phase+dt*(sprint?3.8:2.8));
      const t=f.phase*f.phase*(3-2*f.phase),p=mix(f.start,f.target,t);
      f.plant=[p[0],Math.max(ground(p[0],p[2])+.055,p[1]+Math.sin(Math.PI*f.phase)*(sprint?.19:.13)),p[2]];
      if(f.phase===1){f.moving=false;f.plant=[f.target[0],ground(f.target[0],f.target[2])+.055,f.target[2]];}
    }
    const ideal=(side:number,lead:number):Vec3=>{const x=root[0]+Math.cos(yaw)*side*.18+Math.sin(yaw)*lead,z=root[2]+Math.sin(yaw)*side*.18-Math.cos(yaw)*lead;return [x,ground(x,z)+.055,z];};
    if((support[0]||support[1])&&Math.abs(speed)>.03&&!this.feet.some(f=>f.moving)){
      const index=single?(support[0]?0:1):this.next;
      const f=this.feet[index]!;const target=ideal(index===0?-1:1,Math.sign(speed)*(single?.10:(sprint?.35:.23)));
      if(dist(f.plant,target)>(single?.12:.23)){f.start=f.plant;f.target=target;f.phase=0;f.moving=true;this.next=1-index;}
    }
    if(Math.abs(speed)<=.09)this.feet.forEach((f,i)=>{if(support[i]&&!f.moving&&dist(f.plant,root)>.75)f.plant=ideal(i===0?-1:1,-.02);});
  }
  pose(id:number,root:Vec3,yaw:number,t:number):readonly RigPose[]{
    const moving=this.moveAmount,sway=Math.sin(t*.88+id*1.4),sway2=Math.sin(t*1.37+id*.9),breathing=Math.sin(t*1.95+id*.6);
    const lateral=(.018*sway+.009*sway2)*(1-moving*.42),roll=(.045*Math.sin(t*.88+id*.9)+.019*sway2)*(1-moving*.35);
    const lean=moving*.045+Math.sin(t*.72+id)*.012,bob=moving*.018*Math.sin(this.walkTime*2)+breathing*.006;
    const hip:Vec3=[lateral+this.supportShift,1.02+bob-this.supportDrop,0],chest:Vec3=[-lateral*.35+this.supportShift*.65,1.51+bob-this.supportDrop,-.035-lean*.5];
    const head:Vec3=[-lateral*.65+this.supportShift*.5+.012*Math.sin(t*.62+id),1.89+bob-this.supportDrop,-.045-lean*.24];
    const chestPose=add(chest,[-roll*.12,0,lean*.18]);
    const gaitPhase=Math.sin(this.walkTime);
    const hipTwist=.11*moving*gaitPhase, chestTwist=-.16*moving*gaitPhase;
    const hipRoll=.025*sway+.035*moving*Math.sin(this.walkTime),chestRoll=-roll;
    const across=(center:Vec3,half:number,twist:number,tilt:number,side:number):Vec3=>add(center,[side*half*Math.cos(twist)*Math.cos(tilt),side*half*Math.sin(tilt),side*half*Math.sin(twist)*Math.cos(tilt)]);
    const pelvisCenter=add(hip,[0,-.055,0]),shoulderCenter=add(chestPose,[0,.05,0]);
    const hipAt=(side:number)=>across(pelvisCenter,.17,hipTwist,hipRoll,side);
    const shoulderAt=(side:number)=>across(shoulderCenter,.34,chestTwist,chestRoll,side);
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const world=(p:Vec3):Vec3=>add(root,[c*p[0]-s*p[2],p[1],s*p[0]+c*p[2]]);
    const local=(p:Vec3):Vec3=>{const x=p[0]-root[0],z=p[2]-root[2];return [c*x+s*z,p[1]-root[1],-s*x+c*z];};
    const points=new Map<string,readonly [Vec3,Vec3]>();
    const put=(key:string,a:Vec3,b:Vec3=a)=>points.set(key,[world(a),world(b)]);
    put('pelvis',hipAt(-1),hipAt(1));
    put('abdomen',add(hip,[0,.035,0]),add(chestPose,[0,-.095,0]));
    put('chest',shoulderAt(-1),shoulderAt(1));put('neck',chestPose,add(head,[0,-.14,0]));put('head',head);
    for(let i=0;i<2;i++){
      const side=i===0?-1:1,key=i===0?'L.':'R.',hipRoot=hipAt(side),shoulder=shoulderAt(side);
      const foot=local(this.feet[i]!.plant);
      const ankle=add(foot,[0,.04,.055]),ik=solveTwoBone(hipRoot,ankle,.49,.50,[0,.02,-1]);
      put(key+'upperLeg',hipRoot,ik.joint);put(key+'lowerLeg',ik.joint,ik.end);put(key+'foot',add(ik.end,[0,-.04,-.055]));
      const swing=moving*Math.sin(this.walkTime+(side===1?Math.PI:0));
      const elbow=add(shoulder,[side*.055,-.31,.08+swing*.12]),hand=add(shoulder,[side*.06,-.59,-.06+swing*.22]);
      put(key+'upperArm',shoulder,elbow);put(key+'lowerArm',elbow,hand);put(key+'hand',hand);
    }
    return LAB_SEGMENTS.map(def=>{const [a,b]=points.get(def.id)!;return {id:def.id,a,b,radius:def.radius};});
  }
}
