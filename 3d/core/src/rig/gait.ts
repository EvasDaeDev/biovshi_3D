import type { Vec3 } from '../types.js';
import { solveTwoBone } from './two-bone.js';
import { LAB_SEGMENTS } from './anatomy.js';
import { mobilityFor, type Mobility } from './mobility.js';
import { pronePose, blendGroundPose } from './prone.js';
import { MOVEMENT,bipedStep } from './movement-timing.js';
import { HopCycle, type HopSample } from './hop-cycle.js';
import { constrainRig } from './rig-constraints.js';
import { balanceStandingPose } from './balance.js';
import { balanceSingleSupport } from './single-support.js';
import { CrawlAnchors, type CrawlAnchor } from './crawl-anchors.js';
import { residualMode,residualTraction,type ResidualTraction } from './residual-traction.js';
const FOOT_RADIUS=LAB_SEGMENTS.find(p=>p.id==='L.foot')!.radius;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
interface Foot { plant:Vec3; start:Vec3; target:Vec3; phase:number; moving:boolean; duration:number; lift:number }
export interface RigPose { readonly id:string; readonly a:Vec3; readonly b:Vec3; readonly radius:number }
export class PatientGait {
  private moveAmount=0; private next=0;private stepWait=0;private steps=0;private runAmount=0;private signedSpeed=0;
  get stepCount():number{return this.steps;}
  get footStates(){return this.feet.map(f=>({moving:f.moving,target:[...f.target] as Vec3,point:[...f.plant] as Vec3}));}
  private supportDrop=0;
  private hop=new HopCycle();private hopSample:HopSample={distance:0,lift:0,phase:'idle',followsRoot:false};
  get hopHeight():number{return this.hopSample.lift;}
  get hopPhase():HopSample['phase']{return this.hopSample.phase;}
  private anchors=new CrawlAnchors();
  private anchored(mobility:Mobility):boolean{return mobility.mode==='arm-crawl'&&mobility.arms.some(n=>n>=2);}
  crawlAnchors(pose:readonly RigPose[]):readonly CrawlAnchor[]{return this.proneAmount===1?this.anchors.snapshot(pose,this.mobility,this.ground):[];}
  residualSupport(pose:readonly RigPose[]):ResidualTraction|null{return this.proneAmount===1?residualTraction(pose,this.mobility,this.crawlPhase,this.ground):null;}
  travel(dt:number,speed:number,mobility:Mobility,id:number,root:Vec3,yaw:number,t:number,ground:(x:number,z:number)=>number):number{
    if(this.anchored(mobility)&&this.proneAmount===1){
      const before=this.pose(id,root,yaw,t);
      this.anchors.advance(dt,speed,yaw,before,mobility,ground);
      const planted=this.anchors.snapshot(this.anchors.apply(before,mobility,ground),mobility,ground).some(a=>a.valid);
      return planted?speed*dt*(mobility.arms.filter(n=>n>=2).length===1?1.35:1):0;
    }
    this.anchors.reset();
    if(mobility.mode==='single-support'){this.hopSample=this.hop.advance(dt,speed);return this.hopSample.distance;}
    this.hop.reset();this.hopSample={distance:0,lift:0,phase:'idle',followsRoot:false};
    if(!mobility.prone){
      if(!this.groundedStride||mobility.mode!=='biped')return speed*dt;
      const direction=Math.sign(speed);
      const stance=this.feet.filter(foot=>!foot.moving);
      const reach=Math.min(...stance.map(({plant})=>{
        const behind=((root[0]-plant[0])*Math.sin(yaw)-(root[2]-plant[2])*Math.cos(yaw))*direction;
        return .48-behind;
      }));
      return direction*Math.min(Math.abs(speed)*dt,Math.max(0,reach));
    }
    if(this.proneAmount<1||!residualMode(mobility)||Math.abs(speed)<.0001)return 0;
    const traction=residualTraction(this.pose(id,root,yaw,t),mobility,this.crawlPhase,ground);
    return speed*dt*(traction?.scale??0);
  }
  private proneAmount=0;private crawlPhase=0;private crawlEffort=0;private crawlDirection=1;
  private mobility:Mobility=mobilityFor(LAB_SEGMENTS.map(s=>s.id));
  private active:readonly string[]=LAB_SEGMENTS.map(s=>s.id);
  private ground:(x:number,z:number)=>number=()=>0;
  get posture(): 'upright'|'falling'|'prone' {return this.proneAmount===0?'upright':this.proneAmount===1?'prone':'falling';}
  private feet:[Foot,Foot];
  constructor(root:Vec3,yaw=0,private readonly groundedStride=false){
    const foot=(side:number):Foot=>{const p=add(root,[Math.cos(yaw)*side*.18,FOOT_RADIUS,Math.sin(yaw)*side*.18]);return {plant:p,start:p,target:p,phase:0,moving:false,duration:.32,lift:.085};};
    this.feet=[foot(-1),foot(1)];
  }
  advance(root:Vec3,yaw:number,speed:number,dt:number,ground:(x:number,z:number)=>number=()=>root[1],mobility:Mobility=mobilityFor(LAB_SEGMENTS.map(s=>s.id)),active:readonly string[]=LAB_SEGMENTS.map(s=>s.id),forcedProne?:number,holdFeet=false):void{
    this.mobility=mobility;this.active=active;this.ground=ground;
    const support=mobility.support;
    if(forcedProne!==undefined){
      this.proneAmount=clamp(forcedProne);this.anchors.reset();this.hop.reset();this.hopSample={distance:0,lift:0,phase:'idle',followsRoot:false};
      this.crawlEffort=0;this.signedSpeed=0;this.moveAmount=0;this.runAmount=0;this.stepWait=0;
      this.supportDrop=0;
      for(let i=0;i<2;i++){
        const side=i===0?-1:1,x=root[0]+Math.cos(yaw)*side*.18,z=root[2]+Math.sin(yaw)*side*.18;
        const f=this.feet[i]!,p:Vec3=[x,ground(x,z)+FOOT_RADIUS,z];f.plant=p;f.start=p;f.target=p;f.phase=0;f.moving=false;
      }
      return;
    }
    this.proneAmount=clamp(this.proneAmount+(mobility.prone?1:-1)*dt/.65);
    if(mobility.prone){
      const desired=mobility.speedScale>0?clamp(Math.abs(speed)/(MOVEMENT.walkSpeed*mobility.speedScale)):0;
      this.crawlEffort+=(desired-this.crawlEffort)*(1-Math.exp(-7*dt));
      if(Math.abs(speed)>.005)this.crawlDirection=Math.sign(speed);
      if(this.proneAmount>=1)this.crawlPhase+=dt*Math.PI*this.crawlEffort/(MOVEMENT.hopFlightSeconds+MOVEMENT.hopPauseSeconds);
    }
    const plan=bipedStep(speed);
    this.signedSpeed=speed;
    this.runAmount+=(plan.run-this.runAmount)*(1-Math.exp(-5*dt));
    const single=support[0]!==support[1];
    const blend=1-Math.exp(-5*dt);
    this.supportDrop+=((single?.055:(!support[0]&&!support[1]?.28:0))-this.supportDrop)*blend;
    this.moveAmount+=(clamp(Math.abs(speed)/MOVEMENT.walkSpeed)-this.moveAmount)*(1-Math.exp(-4*dt));
    this.stepWait=Math.max(0,this.stepWait-dt);
    if(single){
      const index=support[0]?0:1,side=index===0?-1:1,f=this.feet[index]!;
      this.feet[0].moving=false;this.feet[1].moving=false;
      if(this.hopSample.followsRoot||Math.hypot(f.plant[0]-root[0],f.plant[2]-root[2])>.50){
        const x=root[0]+Math.cos(yaw)*side*.18,z=root[2]+Math.sin(yaw)*side*.18;
        f.plant=[x,ground(x,z)+.13,z];
      }else f.plant=[f.plant[0],ground(f.plant[0],f.plant[2])+.13,f.plant[2]];
      return;
    }
    for(let i=0;i<2;i++){
      const f=this.feet[i]!;
      if(!support[i]){f.moving=false;continue;}
      if(!f.moving){f.plant=[f.plant[0],ground(f.plant[0],f.plant[2])+FOOT_RADIUS,f.plant[2]];continue;}
      f.phase=Math.min(1,f.phase+dt/f.duration);
      const t=f.phase*f.phase*(3-2*f.phase),p=mix(f.start,f.target,t);
      f.plant=[p[0],Math.max(ground(p[0],p[2])+FOOT_RADIUS,p[1]+Math.sin(Math.PI*f.phase)*f.lift),p[2]];
      if(f.phase===1){f.moving=false;f.plant=[f.target[0],ground(f.target[0],f.target[2])+FOOT_RADIUS,f.target[2]];}
    }
    const ideal=(side:number,lead:number):Vec3=>{const x=root[0]+Math.cos(yaw)*side*.18+Math.sin(yaw)*lead,z=root[2]+Math.sin(yaw)*side*.18-Math.cos(yaw)*lead;return [x,ground(x,z)+FOOT_RADIUS,z];};
    if(!holdFeet&&support[0]&&support[1]&&!this.feet.some(f=>f.moving)&&this.stepWait<=1e-8){
      const moving=Math.abs(speed)>.055,lead=moving?plan.lead:0;
      const error=(i:number)=>{const f=this.feet[i]!,p=ideal(i===0?-1:1,0);return Math.hypot(f.plant[0]-p[0],f.plant[2]-p[2]);};
      let index=this.next;
      if(!moving&&error(1-index)>error(index))index=1-index;
      const f=this.feet[index]!,target=ideal(index===0?-1:1,lead);
      // At low speeds wait until there is a meaningful displacement; at
      // normal speed the alternating cadence gives a full stance interval.
      const separation=Math.hypot(f.plant[0]-target[0],f.plant[2]-target[2]);
      if(separation>(moving?.16:.13)){
        f.start=f.plant;f.target=target;f.phase=0;f.moving=true;
        f.duration=moving?plan.swing:.32;f.lift=moving?plan.lift:.07;
        this.next=1-index;this.stepWait=moving?plan.interval:.50;this.steps++;
      }
    }
  }
  pose(id:number,root:Vec3,yaw:number,t:number):readonly RigPose[]{
    const moving=this.moveAmount,sway=Math.sin(t*.88+id*1.4),sway2=Math.sin(t*1.37+id*.9),breathing=Math.sin(t*1.95+id*.6);
    const lateral=(.018*sway+.009*sway2)*(1-moving*.42),roll=(.045*Math.sin(t*.88+id*.9)+.019*sway2)*(1-moving*.35);
    const forwardZ=(p:Vec3)=>-Math.sin(yaw)*(p[0]-root[0])+Math.cos(yaw)*(p[2]-root[2]);
    const gaitPhase=Math.max(-1,Math.min(1,(forwardZ(this.feet[0].plant)-forwardZ(this.feet[1].plant))/.55));
    const lean=Math.sign(this.signedSpeed)*moving*(.045+this.runAmount*.055)+Math.sin(t*.72+id)*.012,bob=moving*.012*(1-Math.abs(gaitPhase))+breathing*.006;
    const stanceDrop=this.groundedStride?moving*(.012+.018*this.runAmount):this.mobility.mode==='biped'?moving*(.065+.035*this.runAmount):0;
    const hip:Vec3=[lateral,1.02+bob-this.supportDrop-stanceDrop,0],chest:Vec3=[-lateral*.35,1.51+bob-this.supportDrop-stanceDrop,-.035-lean*.5];
    const head:Vec3=[-lateral*.65+.012*Math.sin(t*.62+id),1.89+bob-this.supportDrop-stanceDrop,-.045-lean*.24];
    const spineSway=this.groundedStride?moving*gaitPhase:0;
    const chestPose=add(chest,[-roll*.12-spineSway*.045,spineSway*.018,lean*.18-.035*spineSway]);
    const hipTwist=.11*moving*gaitPhase, chestTwist=-(this.groundedStride?.29:.16)*moving*gaitPhase;
    const hipRoll=.025*sway+.035*moving*gaitPhase,chestRoll=-roll;
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
      const swing=moving*Math.max(-1,Math.min(1,-foot[2]/.36));
      const elbow=add(shoulder,[side*.055,-.31,.035+swing*.17]),hand=add(shoulder,[side*.06,-.59,.015+swing*(.28+.07*this.runAmount)]);
      put(key+'upperArm',shoulder,elbow);put(key+'lowerArm',elbow,hand);put(key+'hand',hand);
    }
    const standing=LAB_SEGMENTS.map(def=>{const [a,b]=points.get(def.id)!;return {id:def.id,a,b,radius:def.radius};});
    if(this.proneAmount===0){
      let fixed=constrainRig(standing);const lift=this.hopSample.lift;
      const single=this.mobility.mode==='single-support';
      if(single){const i=this.mobility.support[0]?0:1;fixed=balanceSingleSupport(fixed,this.active,i===0?'L':'R',this.feet[i]!.plant,this.ground);}
      if(lift>0)return fixed.map(p=>({...p,a:add(p.a,[0,lift,0]),b:add(p.b,[0,lift,0])}));
      if(single)return fixed;
      const stance=['L.foot','R.foot'].filter((id,i)=>this.active.includes(id)&&!this.feet[i]!.moving);
      return balanceStandingPose(fixed,this.active,stance,this.ground);
    }
    const prone=blendGroundPose(standing,pronePose(root,yaw,this.crawlPhase,this.crawlEffort,this.crawlDirection,this.mobility,this.ground),this.proneAmount,this.active,this.ground);
    return this.proneAmount===1&&this.anchored(this.mobility)?this.anchors.apply(prone,this.mobility,this.ground):prone;
  }
}
