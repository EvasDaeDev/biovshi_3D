import {braceFall,type FallBrace} from '../animation/fall-brace.js';
import {compensateHead} from '../animation/body-compensation.js';
import {POUNCE} from './pounce-timing.js';
import {ArmCarriage} from '../animation/arm-carriage.js';
import {pivotPlan} from '../animation/turn-motion.js';
import {kickTravelLimit} from '../combat/strike-locomotion.js';
import {KnockdownMotion} from '../animation/knockdown-motion.js';
import {localImpact,type ImpactMotionSample} from '../animation/impact-motion.js';
import type {AuthoredMotion} from './authored-motion.js';
import {BASE_MOTION_PROFILE,type MotionProfile} from '../animation/motion-profile.js';
import {LocomotionMotion,organicSwing} from '../animation/locomotion-motion.js';
import {EXPRESSION_SLOTS,PoseTransition,type ExpressionSlot} from '../animation/pose-transition.js';
import type { Vec3 } from '../types.js';
import { solveTwoBone } from './two-bone.js';
import { LAB_SEGMENTS } from './anatomy.js';
import { mobilityFor, type Mobility } from './mobility.js';
import { pronePose, blendGroundPose } from './prone.js';
import { MOVEMENT,bipedStep,HORROR_MOVEMENT,horrorBipedStep,horrorRunStep,patientSwingProgress } from './movement-timing.js';
import { HopCycle, type HopSample } from './hop-cycle.js';
import { constrainRig } from './rig-constraints.js';
import { balanceStandingPose } from './balance.js';
import { balanceSingleSupport } from './single-support.js';
import { CrawlAnchors, type CrawlAnchor } from './crawl-anchors.js';
import { residualMode,residualTraction,type ResidualTraction } from './residual-traction.js';
const FREEZE_INDEX=EXPRESSION_SLOTS.indexOf('freeze');
const FOOT_RADIUS=LAB_SEGMENTS.find(p=>p.id==='L.foot')!.radius;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
interface Foot { plant:Vec3; start:Vec3; target:Vec3; phase:number; moving:boolean; duration:number; lift:number; running?:boolean }
export interface RigPose { readonly id:string; readonly a:Vec3; readonly b:Vec3; readonly radius:number }
export class PatientGait {
  private sprintCycle=false;private sprintBob=0;private sprintSlow=0;
  get running():boolean{return this.sprintCycle;}
  get runningAirborne():boolean{return this.sprintCycle&&this.feet.every(f=>f.moving&&f.phase>.10&&f.phase<.90);}
  private moveAmount=0; private next=0;private stepWait=0;private steps=0;private runAmount=0;private signedSpeed=0;
  private recoveryFoot:number|null=null;
  private recoveryCooldown=0;
  get recoveringSupport():boolean{return this.recoveryFoot!==null;}
  /** Start from the current (possibly airborne) foot, with a reachable world-space landing. */
  recoverSupport(root:Vec3,yaw:number,dx:number,dz:number,ground:(x:number,z:number)=>number,clear:(x:number,z:number)=>boolean):boolean{
    const n=Math.hypot(dx,dz);
    if(!this.organic||this.recoveringSupport||this.recoveryCooldown>0||this.mobility.prone||this.proneAmount!==0||this.hopSample.phase!=='idle'||n<1e-8)return false;
    const right=dx*Math.cos(yaw)+dz*Math.sin(yaw);
    const preferred=right<0?0:1;
    const order=this.feet[1-preferred]!.moving&&!this.feet[preferred]!.moving?[1-preferred,preferred]:[preferred,1-preferred];
    for(const i of order){
      if(!this.mobility.support[i])continue;
      const f=this.feet[i]!,side=i===0?-1:1;
      for(const reach of [.34,.20]){
        const x=root[0]+Math.cos(yaw)*side*.17+dx/n*reach;
        const z=root[2]+Math.sin(yaw)*side*.17+dz/n*reach;
        if(!clear(x,z)||Math.hypot(x-f.plant[0],z-f.plant[2])<.08||Math.abs(ground(x,z)-ground(f.plant[0],f.plant[2]))>.20)continue;
        f.start=f.plant;
        f.target=[x,ground(x,z)+FOOT_RADIUS,z];
        f.phase=0;f.duration=this.mobility.mode==='single-support'?.23:.18;f.lift=.075;f.moving=true;f.running=false;
        this.recoveryFoot=i;this.steps++;this.leapQueued=0;
        return true;
      }
    }
    return false;
  }
  get stepCount():number{return this.steps;}
  get footStates(){return this.feet.map(f=>({moving:f.moving,target:[...f.target] as Vec3,point:[...f.plant] as Vec3}));}
  private expression:PoseTransition;
  private carriage:ArmCarriage;
  private expressive:ReadonlyMap<string,RigPose>|undefined;
  /** Resolve expressive targets once per fixed tick. IK still owns lengths and supports. */
  advanceExpression(dt:number,hurt=false,intent:'stance'|'aggressive'|'stalk'|'freeze'='stance',guard=intent==='aggressive',bearing=0):void{
    if(!this.authored)return;
    if(this.organic)this.carriage.advanceAttention(dt,guard&&!hurt&&this.proneAmount===0&&this.hopSample.phase==='idle',bearing);
    const slot:ExpressionSlot=hurt?'hurt':this.hopSample.phase==='flight'?'jump':this.mobility.mode==='single-support'?'balance':this.authored[intent]?intent:'stance';
    this.expression.advance(slot,dt);
    const weights=this.expression.weights,base=this.authored.stance;
    const mixed=new Map<string,RigPose>();
    for(const def of LAB_SEGMENTS){
      const fallback=base?.get(def.id);
      const a:[number,number,number]=[0,0,0],b:[number,number,number]=[0,0,0];let weight=0,radius=def.radius;
      for(let i=0;i<EXPRESSION_SLOTS.length;i++){
        const w=weights[i]!,part=this.authored[EXPRESSION_SLOTS[i]!]?.get(def.id)??fallback;
        if(!part||w===0)continue;
        for(const axis of [0,1,2] as const){a[axis]+=part.a[axis]*w;b[axis]+=part.b[axis]*w;}
        weight+=w;radius=part.radius;
      }
      if(weight>0)mixed.set(def.id,{id:def.id,a:[a[0]/weight,a[1]/weight,a[2]/weight],b:[b[0]/weight,b[1]/weight,b[2]/weight],radius});
    }
    this.expressive=mixed;
  }
  private motion:LocomotionMotion;
  private get organic():boolean{return this.groundedStride&&!!this.authored?.stalk;}
  private restingFoot(side:number):readonly [number,number]{
    const guard=this.carriage.guardAmount,lead=side*this.motionProfile.asymmetry;
    const index=side<0?0:1;
    const idle=this.authored?.standing?.stance?.feet[index],ready=this.authored?.standing?.aggressive?.feet[index];
    const dx=(idle?.[0]??0)*(1-guard)+(ready?.[0]??0)*guard;
    const dz=(idle?.[2]??0)*(1-guard)+(ready?.[2]??0)*guard;
    return [side*(.25+.09*guard)+.012*lead*side+dx,-.075*lead+dz];
  }
  private supportDrop=0;
  private hop:HopCycle;
  private leap:HopCycle;private attackLeap=new HopCycle(POUNCE.prepare,POUNCE.flight,POUNCE.settle,true,POUNCE.distance);private pouncing=false;
  private leapHeld=false;private leapQueued=0;private hopSample:HopSample={distance:0,lift:0,phase:'idle',followsRoot:false};
  get hopHeight():number{return this.hopSample.lift;}
  get hopPhase():HopSample['phase']{return this.hopSample.phase;}
  private anchors:CrawlAnchors;
  private downAnchorWeight=0;
  private anchored(mobility:Mobility):boolean{return mobility.mode==='arm-crawl'&&mobility.arms.some(n=>n>=2);}
  crawlAnchors(pose:readonly RigPose[]):readonly CrawlAnchor[]{return this.proneAmount===1?this.anchors.snapshot(pose,this.mobility,this.ground):[];}
  residualSupport(pose:readonly RigPose[]):ResidualTraction|null{return this.proneAmount===1?residualTraction(pose,this.mobility,this.crawlPhase,this.ground):null;}
  travel(dt:number,speed:number,mobility:Mobility,id:number,root:Vec3,yaw:number,t:number,ground:(x:number,z:number)=>number,jump=false,driveRequested=true,kickSupport?:'L'|'R',pounce=false):number{
    if(this.downAnchorWeight>0){this.downAnchorWeight=0;this.anchors.reset();}
    let groundedLeap=false;
    if(mobility.mode==='biped'&&this.groundedStride){
      const idle=this.hopSample.phase==='idle';
      const attackLaunch=pounce&&jump&&!this.pouncing&&idle&&!this.sprintCycle;
      this.leapQueued=Math.max(0,this.leapQueued-dt);
      if(!pounce&&jump&&!this.leapHeld&&idle)this.leapQueued=.25;
      this.leapHeld=jump;
      const launch=attackLaunch||idle&&!pounce&&this.leapQueued>0&&this.feet.some(f=>!f.moving);
      if(launch)this.leapQueued=0;
      if(attackLaunch){this.pouncing=true;this.attackLeap.reset();}
      if(launch||this.hopSample.phase!=='idle'){
        const leap=this.pouncing?this.attackLeap:this.leap;
        this.hopSample=leap.advance(dt,attackLaunch?POUNCE.distance/(POUNCE.prepare+POUNCE.flight+POUNCE.settle):launch?(Math.abs(speed)>.03?speed:.035):0);
        const phase=this.hopSample.phase;
        if(phase==='idle')this.pouncing=false;
        groundedLeap=this.organic&&!this.pouncing&&driveRequested&&!this.hopSample.followsRoot&&(phase==='prepare'||phase==='pause');
        if(!groundedLeap)return this.hopSample.distance;
        // Keep a little ground travel through anticipation and absorption.
        // The normal stance envelope still protects the planted foot.
        speed*=phase==='prepare'?.55:.70;
      }
    }else{this.leap.reset();this.attackLeap.reset();this.pouncing=false;this.leapHeld=jump;this.leapQueued=0;}
    if(this.anchored(mobility)&&this.proneAmount===1){
      const before=this.pose(id,root,yaw,t);
      this.anchors.advance(dt,speed,yaw,before,mobility,ground);
      const planted=this.anchors.snapshot(this.anchors.apply(before,mobility,ground),mobility,ground).some(a=>a.valid);
      return planted?speed*dt*(mobility.arms.filter(n=>n>=2).length===1?1.35:1):0;
    }
    this.anchors.reset();
    if(mobility.mode==='single-support'){this.hopSample=this.hop.advance(dt,this.organic&&!driveRequested?0:speed);return this.hopSample.distance;}
    if(!groundedLeap){
      this.hop.reset();this.leap.reset();this.attackLeap.reset();this.pouncing=false;this.hopSample={distance:0,lift:0,phase:'idle',followsRoot:false};
    }
    if(!mobility.prone){
      if(!this.groundedStride||mobility.mode!=='biped')return speed*dt;
      const direction=Math.sign(speed);
      const stance=this.feet.filter(foot=>!foot.moving);
      const reach=Math.min(...stance.map(({plant})=>{
        const behind=((root[0]-plant[0])*Math.sin(yaw)-(root[2]-plant[2])*Math.cos(yaw))*direction;
        return (this.organic?HORROR_MOVEMENT.stanceReach:.48)-behind;
      }));
      const limit=this.organic&&this.sprintCycle&&!kickSupport&&speed>0?HORROR_MOVEMENT.maxRunSpeed:HORROR_MOVEMENT.maxStrideSpeed/Math.max(1,this.motionProfile.strideTempo);
      const requested=direction*Math.min((this.organic?Math.min(Math.abs(speed),limit):Math.abs(speed))*dt,Math.max(0,reach));
      return this.organic&&kickSupport?kickTravelLimit(root,this.feet[kickSupport==='L'?0:1].plant,yaw,requested):requested;
    }
    if(this.proneAmount<1||!residualMode(mobility)||Math.abs(speed)<.0001)return 0;
    const traction=residualTraction(this.pose(id,root,yaw,t),mobility,this.crawlPhase,ground);
    return speed*dt*(traction?.scale??0);
  }
  private knockdownMotion:KnockdownMotion|null=null;
  private knockdownRising=false;
  private fallBrace:FallBrace|null=null;
  get hasKnockdownMotion():boolean{return this.knockdownMotion!==null;}
  beginKnockdown(root:Vec3,pose:readonly RigPose[],brace:FallBrace|null=null):void{
    if(!this.organic||this.mobility.prone||pose.length!==LAB_SEGMENTS.length)return;
    this.downAnchorWeight=0;this.anchors.reset();
    this.knockdownMotion=new KnockdownMotion(root,pose,this.feet.map(f=>f.plant));this.knockdownRising=false;this.fallBrace=brace;
  }
  private proneAmount=0;private crawlPhase=0;private crawlEffort=0;private crawlDirection=1;
  private mobility:Mobility=mobilityFor(LAB_SEGMENTS.map(s=>s.id));
  private active:readonly string[]=LAB_SEGMENTS.map(s=>s.id);
  private ground:(x:number,z:number)=>number=()=>0;
  get posture(): 'upright'|'falling'|'prone' {return this.proneAmount===0?'upright':this.proneAmount===1?'prone':'falling';}
  private feet:[Foot,Foot];
  constructor(root:Vec3,yaw=0,private readonly groundedStride=false,private readonly authored?:AuthoredMotion,private readonly motionProfile:MotionProfile=BASE_MOTION_PROFILE){
    this.motion=new LocomotionMotion(motionProfile);
    this.carriage=new ArmCarriage(this.motionProfile);
    this.anchors=new CrawlAnchors(this.organic);
    this.expression=new PoseTransition(groundedStride&&authored?.stalk?.size ? .18 : .10);
    this.next=this.organic?motionProfile.firstFoot:0;
    const tempo=this.organic?motionProfile.hopTempo:1;
    this.hop=new HopCycle((groundedStride?.14:0)*tempo,MOVEMENT.hopFlightSeconds*tempo,this.organic?.18*tempo:MOVEMENT.hopPauseSeconds,this.organic);
    this.leap=new HopCycle(.18*tempo,.42*tempo,this.organic?.20*tempo:MOVEMENT.hopPauseSeconds,this.organic,this.organic?1.30:MOVEMENT.hopMaxDistance);
    const foot=(side:number):Foot=>{
      const reference=authored?.stance?.get(side<0?'L.foot':'R.foot')?.a;
      const [x,z]=this.organic?this.restingFoot(side):[reference?side*.10+reference[0]*.4:side*.18,reference?reference[2]*.4:0];
      const p=add(root,[Math.cos(yaw)*x-Math.sin(yaw)*z,FOOT_RADIUS,Math.sin(yaw)*x+Math.cos(yaw)*z]);
      return {plant:p,start:p,target:p,phase:0,moving:false,duration:.32,lift:.085};};
    this.feet=[foot(-1),foot(1)];this.expressive=authored?.stance;
  }
  advance(root:Vec3,yaw:number,speed:number,dt:number,ground:(x:number,z:number)=>number=()=>root[1],mobility:Mobility=mobilityFor(LAB_SEGMENTS.map(s=>s.id)),active:readonly string[]=LAB_SEGMENTS.map(s=>s.id),forcedProne?:number,holdFeet=false,turnRate=0,driveSpeed=speed):void{
    this.mobility=mobility;this.active=active;this.ground=ground;
    this.recoveryCooldown=Math.max(0,this.recoveryCooldown-dt);
    const support=mobility.support;
    if(this.recoveryFoot!==null&&!support[this.recoveryFoot])this.recoveryFoot=null;
    if(forcedProne!==undefined){
      this.recoveryFoot=null;
      this.sprintCycle=false;this.sprintBob=0;this.sprintSlow=0;this.leapQueued=0;
      this.carriage.advanceMotion(dt,0,0,false,false);
      this.motion.clearPreparation();if(this.organic)this.motion.advance(dt,0,0,0);
      const amount=clamp(forcedProne);
      if(this.knockdownMotion&&amount<this.proneAmount)this.knockdownRising=true;
      this.proneAmount=amount;if(this.downAnchorWeight===0)this.anchors.reset();this.hop.reset();this.leap.reset();this.attackLeap.reset();this.pouncing=false;this.hopSample={distance:0,lift:0,phase:'idle',followsRoot:false};
      this.signedSpeed=0;this.moveAmount=0;this.runAmount=0;this.stepWait=0;
      this.supportDrop=0;
      for(let i=0;i<2;i++){
        const side=i===0?-1:1;
        const [wide,stagger]=this.organic&&this.knockdownRising?this.restingFoot(side):[side*.18,0];
        const x=root[0]+Math.cos(yaw)*wide-Math.sin(yaw)*stagger,z=root[2]+Math.sin(yaw)*wide+Math.cos(yaw)*stagger;
        const f=this.feet[i]!,target:Vec3=[x,ground(x,z)+FOOT_RADIUS,z];
        const p=this.knockdownMotion&&!this.knockdownRising?this.knockdownMotion.foot(i,target,amount):target;
        f.plant=p;f.start=p;f.target=p;f.phase=0;f.moving=false;
      }
      if(this.knockdownRising&&amount===0){this.knockdownMotion=null;this.knockdownRising=false;this.fallBrace=null;}
      return;
    }
    this.knockdownMotion=null;this.knockdownRising=false;this.fallBrace=null;
    if(this.downAnchorWeight>0){this.downAnchorWeight=0;this.anchors.reset();}
    this.proneAmount=clamp(this.proneAmount+(mobility.prone?1:-1)*dt/.65);
    if(mobility.prone){
      const desired=mobility.speedScale>0?clamp(Math.abs(speed)/(MOVEMENT.walkSpeed*mobility.speedScale)):0;
      this.crawlEffort+=(desired-this.crawlEffort)*(1-Math.exp(-7*dt));
      if(Math.abs(speed)>.005)this.crawlDirection=Math.sign(speed);
      if(this.proneAmount>=1)this.crawlPhase+=dt*Math.PI*this.crawlEffort/(MOVEMENT.hopFlightSeconds+MOVEMENT.hopPauseSeconds);
    }
    // Keep the planned stride independent of a one-tick stance reach clamp.
    const plannedSpeed=this.organic?driveSpeed:speed;
    // A moving patient enters the separate run cycle only after actual
    // acceleration, and leaves it on braking, sharp turns or lost support.
    const wasRunning=this.sprintCycle;
    // A single reach-limited tick is not braking intent. Sustained lack
    // of progress, e.g. against a wall, still cancels the running cycle.
    this.sprintSlow=wasRunning&&speed<2.1?this.sprintSlow+dt:0;
    this.sprintCycle=this.organic&&mobility.mode==='biped'&&this.proneAmount===0&&!holdFeet&&this.hopSample.phase==='idle'&&plannedSpeed>(wasRunning?3.225:3.825)&&(wasRunning?this.sprintSlow<.20:speed>2.4)&&Math.abs(turnRate)<1.6;
    if(this.sprintCycle&&!wasRunning)this.stepWait=Math.min(this.stepWait,.10);
    if(this.organic)this.carriage.advanceMotion(dt,speed,plannedSpeed,this.sprintCycle,mobility.mode==='biped'&&this.proneAmount===0&&this.hopSample.phase==='idle'&&!holdFeet);
    const plan=this.organic?horrorBipedStep(plannedSpeed,this.motionProfile.strideTempo):bipedStep(speed);
    this.signedSpeed=speed;
    this.runAmount+=(plan.run-this.runAmount)*(1-Math.exp(-5*dt));
    const single=support[0]!==support[1];
    const blend=1-Math.exp(-5*dt);
    this.supportDrop+=((single?.055:(!support[0]&&!support[1]?.28:0))-this.supportDrop)*blend;
    this.moveAmount+=(clamp(Math.abs(speed)/MOVEMENT.walkSpeed)-this.moveAmount)*(1-Math.exp(-4*dt));
    this.stepWait=Math.max(0,this.stepWait-dt);
    if(!single&&this.hopSample.followsRoot){
      this.motion.clearPreparation();if(this.organic)this.motion.advance(dt,0,0,0);
      for(let i=0;i<2;i++){
        const side=i===0?-1:1,x=root[0]+Math.cos(yaw)*side*.18,z=root[2]+Math.sin(yaw)*side*.18;
        const foot=this.feet[i]!;foot.moving=false;foot.plant=[x,ground(x,z)+FOOT_RADIUS,z];
      }
      return;
    }
    if(single&&!this.recoveringSupport){
      this.motion.clearPreparation();if(this.organic)this.motion.advance(dt,0,0,0);
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
      if(!support[i]){f.moving=false;f.running=false;continue;}
      if(!f.moving){f.plant=[f.plant[0],ground(f.plant[0],f.plant[2])+FOOT_RADIUS,f.plant[2]];continue;}
      // Running feet may adjust their airborne landing point on braking
      // or collision; a planted foot is never relocated by this path.
      if(f.running){
        // Current root already includes this tick's travel. Predict only
        // the remaining travel AFTER the upcoming swing phase update.
        const left=Math.max(0,(1-f.phase)*f.duration-dt);
        const predicted=this.sprintCycle&&this.sprintSlow<.10?plannedSpeed:speed;
        const pace=Math.max(0,Math.min(predicted,plannedSpeed,HORROR_MOVEMENT.maxRunSpeed));
        const lead=pace*left+HORROR_MOVEMENT.runLandingLead*Math.min(1,pace/3.8),side=i===0?-1:1;
        const x=root[0]+Math.cos(yaw)*side*.18+Math.sin(yaw)*lead,z=root[2]+Math.sin(yaw)*side*.18-Math.cos(yaw)*lead;
        const goal:Vec3=[x,ground(x,z)+FOOT_RADIUS,z],error=dist(f.target,goal);
        // Retarget gradually, especially when a sprint meets a wall.
        f.target=mix(f.target,goal,Math.min(1,.24/Math.max(1e-8,error)));
      }
      f.phase=Math.min(1,f.phase+dt/f.duration);
      if(f.running&&f.phase>1-1e-9)f.phase=1;
      const progress=this.organic?patientSwingProgress(f.phase):{travel:f.phase*f.phase*(3-2*f.phase),lift:Math.sin(Math.PI*f.phase)};
      const p=mix(f.start,f.target,progress.travel);
      f.plant=[p[0],Math.max(ground(p[0],p[2])+FOOT_RADIUS,p[1]+progress.lift*f.lift),p[2]];
      if(f.phase===1){if(this.recoveryFoot===i){this.recoveryFoot=null;this.recoveryCooldown=.12;this.stepWait=Math.max(this.stepWait,.14);}f.moving=false;f.running=false;f.plant=[f.target[0],ground(f.target[0],f.target[2])+FOOT_RADIUS,f.target[2]];}
    }
    const pivot=pivotPlan(this.organic&&this.proneAmount===0?turnRate:0,plannedSpeed);
    if(pivot.strength>0)this.stepWait=Math.min(this.stepWait,.12+.18*(1-pivot.strength));
    const resting=this.organic&&Math.abs(plannedSpeed)<=.055;
    const ideal=(side:number,lead:number,angle=yaw):Vec3=>{
      const [wide,stagger]=resting?this.restingFoot(side):[side*.18,0];
      const x=root[0]+Math.cos(angle)*wide+Math.sin(angle)*(lead-stagger),z=root[2]+Math.sin(angle)*wide-Math.cos(angle)*(lead-stagger);
      return [x,ground(x,z)+FOOT_RADIUS,z];
    };
    let weightSide:-1|0|1=0,preparing=false;
    if(this.sprintCycle){
      const run=horrorRunStep(Math.min(HORROR_MOVEMENT.maxRunSpeed,plannedSpeed),this.motionProfile.strideTempo);
      const index=this.next,f=this.feet[index]!;
      if(!f.moving&&this.stepWait<=1e-8){
        const target=ideal(index===0?-1:1,run.lead);
        f.start=f.plant;f.target=target;f.phase=0;f.moving=true;f.running=true;
        f.duration=run.swing;f.lift=run.lift;
        this.next=1-index;this.stepWait=run.interval;this.steps++;
      }
      this.motion.clearPreparation();
    }else if(!holdFeet&&support[0]&&support[1]&&!this.feet.some(f=>f.moving)&&(this.stepWait<=1e-8||this.organic&&this.stepWait<=.10)){
      const moving=Math.abs(plannedSpeed)>.055,lead=moving?plan.lead:0;
      const error=(i:number)=>{const f=this.feet[i]!,p=ideal(i===0?-1:1,0);return Math.hypot(f.plant[0]-p[0],f.plant[2]-p[2]);};
      let index=this.next;
      if((!moving||pivot.strength>.5)&&error(1-index)>error(index))index=1-index;
      const f=this.feet[index]!,target=ideal(index===0?-1:1,lead,yaw+pivot.lead);
      // At low speeds wait until there is a meaningful displacement; at
      // normal speed the alternating cadence gives a full stance interval.
      const separation=Math.hypot(f.plant[0]-target[0],f.plant[2]-target[2]);
      const threshold=this.organic?(resting&&pivot.strength===0?.045:pivot.threshold):(moving?.16:.13);
      let loaded=true;
      if(this.organic&&this.proneAmount===0&&separation>threshold*.70){
        preparing=true;weightSide=index===0?1:-1;
        loaded=this.motion.prepare(index===0?0:1,dt);
      }
      if(separation>threshold&&loaded&&this.stepWait<=1e-8){
        f.start=f.plant;f.target=target;f.phase=0;f.moving=true;f.running=false;
        const swing=pivot.strength>0?Math.min(moving?plan.swing:.32,pivot.swing):moving?plan.swing:.32,lift=moving?plan.lift:.07;
        const timing=this.organic?organicSwing(index===0?0:1,swing,lift,this.motionProfile.asymmetry*.5):{duration:swing,lift};
        f.duration=timing.duration;f.lift=timing.lift;
        this.next=1-index;this.stepWait=pivot.strength>0?Math.min(moving?plan.interval:.50,pivot.interval):moving?plan.interval:.50;this.steps++;
        preparing=false;
      }
    }
    // At a fast cadence the next support transfer starts late in the
    // preceding swing. Do not wait through a second full preparation
    // after touchdown, which would repeatedly stall the root.
    if(!preparing&&!this.sprintCycle&&this.organic&&Math.abs(plannedSpeed)>2.875&&!holdFeet&&support[0]&&support[1]&&this.feet.some(f=>f.moving&&f.phase>=.55)){
      this.motion.prepare(this.next===0?0:1,dt);preparing=true;
    }
    if(!preparing)this.motion.clearPreparation();
    const air=this.sprintCycle&&this.feet.every(f=>f.moving)?Math.min(...this.feet.map(f=>Math.sin(Math.PI*f.phase)**2)):0;
    this.sprintBob+=(.065*air-this.sprintBob)*(1-Math.exp(-18*dt));
    if(this.organic){
      const swing=this.feet.findIndex(f=>f.moving);
      if(swing!==-1)weightSide=swing===0?1:-1;
      const forwardZ=(p:Vec3)=>-Math.sin(yaw)*(p[0]-root[0])+Math.cos(yaw)*(p[2]-root[2]);
      const phase=Math.max(-1,Math.min(1,(forwardZ(this.feet[0].plant)-forwardZ(this.feet[1].plant))/.55));
      this.motion.advance(dt,this.proneAmount===0?speed:0,phase,this.proneAmount===0?weightSide:0);
    }
  }
  get bracingSide(): 'L'|'R'|null{return this.fallBrace?.side??null;}
  crawlWhileDown(dt:number,speed:number,heading:number,yaw:number,mobility:Mobility,sample:()=>readonly RigPose[]):boolean{
    const pulling=speed>0&&this.proneAmount===1;
    const before=pulling?sample():null;
    this.downAnchorWeight=clamp(this.downAnchorWeight+(pulling?dt/.08:-dt/.13));
    if(before){
      this.anchors.advance(dt,speed,heading,before,mobility,this.ground,this.fallBrace?.side??null);
      this.crawlDirection=Math.cos(heading-yaw)<0?-1:1;
    }
    const planted=!!before&&this.downAnchorWeight===1&&
      this.anchors.snapshot(this.anchors.apply(before,mobility,this.ground,1),mobility,this.ground).some(a=>a.valid);
    this.crawlEffort+=((planted?1:0)-this.crawlEffort)*(1-Math.exp(-16*dt));
    this.crawlPhase+=dt*this.crawlEffort*8;
    return planted;
  }
  plantedBrace(pose:readonly RigPose[]):boolean{
    if(!this.fallBrace||this.proneAmount<.25||this.proneAmount>.85)return false;
    const hand=pose.find(p=>p.id===this.fallBrace!.side+'.hand');
    return !!hand&&Math.abs(hand.a[1]-hand.radius-this.ground(hand.a[0],hand.a[2]))<.018;
  }
  private bracedFall(pose:readonly RigPose[],grounded:readonly RigPose[]):readonly RigPose[]{
    const brace=this.fallBrace;
    if(!brace||!['upperArm','lowerArm','hand'].every(segment=>this.active.includes(brace.side+'.'+segment)))return pose;
    return braceFall(pose,grounded,brace,this.proneAmount,this.ground);
  }
  pose(id:number,root:Vec3,yaw:number,t:number,_hurt=false,look=0,reaction?:ImpactMotionSample,gazePitch=-.14):readonly RigPose[]{
    if(this.knockdownMotion&&!this.knockdownRising&&this.proneAmount===0)return this.knockdownMotion.source(root);
    const secondary=this.organic?this.motion.sample:null;
    const reactive=this.organic&&reaction&&reaction.compression>0&&this.proneAmount===0&&this.hopSample.phase!=='flight'?reaction:null;
    const torsoHit:Vec3=reactive?localImpact(reactive.torso,yaw):[0,0,0];
    const headHit:Vec3=reactive?localImpact(reactive.head,yaw):[0,0,0];
    const moving=this.moveAmount,sway=Math.sin(t*.88+id*1.4),sway2=Math.sin(t*1.37+id*.9),breathing=Math.sin(t*1.95+id*.6);
    const style=this.organic?this.motionProfile:BASE_MOTION_PROFILE;
    const rising=this.knockdownRising&&this.knockdownMotion!==null;
    // Evaluate the same destination pose throughout recovery, including its
    // new idle/guard geometry. The fall blend, not a one-tick switch, owns the transition.
    const resting=this.organic&&this.mobility.mode==='biped'&&(this.proneAmount===0||rising)&&this.hopSample.phase==='idle'?(1-moving)*(1-clamp((reactive?.compression??0)/.02)):0;
    const guard=this.carriage.guardAmount*resting;
    const weights=this.expression.weights;
    const idle=resting*weights[0]!*(1-this.carriage.guardAmount);
    // A stationary search also uses the calibrated torso. Freeze still
    // contributes its own limb pose and leaves target scanning active.
    const freeze=resting*weights[FREEZE_INDEX]!*(1-this.carriage.guardAmount);
    const postureWeight=clamp(idle+freeze+guard),upperSway=1+idle;
    const ready=this.carriage.guardAmount,edits=this.authored?.standing;
    const spineEdit=(edits?.stance?.spine??0)*(1-ready)+(edits?.aggressive?.spine??0)*ready;
    const neckEdit=(edits?.stance?.neck??0)*(1-ready)+(edits?.aggressive?.neck??0)*ready;
    const spinePitch=(10+5*ready)*Math.PI/180+spineEdit;
    const thoraxPitch=Math.PI/18+spineEdit;
    const lateral=(.018*sway+.009*sway2)*(1-moving*.42)*style.sway,roll=(.045*Math.sin(t*.88+id*.9)+.019*sway2)*(1-moving*.35)*style.sway;
    const forwardZ=(p:Vec3)=>-Math.sin(yaw)*(p[0]-root[0])+Math.cos(yaw)*(p[2]-root[2]);
    const gaitPhase=Math.max(-1,Math.min(1,(forwardZ(this.feet[0].plant)-forwardZ(this.feet[1].plant))/.55));
    const lean=(secondary?secondary.drive*(.045+this.runAmount*.055)+secondary.inertia*.025:Math.sign(this.signedSpeed)*moving*(.045+this.runAmount*.055))+Math.sin(t*.72+id)*.012,bob=moving*.012*(1-Math.abs(gaitPhase))+breathing*.006+this.sprintBob;
    const preload=this.hopSample.crouch??0;
    const suspended=this.organic?clamp(this.hopSample.lift/.24):0;
    const launchSwing=this.organic?suspended-preload*5:0;
    const recoilHip:Vec3=[torsoHit[0]*.32,0,torsoHit[2]*.30];
    const stanceDrop=preload+(reactive?.compression??0)+(this.groundedStride?moving*(.012+.018*this.runAmount+(this.organic?.008:0)):this.mobility.mode==='biped'?moving*(.065+.035*this.runAmount):0);
    const base=this.authored?.stance;
    const expressive=this.expressive??base;
    const center=(part:RigPose):Vec3=>mix(part.a,part.b,.5);
    const baseHip=base?.get('pelvis'),baseChest=expressive?.get('chest'),poseHip=expressive?.get('pelvis');
    const spineX=baseChest&&poseHip?Math.max(-.12,Math.min(.12,center(baseChest)[0]-center(poseHip)[0]))*.55:0;
    const spineZ=baseChest&&poseHip?Math.max(-.24,Math.min(.24,center(baseChest)[2]-center(poseHip)[2]))*.55:0;
    const weightShift=secondary?secondary.weight*.048:0;
    // Less permanent crouch in intact authored bipeds. Keep the original
    // stance scale and leave support reach/landing compression to IK.
    const rise=this.organic&&this.mobility.mode==='biped'?.03:0;
    const runLean=this.organic?this.carriage.runLean:0;
    const hip:Vec3=[lateral+weightShift+recoilHip[0]+(baseHip?center(baseHip)[0]*.3:0),1.02+rise+bob-this.supportDrop-stanceDrop,recoilHip[2]],chest:Vec3=[-lateral*.35+weightShift*.4,1.51+rise+bob-this.supportDrop-stanceDrop,-.035-lean*.5-runLean-.058*suspended];
    const head:Vec3=[-lateral*.65+.012*Math.sin(t*.62+id)+(secondary?.arms??0)*.018,1.89+rise+bob-this.supportDrop-stanceDrop,-.045-lean*.24-runLean*.72-.023*suspended];
    const spineSway=secondary?secondary.chest:this.groundedStride?moving*gaitPhase:0;
    const naturalChest=add(add(chest,torsoHit),[-roll*.12*upperSway-spineSway*.075+spineX,spineSway*.036,lean*.18-.068*spineSway+spineZ-preload*.8]);
    const chestPose=mix(naturalChest,[naturalChest[0]-lateral*.35*idle,naturalChest[1],hip[2]-Math.tan(spinePitch)*(naturalChest[1]-hip[1]+.105)],postureWeight);
    const tilt=(part:RigPose|undefined)=>part?Math.atan2(part.b[2]-part.a[2],part.b[0]-part.a[0]):0;
    const hipTwist=(this.groundedStride?.24:.11)*(secondary?secondary.pelvis:moving*gaitPhase)*style.twist+.6*tilt(baseHip);
    const chestTwist=-(this.groundedStride?.37:.16)*(secondary?secondary.chest:moving*gaitPhase)*style.twist+.65*tilt(baseChest);
    const authoredRoll=(p:RigPose|undefined)=>p?Math.atan2(p.b[1]-p.a[1],Math.hypot(p.b[0]-p.a[0],p.b[2]-p.a[2])):0;
    const hipRoll=.025*sway+.035*moving*gaitPhase+.45*authoredRoll(poseHip),chestRoll=-roll*upperSway+.65*authoredRoll(baseChest)*(1-(this.organic?.65*moving:0))-(secondary?.pelvis??0)*.035*moving;
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
    put('chest',shoulderAt(-1),shoulderAt(1));const referenceHead=expressive?.get('head'),referenceChest=baseChest?center(baseChest):undefined;
    const headBias:Vec3=referenceHead&&referenceChest?[Math.max(-.085,Math.min(.085,(referenceHead.a[0]-referenceChest[0])*.55)),0,Math.max(-.10,Math.min(.10,(referenceHead.a[2]-referenceChest[2])*.55))]:[0,0,0];
    const naturalLook=add(add(add(head,headBias),torsoHit),add(headHit,[Math.sin(look)*.09,this.organic?-.025*Math.max(0,-gazePitch):0,-Math.abs(look)*.04+(this.organic?.065*Math.min(0,gazePitch):0)]));
    const looking=mix(naturalLook,[shoulderCenter[0]+Math.sin(look)*.05-lateral*.20*idle,naturalLook[1],shoulderCenter[2]-Math.tan(neckEdit)*(naturalLook[1]-shoulderCenter[1])],postureWeight);
    put('neck',chestPose,add(looking,[0,-.14,0]));put('head',looking);
    for(let i=0;i<2;i++){
      const side=i===0?-1:1,key=i===0?'L.':'R.',hipRoot=hipAt(side),shoulder=shoulderAt(side);
      const foot=local(this.feet[i]!.plant);
      const ankle=add(foot,[0,.04,.055]),ik=solveTwoBone(hipRoot,ankle,.49,.50,[0,.02,-1]);
      put(key+'upperLeg',hipRoot,ik.joint);put(key+'lowerLeg',ik.joint,ik.end);put(key+'foot',add(ik.end,[0,-.04,-.055]));
      const swing=secondary?side*secondary.arms*.85*style.armSwing:moving*Math.max(-1,Math.min(1,-foot[2]/.36));
      const arm=expressive?.get(key+'upperArm'),forearm=expressive?.get(key+'lowerArm');
      const armBias=arm?[arm.b[0]-arm.a[0],arm.b[1]-arm.a[1],arm.b[2]-arm.a[2]] as Vec3:null;
      const handBias=arm&&forearm?[forearm.b[0]-arm.a[0],forearm.b[1]-arm.a[1],forearm.b[2]-arm.a[2]] as Vec3:null;
      const armHit:Vec3=reactive?localImpact(i===0?reactive.leftArm:reactive.rightArm,yaw):[0,0,0];
      const idleElbow=add(armBias??[side*.055,-.31,.035],[0,preload*.5+suspended*.055,swing*.17-launchSwing*.09]);
      const idleHand=add(handBias??[side*.06,-.59,.015],[0,preload+suspended*.16,swing*(.28+.07*this.runAmount)-launchSwing*.23]);
      const carried=this.organic&&this.mobility.mode==='biped'?this.carriage.offsets(side,idleElbow,idleHand,swing,.8*idle):{elbow:idleElbow,hand:idleHand};
      const elbow=add(shoulder,add(carried.elbow,[armHit[0]*.45,0,armHit[2]*.45]));
      const hand=add(shoulder,add(carried.hand,[armHit[0],0,armHit[2]]));
      put(key+'upperArm',shoulder,elbow);put(key+'lowerArm',elbow,hand);put(key+'hand',hand);
    }
    const standing=LAB_SEGMENTS.map(def=>{const [a,b]=points.get(def.id)!;return {id:def.id,a,b,radius:def.radius};});
    if(this.proneAmount===0||rising){
      const neckFollow=this.organic?clamp(moving/.35):0;
      const thoraxTarget=postureWeight>0?{direction:[s*Math.sin(thoraxPitch),Math.cos(thoraxPitch),-c*Math.sin(thoraxPitch)] as Vec3,weight:postureWeight}:undefined;
      let fixed=constrainRig(standing,undefined,1,this.organic,neckFollow,thoraxTarget);const lift=this.hopSample.lift;
      // Anticipatory reference relative to the locomoting root. Retain
      // deliberate lean/look and impacts; compensate the alternating sway.
      const steadyHead=world([looking[0]+lateral*.65,looking[1]-bob*.75,looking[2]]);
      const steady=(pose:readonly RigPose[],height=0)=>this.organic?compensateHead(pose,add(steadyHead,[0,height,0]),(1-neckFollow)*(1-postureWeight)*this.motionProfile.compensation*(reactive?.55:1)):pose;
      const single=this.mobility.mode==='single-support';
      if(single){const i=this.mobility.support[0]?0:1;fixed=balanceSingleSupport(fixed,this.active,i===0?'L':'R',this.feet[i]!.plant,this.ground);}
      if(lift>0&&this.authored?.jump&&this.hopSample.phase==='flight'){
       const reference=this.authored.jump;
       const flying=standing.map(part=>{
        const target=reference.get(part.id);
        if(!target||!/Leg$|foot$/.test(part.id)||single&&part.id.startsWith(this.mobility.support[0]?'L.':'R.'))return part;
        const targetHip=reference.get('pelvis');if(!targetHip)return part;
        const origin=center(targetHip);
        const position=(v:Vec3):Vec3=>world(add(pelvisCenter,[v[0]-origin[0],v[1]-origin[1],v[2]-origin[2]]));
        const weight=Math.min(.8,lift*12);
        return {...part,a:mix(part.a,position(target.a),weight),b:mix(part.b,position(target.b),weight)};
       });
       fixed=constrainRig(flying,undefined,1,this.organic,neckFollow);
      }
      if(lift>0)return steady(fixed.map(p=>({...p,a:add(p.a,[0,lift,0]),b:add(p.b,[0,lift,0])})),lift);
      const stance=['L.foot','R.foot'].filter((id,i)=>this.active.includes(id)&&!this.feet[i]!.moving);
      const upright=single?steady(fixed):steady(balanceStandingPose(fixed,this.active,stance,this.ground,this.organic?{points:[this.feet[0].plant,this.feet[1].plant],weight:secondary?.weight??0,yaw}:undefined));
      if(rising&&this.proneAmount>0){
        const grounded=pronePose(root,yaw,this.crawlPhase,this.crawlEffort,this.crawlDirection,this.mobility,this.ground,this.organic);
        const floorPose=this.bracedFall(blendGroundPose(upright,grounded,this.proneAmount,this.active,this.ground,true,true,'rise'),grounded);
        return this.anchors.apply(floorPose,this.mobility,this.ground,this.downAnchorWeight);
      }
      return upright;
    }
    const grounded=pronePose(root,yaw,this.crawlPhase,this.crawlEffort,this.crawlDirection,this.mobility,this.ground,this.organic);
    if(this.knockdownMotion){
      const source=this.knockdownMotion.source(root);
      const floorPose=this.bracedFall(blendGroundPose(source,grounded,this.proneAmount,this.active,this.ground,true,false,'fall'),grounded);
      return this.anchors.apply(floorPose,this.mobility,this.ground,this.downAnchorWeight);
    }
    const prone=blendGroundPose(standing,grounded,this.proneAmount,this.active,this.ground);
    const weight=this.proneAmount===1&&this.anchored(this.mobility)?undefined:this.downAnchorWeight;
    return this.anchors.apply(prone,this.mobility,this.ground,weight);
  }
}
