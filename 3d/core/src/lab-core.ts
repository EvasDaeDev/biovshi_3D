import {compileAuthoredMotion,type AuthoredMotion} from './rig/authored-motion.js';
import type {Vec3} from './types.js';
import { ArenaNavigation,RouteState } from './arena/navigation.js';
import { PolygonNavigation } from './arena/polygon-navigation.js';
import type { PointXZ } from './combat/escape.js';
import {GazePitch} from './animation/gaze-pitch.js';
import {FightVariety} from './combat/fight-variety.js';
import {strikeLocomotion} from './combat/strike-locomotion.js';
import {attackScore,targetPriority,shouldBackstep,type FightOpportunity} from './combat/opportunity.js';
import type {PunchChoice} from './combat/punch-choice.js';
import {horrorTurnRate} from './animation/turn-motion.js';
import {victoryPose,VICTORY_TICKS} from './animation/victory.js';
import {headFrame,withCameraMount} from './rig/head-frame.js';
import { PatientPerception,notices,gazeAwareRoute,type VisionBody } from './combat/perception.js';
import { EscapeState,ESCAPE,type EscapeOpponent } from './combat/escape.js';
import { usableStrike } from './combat/strike.js';
import { CombatTactics } from './combat/tactics.js';
import { DISARMED,hasAttackSource,fleeAllAttackers } from './combat/disarmed.js';
import { pursuitForward,CLOSE_STANDOFF } from './combat/engagement.js';
import { PatientBehavior } from './combat/patient-profile.js';
import { chooseProneStrike } from './combat/prone-choice.js';
import { chooseExtra } from './combat/extra-choice.js';
import { choosePunch,closestAim } from './combat/punch-choice.js';
import { StrikeState,punchPose,strikeSource,strikeOrigin,strikeChannels,type StrikeKind,type StrikeChannel,type Punch,type StrikeVisual } from './combat/strike.js';
import { firstStrikeContactDetail } from './combat/swept-contact.js';
import {SIDE_STRIKE_LIMIT} from './combat/strike-sector.js';
import {chooseSecondChannel} from './combat/dual-choice.js';
import {crouchPunchBase} from './combat/crouch-punch.js';
import {POUNCE,choosePounce} from './combat/pounce.js';
import {groundedContactPoint} from './combat/grounded-pursuit.js';
import {DISTRESS,DistressState,vulnerable} from './combat/distress.js';
import {LIMB_THROW,ThrowDecision,LimbFlight,sacrificeArm,throwVelocity,midpoint} from './combat/limb-throw.js';
import { ImpactState } from './combat/impact.js';
import { OilState,OIL,type OilMark } from './combat/oil.js';
import { DamageState,type IncapacitationCause } from './combat/damage.js';
import { Knockdown,KNOCKDOWN } from './rig/knockdown.js';
import { analyzeSupport } from './rig/support.js';
import { MOVEMENT,HORROR_MOVEMENT,patientDriveSpeed } from './rig/movement-timing.js';
import { mobilityFor } from './rig/mobility.js';
import { expandLegacyTorso,severingChain } from './rig/anatomy.js';
import { terrainHeight, type Mound } from './collision/terrain.js';
import { createGradeContact } from './collision/grade-contact.js';
import { gradeHeight,validateGradeSurface,type GradeSurface } from './arena/graded-surface.js';
import { ContactEpisodes, type SegmentContact } from './collision/contact-episodes.js';
import { resolveCollisions, type CollisionStats } from './collision/resolve.js';
import { PatientGait,type RigPose } from './rig/gait.js';
import { FIXED_DT } from './fixed-clock.js';
import {patientMotionProfile} from './animation/motion-profile.js';
import {HuntState} from './combat/hunt-state.js';
import {RaidState,type RaidOpponent} from './combat/raid-state.js';
import {captureSegmentMotion} from './animation/handoff-motion.js';
import type { FighterCommand, InputFrame, SimulationCore, SimulationEvent, WorldConfig, WorldSnapshot, PhysicsSegmentPose, DamageRequest } from './types.js';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
const damp = (a: number, b: number, k: number) => a + (b - a) * (1 - Math.exp(-k * FIXED_DT));

interface Actor {
  id: number; x: number; y: number; z: number; yaw: number; baseY:number;
  speed: number; velocity:Vec3; distress:DistressState; throwing:ThrowDecision; crouchAmount:number;crouchUntil:number; wanderTimer: number; wanderAngle: number; wanderSpeed: number;
  raid:RaidState;variety:FightVariety;gazePitch:GazePitch;gazeFocus:Vec3|null;lookTarget:PointXZ|null;lastKind?:StrikeKind;lastContact?:string; pivotTarget:number|null;
  segments: string[]; gait: PatientGait; knockdown:Knockdown; fixed:boolean; health:DamageState; impact:ImpactState; oil:OilState; strike:StrikeState; behavior:PatientBehavior; tactics:CombatTactics; hunt:HuntState; escape:EscapeState; perception:PatientPerception; route:RouteState; disarmedGoal:PointXZ|null; disarmedUntil:number; disarmedThreatIds:string; lastHitTick:number; terrainOnly:boolean; physicsPose:readonly RigPose[];
}

/** Root locomotion and procedural rig. Includes kinematic collision correction; optional lab-only contact fracture; no debris yet.
 * Public yaw is positive right (towards +X from -Z).
 * Lab Three.js heading is the negative of this yaw.
 */
export class LabSimulationCore implements SimulationCore {
  private actors: Actor[] = [];
  private tick = 0;
  private handoffPrevious:Map<number,readonly RigPose[]>|null=null;
  private handoffTick=-1;
  private rng = 0;
  private oilRng=0;private oilMarks:OilMark[]=[];private nextMark=0;
  private ready = false;
  private mounds:readonly Mound[]=[];
  private grade:GradeSurface=[];
  private gradeContact:ReturnType<typeof createGradeContact>|null=null;
  private patientScale=1;
  private authored:AuthoredMotion|undefined;
  private ringCombat=false;
  private gaitPoint(point:Vec3):Vec3{
    return this.patientScale===1?point:this.scalePoint(point,1/this.patientScale);
  }
  private scalePoint([x,y,z]:Vec3,scale:number):Vec3{return [x*scale,y*scale,z*scale];}
  private gaitGround(a:Actor){return (x:number,z:number)=>this.ground(a,x*this.patientScale,z*this.patientScale)/this.patientScale;}
  private worldPose(parts:readonly RigPose[],scale=this.patientScale):readonly RigPose[]{
    return scale===1?parts:parts.map(p=>({...p,a:this.scalePoint(p.a,scale),b:this.scalePoint(p.b,scale),radius:p.radius*scale}));
  }
  private ground(a:Actor,x:number,z:number):number{return a.baseY+gradeHeight(x,z,this.grade)+terrainHeight(x,z,this.mounds);}
  private navigation=new ArenaNavigation();
  /** Copy plain terrain data from the external physics adapter. */
  setTerrainMounds(mounds:readonly Mound[]):void{
    this.requireReady();
    if(mounds.some(m=>![m.x,m.z,m.radius,m.height].every(Number.isFinite)||m.radius<=0||m.height<0||m.height>.30))throw new RangeError('Invalid mound');
    this.mounds=mounds.map(m=>({...m}));
  }
  private episodes = new ContactEpisodes();
  private events: SimulationEvent[] = [];
  private fracture = false;
  private dynamicBalance=false;
  private combat=false;private expandedStrikes=false;private tacticalCombat=false;private escapeCombat=false;private perceptionCombat=false;private fightEnded=false;private winnerId:number|null=null;
  private victoryStart:number|null=null;
  private flights:LimbFlight[]=[];private nextFlight=0;
  private hitCount = 0;
  private detachedCount = 0;
  private collisionStats: CollisionStats = {tests:0,contacts:0,wallContacts:0};

  initialize(config: WorldConfig): void {
    if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff)
      throw new RangeError('seed must be uint32');
    const scale=config.patientScale??1;
    if(!Number.isFinite(scale)||scale<=0)throw new RangeError('Invalid patient scale');
    const source=config.patientPoses??config.location?.patientPoses;
    const authored=source?compileAuthoredMotion(source):undefined;
    const graded=validateGradeSurface(config.gradedSurface??[]);
    const ids = new Set<number>();
    const actors = config.fighters.map(f => {
      if (!Number.isInteger(f.id) || f.id < 0 || f.id > 0xffffffff || ids.has(f.id))
        throw new RangeError('Invalid or duplicate fighter ID');
      ids.add(f.id);
      const [x,y,z] = f.origin;
      if (f.origin.length !== 3 || ![x,y,z,f.yawRad].every(Number.isFinite))
        throw new RangeError('Invalid transform');
      if (new Set(f.segmentIds).size !== f.segmentIds.length || f.segmentIds.some(s => !s))
        throw new RangeError('Invalid segment IDs');
      const motionProfile=patientMotionProfile(config.seed,f.id,authored?.stalk&&f.profile?(f.profile.temperament??'balanced'):undefined);
      return {id:f.id,x,y:y+gradeHeight(x,z,graded),z,yaw:f.yawRad,baseY:y,speed:0,velocity:[0,0,0] as Vec3,distress:new DistressState(config.seed,f.id),throwing:new ThrowDecision(config.seed,f.id),crouchAmount:0,crouchUntil:0,wanderTimer:1+f.id*.3,
        wanderAngle:f.yawRad,wanderSpeed:.35,raid:new RaidState(config.seed,f.id,f.profile?.temperament??(f.profile?'balanced':'baseline')),variety:new FightVariety(config.seed,f.id),gazePitch:new GazePitch(),gazeFocus:null,lookTarget:null,pivotTarget:null,segments:expandLegacyTorso(f.segmentIds),gait:new PatientGait(this.scalePoint(f.origin,1/scale),f.yawRad,scale!==1,authored,motionProfile),knockdown:new Knockdown(),fixed:false,health:new DamageState(expandLegacyTorso(f.segmentIds)),impact:new ImpactState(),oil:new OilState(),strike:new StrikeState(authored?.stalk&&f.profile?motionProfile.strikeTempo:1,!!authored?.stalk&&scale!==1),behavior:new PatientBehavior(config.seed,f.id,f.profile),tactics:new CombatTactics(config.seed,f.id),hunt:new HuntState(config.seed,f.id,motionProfile),escape:new EscapeState(config.seed,f.id),perception:new PatientPerception(config.seed,f.id,!!authored?.stalk),route:new RouteState(),disarmedGoal:null,disarmedUntil:0,disarmedThreatIds:'',lastHitTick:0,terrainOnly:false,physicsPose:[]};
    }).sort((a,b)=>a.id-b.id);
    const navigation=config.location?new PolygonNavigation(config.location):new ArenaNavigation(config.walls);
    if(actors.some(a=>!navigation.clear(a,a,.50)))throw new RangeError('Fighter starts inside arena wall clearance');
    this.patientScale=scale;
    this.authored=authored;
    this.ringCombat=config.location?.shape==='circle'&&config.tacticalCombat===true;
    this.navigation=navigation;
    this.grade=graded;
    this.gradeContact=graded.length?createGradeContact(graded):null;
    this.actors = actors;
    this.mounds=[];
    this.tick = 0;this.handoffPrevious=null;this.handoffTick=-1;
    this.rng = config.seed;
    this.oilRng=(config.seed^0x9e3779b9)>>>0;this.oilMarks=[];this.nextMark=0;
    this.combat=config.combatEnabled===true;this.expandedStrikes=this.combat&&config.expandedStrikes===true;this.tacticalCombat=this.combat&&config.tacticalCombat===true;this.escapeCombat=this.tacticalCombat&&config.escapeCombat===true;this.perceptionCombat=this.tacticalCombat&&config.perceptionCombat===true;this.fightEnded=false;this.winnerId=null;this.victoryStart=null;
    this.fracture = !this.combat&&config.labContactFracture === true;
    this.dynamicBalance=config.labDynamicBalance===true;
    this.episodes.reset();this.events=[];this.flights=[];this.nextFlight=0;this.hitCount=0;this.detachedCount=0;
    this.collisionStats = {tests:0,contacts:0,wallContacts:0};
    this.ready = true;
    for(const a of this.actors)a.gait.advance(this.gaitPoint([a.x,a.y,a.z]),a.yaw,0,0,this.gaitGround(a),mobilityFor(a.segments),a.segments);
  }

  private actorPose(a:Actor,nominal=false,withoutStrike=false,withoutCrouch=false):readonly RigPose[]{
    if(a.fixed)return a.physicsPose;
    const standing=a.gait.pose(a.id,this.gaitPoint([a.x,a.y,a.z]),a.yaw,this.tick*FIXED_DT,a.impact.active,a.perception.gaze(a.yaw)-a.yaw,this.authored?.stalk?a.impact.reaction:undefined,a.gazePitch.pitch).filter(p=>a.segments.includes(p.id));
    const amount=a.crouchAmount*a.crouchAmount*(3-2*a.crouchAmount);
    const pose=!withoutCrouch&&amount>0&&a.gait.posture==='upright'&&!a.knockdown.blocked?crouchPunchBase(standing,a.yaw,amount,this.gaitGround(a)):standing;
    const plan=a.throwing.plan;
    const throwPose:StrikeVisual|null=plan&&!withoutStrike?{punch:{side:plan.root.startsWith('L.')?'L' as const:'R' as const,kind:'arm' as const,targetId:plan.targetId,aim:plan.aim,yaw:a.yaw,start:plan.start,fastThrust:true},tick:this.tick,weight:1}:null;
    const visual=withoutStrike?null:a.strike.visual(this.tick)??throwPose,strike=visual?.punch;
    // A residual pose is compatible only with the same upright support
    // configuration. Missing source, flight and ground transitions win.
    const compatible=visual?.weight===1||a.gait.posture==='upright'&&a.gait.hopPhase!=='flight'&&a.gait.hopPhase!=='prepare';
    const mobile=!!this.authored?.stalk&&this.patientScale!==1&&a.gait.posture==='upright'&&!strike?.prone;
    const support=mobile&&strike?.kind==='leg'&&!strike.pounce?a.gait.footStates[strike.side==='L'?1:0]?.point:undefined;
    const posed=strike&&visual&&compatible&&!a.knockdown.blocked&&(!this.authored?.stalk||usableStrike(a.segments,strike.kind??'arm',strike.side))?punchPose(pose,{...strike,yaw:mobile&&strike.kind!=='leg'?a.yaw:strike.yaw,aim:this.gaitPoint(strike.aim),...(strike.secondary?{secondary:{...strike.secondary,aim:this.gaitPoint(strike.secondary.aim)}}:{})},visual.tick,this.gaitGround(a),this.authored,visual.weight,support,false,true):pose;
    if(nominal)return posed;
    const world=this.worldPose(posed);
    return this.gradeContact?.(world,a.baseY)??world;
  }
  private copyPose(parts:readonly PhysicsSegmentPose[]):readonly RigPose[]{
    return parts.map(p=>({id:p.id,a:[...p.a],b:[...p.b],radius:p.radius}));
  }
  /** Terminal handoff, used by lab and future damage resolver. An intact
   * anatomy stays intact; incapacitation is not a detachment event. */
  incapacitate(fighterId:number,cause:IncapacitationCause='manual',attackerId?:number):boolean{
    this.requireReady();const a=this.actors.find(a=>a.id===fighterId);
    if(!a)throw new RangeError('Unknown fighter');
    if(a.fixed||this.fightEnded)return false;
    const pose=this.copyPose(this.actorPose(a));
    const prior=this.handoffTick===this.tick-1?this.handoffPrevious?.get(a.id):undefined;
    const motion=prior?captureSegmentMotion(prior,pose,FIXED_DT):undefined;
    a.fixed=true;a.speed=0;a.throwing.plan=null;a.physicsPose=pose;a.health.finish(cause);a.tactics.setMode('inactive');a.hunt.reset(this.tick);a.escape.clear();a.perception.clear();a.route.clear();a.disarmedGoal=null;a.impact.clear();a.oil.clear();a.strike.advance(this.tick,false,a.segments);
    const source=this.actors.find(b=>b.id===attackerId&&b.id!==a.id);
    let dx=source?a.x-source.x:-Math.sin(a.yaw),dz=source?a.z-source.z:Math.cos(a.yaw);
    if(Math.hypot(dx,dz)<1e-6){dx=-Math.sin(a.yaw);dz=Math.cos(a.yaw);}
    const n=Math.hypot(dx,dz)||1;
    this.events.push({tick:this.tick,type:'fighter-incapacitated',fighterId,cause,fallDirection:[dx/n,0,dz/n],bodyPose:this.copyPose(pose),...(motion?.length?{bodyMotion:motion}:{})});
    return true;
  }
  private detach(a:Actor,ids:readonly string[],product=false,flight?:LimbFlight):void{
    const active=ids.filter(id=>a.segments.includes(id));
    if(!active.length)return;
    const pose=this.actorPose(a),byId=new Map(pose.map(p=>[p.id,p]));
    const parts=flight?.parts??this.copyPose(active.flatMap(id=>{const p=byId.get(id);return p?[p]:[];}));
    const removed=new Set(active);
    a.segments=a.segments.filter(id=>!removed.has(id));a.health.detach(active);this.detachedCount+=active.length;
    if(product)a.oil.cut(active[0]!,active,a.segments,this.tick,()=>this.oilRandom());
    // A single cut creates a single physical branch, not one body per bone.
    this.events.push({tick:this.tick,type:'segment-detached',fighterId:a.id,segmentId:active[0]!,detachedParts:parts,...(flight?{flightId:flight.id}:{})});
  }
  /** Validated contact from a future strike resolver, or explicit lab test.
   * Plain collision overlaps never invoke this product damage path. */
  applyDamage(request:DamageRequest,flight?:LimbFlight):boolean{
    this.requireReady();
    const {fighterId,segmentId,amount,attackerId}=request;
    if(!Number.isSafeInteger(amount)||amount<=0)throw new RangeError('Invalid damage');
    const a=this.actors.find(a=>a.id===fighterId);
    if(!a)throw new RangeError('Unknown fighter');
    if(attackerId!==undefined&&!this.actors.some(v=>v.id===attackerId))throw new RangeError('Unknown attacker');
    if(this.fightEnded||a.fixed||!a.segments.includes(segmentId))return false;
    const result=a.health.apply(segmentId,amount,this.tick);
    if(!result)return false;
    this.hitCount++;a.lastHitTick=this.tick;
    const attacker=this.actors.find(b=>b.id===attackerId);if(attacker)attacker.lastHitTick=this.tick;
    if(this.tacticalCombat&&attackerId!==undefined&&attackerId!==a.id)a.tactics.hit(attackerId,this.tick,result.critical,a.behavior.traits);
    this.events.push({tick:this.tick,type:'fighter-damaged',fighterId,segmentId,damage:result.amount,remainingHP:result.remainingHP,critical:result.critical,...(attackerId===undefined?{}:{attackerId})});
    this.detach(a,result.detached,true,flight);
    if(result.cause)this.incapacitate(a.id,result.cause,attackerId);
    else if(!flight){
      const source=this.actors.find(v=>v.id===attackerId&&v.id!==a.id);
      let dx=source?a.x-source.x:-Math.sin(a.yaw),dz=source?a.z-source.z:Math.cos(a.yaw);
      if(Math.hypot(dx,dz)<1e-8){dx=-Math.sin(a.yaw);dz=Math.cos(a.yaw);}
      a.impact.hit(segmentId,dx,dz,result.critical);
    }
    return true;
  }
  /** External physics owns body transforms after handoff. Copy them at the
   * fixed-step boundary; no Rapier types leak into the core. */
  setIncapacitatedPose(fighterId:number,parts:readonly PhysicsSegmentPose[],settled=false):void{
    this.requireReady();const a=this.actors.find(a=>a.id===fighterId);
    if(!a?.fixed)throw new RangeError('Fighter is not incapacitated');
    if(parts.length!==a.physicsPose.length||parts.some((p,i)=>{
      const old=a.physicsPose[i]!;
      return p.id!==old.id||p.radius!==old.radius||p.a.length!==3||p.b.length!==3||
       ![...p.a,...p.b].every(Number.isFinite)||
       Math.abs(Math.hypot(p.a[0]-p.b[0],p.a[1]-p.b[1],p.a[2]-p.b[2])-Math.hypot(old.a[0]-old.b[0],old.a[1]-old.b[1],old.a[2]-old.b[2]))>1e-5;
    }))throw new RangeError('Invalid physics pose');
    a.physicsPose=this.copyPose(parts);a.terrainOnly||=settled;
    const pelvis=parts.find(p=>p.id==='pelvis')??parts[0];
    if(pelvis){a.x=(pelvis.a[0]+pelvis.b[0])/2;a.z=(pelvis.a[2]+pelvis.b[2])/2;
      a.y=Math.min(...parts.map(p=>Math.min(p.a[1],p.b[1])-p.radius));}
  }
  private oilRandom():number{
    this.oilRng=(Math.imul(this.oilRng,1664525)+1013904223)>>>0;
    return this.oilRng/4294967296;
  }
  private updateOil():void{
    for(const a of this.actors){
      if(a.fixed)continue;
      const chestDestroyed=a.health.chestDestroyed;
      const failed=a.oil.advance(this.tick,a.segments,()=>this.actorPose(a),()=>this.oilRandom(),(segmentId,origin)=>{
        const point:[number,number,number]=[origin[0],this.ground(a,origin[0],origin[2]),origin[2]];
        this.oilMarks.push({id:this.nextMark++,fighterId:a.id,point,tick:this.tick});
        if(this.oilMarks.length>OIL.limit)this.oilMarks.shift();
        this.events.push({tick:this.tick,type:'oil-drop',fighterId:a.id,segmentId,point:[...point]});
      },chestDestroyed);
      if(failed)this.incapacitate(a.id,chestDestroyed?'torso-failure':'oil-loss');
    }
  }
  private random(): number {
    // Mulberry32; seed zero is valid.
    this.rng = (this.rng + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.rng ^ (this.rng >>> 15), 1 | this.rng);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Preserve P3 procedural roaming; native authored maps reuse original
   * validated patrol points and reject routes blocked by real polygons. */
  private patrolGoal(a:Actor):PointXZ{
    const nav=this.navigation;
    return nav instanceof PolygonNavigation
      ?a.perception.patrol(this.tick,a,nav.location.patrol,p=>nav.reachable(a,p,nav.routePad))
      :a.perception.patrol(this.tick,a);
  }
  private routeHeading(a:Actor,goal:PointXZ):number{
    const p=(this.ringCombat||this.navigation.walls.length)?a.route.waypoint(this.navigation,a,goal,this.tick,this.ringCombat):goal;
    return wrap(Math.atan2(p.x-a.x,-(p.z-a.z))-a.yaw);
  }
  private lookAt(a:Actor,point:PointXZ|null):void{
    if(this.authored?.stalk)a.lookTarget=point?a.perception.attentionPoint(a,point):null;
    else a.perception.advanceLook(a.yaw,a,point);
  }
  private weak(a:Actor):boolean{
    const limbs=['L.','R.'].reduce((n,side)=>n+Number(a.segments.includes(side+'upperArm')&&a.segments.includes(side+'lowerArm'))+Number(a.segments.includes(side+'upperLeg')&&a.segments.includes(side+'lowerLeg')),0);
    return vulnerable(a.health.snapshot(),limbs);
  }
  private throwAttack(a:Actor,visible:readonly Actor[],commands:Map<number,FighterCommand>):boolean{
    const state=a.throwing,plan=state.plan;
    if(state.used||a.fixed||a.knockdown.blocked||a.impact.active||a.gait.posture!=='upright'||a.gait.hopPhase!=='idle'||a.strike.punch||a.crouchAmount>.01){
      state.plan=null;return false;
    }
    const health=a.health.snapshot(),range=(b:Actor)=>Math.hypot(b.x-a.x,b.z-a.z);
    const target=plan?visible.find(b=>b.id===plan.targetId):visible.filter(b=>b.distress.snapshot().mode==='prey'&&range(b)>=LIMB_THROW.minRange&&range(b)<=LIMB_THROW.maxRange).sort((b,c)=>range(b)-range(c)||b.id-c.id)[0];
    const root=plan?sacrificeArm(a.segments,health,plan.root.startsWith('L.')?'L':'R'):sacrificeArm(a.segments,health,a.id%2?'R':'L')??sacrificeArm(a.segments,health,a.id%2?'L':'R');
    if(!target||target.distress.snapshot().mode!=='prey'||!root||range(target)>LIMB_THROW.maxRange+.75||!this.navigation.clear(a,target)){
      if(plan){state.plan=null;state.retry=this.tick+60;}
      return false;
    }
    const targetParts=this.actorPose(target),aimPart=targetParts.find(p=>p.id==='head')??targetParts.find(p=>p.id==='chest');
    if(!aimPart){state.plan=null;return false;}
    const aim=midpoint(aimPart),turn=wrap(Math.atan2(aim[0]-a.x,-(aim[2]-a.z))-a.yaw);
    if(!plan){
      if(this.tick<state.retry||Math.abs(turn)>.55||!a.strike.ready(this.tick)||a.gait.running||Math.abs(a.speed)>.35)return false;
      state.plan={targetId:target.id,root,start:this.tick,aim};
      this.events.push({tick:this.tick,type:'limb-throw-windup',fighterId:a.id,targetId:target.id,segmentId:root});
    }
    this.lookAt(a,target);a.gazeFocus=aim;
    a.tactics.setMode('strike');commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});
    if(this.tick-state.plan!.start<LIMB_THROW.windupTicks)return true;
    const ids=severingChain(root).filter(id=>a.segments.includes(id));
    const parts=this.copyPose(this.actorPose(a).filter(p=>ids.includes(p.id)));
    const part=health.segments.find(p=>p.id===root&&p.attached);
    if(parts.length!==ids.length||!part){state.plan=null;return false;}
    const centers=parts.map(midpoint),origin=[0,1,2].map(i=>centers.reduce((s,p)=>s+p[i]!,0)/centers.length) as unknown as Vec3;
    const {accurate,side}=state.sample(),velocity=throwVelocity(origin,aim,target.velocity,accurate,side);
    // Same real damage path as a hostile sever, including root HP cost,
    // capacity reduction, dependent branch removal, wound and events.
    const flight=new LimbFlight(this.nextFlight++,a.id,target.id,parts,velocity,accurate);
    if(this.applyDamage({fighterId:a.id,segmentId:root,amount:part.hp,attackerId:a.id},flight)){
      state.used=true;this.flights.push(flight);
      this.events.push({tick:this.tick,type:'limb-throw',fighterId:a.id,targetId:target.id,segmentId:root,flightId:flight.id,point:origin,flightVelocity:velocity,accurate});
      a.behavior.started(this.tick,a.strike.cooldownTicks);
    }
    state.plan=null;state.retry=this.tick+60;return true;
  }
  private advanceFlights(previous:Map<number,readonly RigPose[]>|null):void{
    if(!this.flights.length)return;
    const targets=this.fightEnded?[]:this.actors.filter(a=>!a.fixed).map(a=>({id:a.id,current:this.actorPose(a),previous:previous?.get(a.id)??this.actorPose(a)}));
    const keep:LimbFlight[]=[];
    for(const flight of this.flights){
      const f=flight.advance(targets,(a,b)=>this.navigation.clear({x:a[0],z:a[2]},{x:b[0],z:b[2]},0),(x,z)=>gradeHeight(x,z,this.grade)+terrainHeight(x,z,this.mounds));
      this.events.push({tick:this.tick,type:f.ended?'limb-flight-ended':'limb-flight',fighterId:flight.owner,flightId:flight.id,flightParts:f.parts,flightVelocity:f.velocity});
      if(f.hit&&!this.fightEnded){
        this.events.push({tick:this.tick,type:'limb-hit',fighterId:f.hit.fighterId,attackerId:flight.owner,segmentId:f.hit.segmentId,point:f.hit.point,flightId:flight.id});
        this.applyDamage({fighterId:f.hit.fighterId,segmentId:f.hit.segmentId,attackerId:flight.owner,amount:LIMB_THROW.damage});
      }
      if(!f.ended)keep.push(flight);
    }
    this.flights=keep;
  }
  private planCombat(commands:Map<number,FighterCommand>,pivots:Set<number>):void{
    // Shared pre-intent pose snapshot avoids an order-dependent view of newly started strikes.
    const telegraphs=this.authored?.stalk?new Map(this.actors.map(a=>[a.id,a.strike.snapshot(this.tick)])):null;
    const vision=this.perceptionCombat?new Map(this.actors.filter(a=>!a.fixed).map(a=>[a.id,{id:a.id,x:a.x,z:a.z,yaw:a.yaw,parts:this.actorPose(a)} satisfies VisionBody])):null;
    if(this.ringCombat&&this.authored?.stalk&&!this.fightEnded)for(const a of this.actors){
      if(a.fixed||commands.has(a.id))continue;
      const health=a.health.snapshot();a.distress.advance(this.tick,this.weak(a),health.endurance<=DISTRESS.critical*health.maxEndurance,hasAttackSource(a.segments,this.expandedStrikes));
    }
    for(const a of this.actors){
      a.gazeFocus=null;a.lookTarget=null;
      const mobility=mobilityFor(a.segments),prone=this.expandedStrikes&&mobility.prone&&a.gait.posture==='prone';
      const allowed=!a.fixed&&!a.knockdown.blocked&&!this.fightEnded&&(a.strike.punch?.pounce||a.gait.hopPhase!=='flight'&&a.gait.hopPhase!=='prepare')&&((!mobility.prone&&a.gait.posture==='upright')||prone);
      const compatible=!a.strike.punch||!!a.strike.punch.prone===prone&&(!a.strike.punch.crouch&&!a.strike.punch.pounce||mobility.mode==='biped');
      a.strike.advance(this.tick,allowed&&compatible&&(!this.authored?.stalk||!a.strike.punch||this.actors.some(b=>b.id===a.strike.punch?.targetId&&!b.fixed)||a.strike.multiTarget&&this.actors.some(b=>b.id===a.strike.punch?.secondary?.targetId&&!b.fixed)),a.segments,!!this.authored?.stalk&&!a.fixed&&!a.knockdown.blocked&&a.gait.posture==='upright'&&a.gait.hopPhase==='idle');
      if(a.fixed){a.tactics.setMode('inactive');continue;}
      const command=commands.get(a.id),pivotTarget=a.pivotTarget;
      a.pivotTarget=null;
      const mobileStrikes=!!this.authored?.stalk&&this.patientScale!==1;
      const horror=this.ringCombat&&!!this.authored?.stalk&&!command;
      const distress=a.distress.snapshot().mode,defiant=horror&&(distress==='hysteria'||distress==='last-stand');
      const raiding=horror&&(mobility.mode==='biped'||defiant)&&this.patientScale!==1;
      if(!horror)a.hunt.reset(this.tick);
      if(!raiding)a.raid.reset(this.tick);
      if(this.fightEnded){a.throwing.plan=null;a.tactics.setMode('inactive');a.hunt.reset(this.tick);a.perception.clear();a.route.clear();a.disarmedGoal=null;commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});continue;}
      const opponents=this.actors.filter(b=>b!==a&&!b.fixed);
      const distanceTo=(b:Actor)=>Math.hypot(b.x-a.x,b.z-a.z);
      const previousTarget=a.tactics.snapshot().targetId;
      const sensing=vision!==null&&!command;
      const visible=sensing?opponents.filter(b=>notices(vision!.get(a.id)!,vision!.get(b.id)!,a.perception.gaze(a.yaw),(from,to)=>this.navigation.sightClear(from,to))):opponents;
      const visibleIds=visible.map(b=>b.id);
      if(sensing)a.perception.setVisible(visibleIds);
      const attentionVisible=sensing?visible:vision?opponents.filter(b=>notices(vision.get(a.id)!,vision.get(b.id)!,a.perception.gaze(a.yaw),(from,to)=>this.navigation.sightClear(from,to))):opponents;
      if(mobileStrikes)a.perception.updateTracks(this.tick,a,previousTarget,attentionVisible,opponents.map(b=>b.id));
      // v1 src/systems/ai.js: a mobile but disarmed patient does not
      // endlessly chase an armed foe it cannot hurt. Commit a safe escape
      // waypoint briefly; without armed threats use the existing patrol.
      const armed=hasAttackSource(a.segments,this.expandedStrikes);
      const prey=horror?distress==='prey':this.ringCombat&&this.weak(a);
      if(horror&&!prey&&!defiant&&allowed&&this.throwAttack(a,visible,commands))continue;
      if(a.throwing.plan){a.throwing.plan=null;a.throwing.retry=this.tick+60;}
      if(horror&&defiant&&!armed){
        a.raid.reset(this.tick);a.escape.clear();a.tactics.setMode('search');
        const near=visible.slice().sort((b,c)=>distanceTo(b)-distanceTo(c)||b.id-c.id)[0];
        this.lookAt(a,near??null);
        commands.set(a.id,{fighterId:a.id,forward:0,turn:near?clamp(wrap(Math.atan2(near.x-a.x,-(near.z-a.z))-a.yaw)*2,-1,1):0,sprint:false});
        continue;
      }
      if(this.tacticalCombat&&!command&&(prey||!armed)){
        if(horror)a.hunt.reset(this.tick,'flee');
        a.raid.reset(this.tick);
        a.escape.clear();
        // Preserve the P3 vision contract: no awareness through opaque walls.
        // A previously visible armed foe may remain in short-term memory.
        const recalled=sensing?a.perception.recalled(this.tick,a,opponents.map(b=>b.id)):null;
        const threats=opponents.filter(b=>hasAttackSource(b.segments,this.expandedStrikes)&&
          (!sensing||visibleIds.includes(b.id)||recalled?.id===b.id));
        const occupied=this.actors.filter(b=>b!==a&&!b.terrainOnly).map(b=>({x:b.x,z:b.z}));
        if(threats.length){
          const ids=threats.map(b=>b.id).join(','),goal=a.disarmedGoal;
          // Cache failed searches as well. An unreachable ward must not run
          // the 72-candidate v1 scorer every tick for a motionless patient.
          if(this.tick>=a.disarmedUntil||ids!==a.disarmedThreatIds||
             (goal!==null&&(Math.hypot(goal.x-a.x,goal.z-a.z)<DISARMED.arrival||
              !this.navigation.reachable(a,goal)||
              occupied.some(o=>Math.hypot(goal.x-o.x,goal.z-o.z)<DISARMED.occupiedRadius)))){
            a.disarmedGoal=fleeAllAttackers(a,threats,occupied,
              p=>this.navigation.reachable(a,p),p=>this.navigation.clear(a,p,.15));
            a.disarmedUntil=this.tick+DISARMED.commitTicks;
            a.disarmedThreatIds=ids;
          }
          if(a.disarmedGoal){
            const heading=this.routeHeading(a,a.disarmedGoal);
            a.tactics.setMode('retreat');
            commands.set(a.id,{fighterId:a.id,forward:Math.max(0,Math.cos(heading))*ESCAPE.fleeSpeed/MOVEMENT.sprintSpeed,
              turn:clamp(heading*2,-1,1),sprint:mobility.canSprint});
            if(sensing){
              const danger=threats.reduce((best,b)=>distanceTo(b)<distanceTo(best)?b:best,threats[0]!);
              if(visibleIds.includes(danger.id))a.perception.remember(danger.id,danger,this.tick);
              this.lookAt(a,visibleIds.includes(danger.id)?danger:recalled?.point??null);
            }
            continue;
          }
        }
        if(!threats.length){a.disarmedGoal=null;a.disarmedThreatIds='';a.disarmedUntil=0;}
        const goal=this.patrolGoal(a),heading=this.routeHeading(a,goal);
        a.tactics.setMode('search');
        commands.set(a.id,{fighterId:a.id,forward:Math.max(0,Math.cos(heading))*a.behavior.traits.pursuit,
          turn:clamp(heading*2,-1,1),sprint:false});
        if(sensing)this.lookAt(a,null);
        continue;
      }
      a.disarmedGoal=null;a.disarmedThreatIds='';a.disarmedUntil=0;
      const opening=this.ringCombat&&!horror&&!command&&this.tick<55+19*(a.id%3)&&!a.impact.active;
      if(opening){
        this.lookAt(a,null);
        a.route.clear();
        a.tactics.setMode('search');
        commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});
        continue;
      }
      const raidLocked=raiding?a.raid.lockedTarget():undefined;
      const locked=a.strike.punch?.targetId??(raidLocked!==undefined&&visibleIds.includes(raidLocked)?raidLocked:undefined);
      const candidates=sensing?opponents.filter(b=>visibleIds.includes(b.id)||b.id===locked):opponents;
      const chosen=this.tacticalCombat&&!command?a.tactics.choose(this.tick,candidates.map(b=>({id:b.id,distance:distanceTo(b),...(horror&&visibleIds.includes(b.id)&&vision?{priority:targetPriority(distanceTo(b),wrap(Math.atan2(a.x-b.x,-(a.z-b.z))-b.yaw),vision.get(b.id)!.parts)+(raiding?a.raid.targetPenalty(b.id)+.32*visible.filter(o=>o!==b&&Math.hypot(o.x-b.x,o.z-b.z)<1.3).length:0)}:{})})),locked,opponents.map(b=>b.id),raiding&&a.raid.reconsider()):null;
      const target=this.tacticalCombat&&!command
        ?opponents.find(b=>b.id===chosen)
        :opponents.sort((b,c)=>distanceTo(b)-distanceTo(c)||b.id-c.id)[0];
      const targetPoint=(b:Actor):PointXZ=>mobileStrikes&&b.gait.posture!=='upright'&&(!sensing||visibleIds.includes(b.id))?groundedContactPoint(a,vision?.get(b.id)?.parts??this.actorPose(b),b):b;
      const raidOpponent=(b:Actor):RaidOpponent=>({id:b.id,...targetPoint(b),yaw:b.segments.includes('head')?b.perception.gaze(b.yaw):b.yaw,grounded:b.gait.posture!=='upright',
        threatening:(telegraphs?.get(b.id)?.targetId===a.id||telegraphs?.get(b.id)?.targetIds?.includes(a.id)===true)&&['windup','thrust'].includes(telegraphs?.get(b.id)?.phase??'idle'),recovering:telegraphs?.get(b.id)?.phase==='recover'});
      const observed=raiding?visible.map(raidOpponent):[];
      const clearRaid=(goal:PointXZ)=>this.navigation.clear(goal,goal,.50)&&this.navigation.clear(a,goal,.30)&&!observed.some(o=>Math.hypot(o.x-goal.x,o.z-goal.z)<.55);
      const raidStep=(b:Actor|null)=>a.raid.advance({tick:this.tick,here:a,target:b&&visibleIds.includes(b.id)?raidOpponent(b):null,visible:observed,strike:a.strike.phase(this.tick),interrupted:a.impact.active||a.knockdown.blocked,ready:a.strike.ready(this.tick)&&a.behavior.ready(this.tick),clear:clearRaid,defiant,hysterical:distress==='hysteria'});
      if(!target){
        if(raiding){
          const raid=raidStep(null);
          if(raid.phase==='withdraw'||raid.phase==='reassess'){
            const heading=raid.goal?this.routeHeading(a,raid.goal):0;
            a.tactics.setMode(raid.phase==='withdraw'?'retreat':'search');
            commands.set(a.id,{fighterId:a.id,forward:raid.goal?Math.max(0,Math.cos(heading))*raid.pace:0,turn:clamp(heading*2,-1,1),sprint:raid.sprint});
            if(sensing)this.lookAt(a,a.perception.recalled(this.tick,a,opponents.map(b=>b.id))?.point??null);
            continue;
          }
        }
        a.hunt.reset(this.tick);
        a.escape.clear();
        if(sensing&&!this.fightEnded&&opponents.length&&!a.strike.punch){
          const remembered=a.perception.recalled(this.tick,a,opponents.map(b=>b.id)),goal=remembered?.point??this.patrolGoal(a);
          this.lookAt(a,remembered?.point??null);
          a.tactics.setMode(remembered?'memory':'search');
          const heading=this.routeHeading(a,goal);
          commands.set(a.id,{fighterId:a.id,forward:Math.max(0,Math.cos(heading)),turn:clamp(heading*2,-1,1),sprint:false});
        }else{a.tactics.setMode('search');if(!command)commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});}
        continue;
      }
      if(mobileStrikes)a.perception.updateTracks(this.tick,a,target.id,attentionVisible,opponents.map(b=>b.id));
      const seen=!sensing||visibleIds.includes(target.id);
      let routeLook:PointXZ|null=null;
      if(sensing){
        if(seen)a.perception.remember(target.id,target,this.tick);
        const aim=a.strike.punch?.aim;
        routeLook=seen?(this.authored?.stalk&&aim?{x:aim[0],z:aim[2]}:target):a.perception.recalled(this.tick,a,opponents.map(b=>b.id))?.point??null;
        this.lookAt(a,routeLook);
      }
      if(command&&this.authored?.stalk&&(command.attack||vision&&notices(vision.get(a.id)!,vision.get(target.id)!,a.perception.gaze(a.yaw),(from,to)=>this.navigation.sightClear(from,to))))this.lookAt(a,target);
      if(this.tacticalCombat&&!command&&previousTarget!==target.id)this.events.push({tick:this.tick,type:'combat-target',fighterId:a.id,targetId:target.id});
      a.behavior.notice(target.id,this.tick);
      const contactGoal=targetPoint(target);
      const dx=contactGoal.x-a.x,dz=contactGoal.z-a.z,distance=Math.hypot(dx,dz),turn=wrap(Math.atan2(dx,-dz)-a.yaw);
      if(this.authored?.stalk&&seen){const parts=vision?.get(target.id)?.parts??this.actorPose(target),part=parts.find(p=>p.id==='chest')??parts.find(p=>p.id==='head')??parts[0];
       if(part)a.gazeFocus=[(part.a[0]+part.b[0])*.5,(part.a[1]+part.b[1])*.5,(part.a[2]+part.b[2])*.5];}
      const facing=wrap(Math.atan2(a.x-target.x,-(a.z-target.z))-target.yaw);
      const opportunity:FightOpportunity={distance,facing,grounded:target.gait.posture!=='upright',opponent:telegraphs?.get(target.id)??target.strike.snapshot(this.tick),temperament:a.behavior.traits.temperament,...(a.lastKind?{lastKind:a.lastKind}:{}),...(a.lastContact?{lastContact:a.lastContact}:{})};
      const unobstructed=this.navigation.clear(a,contactGoal,.0),heading=(!command&&(this.ringCombat||this.navigation.walls.length)&&!a.strike.punch)?this.routeHeading(a,contactGoal):turn;
      let retreat=!raiding&&this.tacticalCombat&&!command&&!a.strike.punch&&!mobility.prone&&mobility.mode==='biped'&&a.tactics.retreating(this.tick)&&unobstructed&&distance<1.6&&Math.abs(a.x)<5.1&&Math.abs(a.z)<5.1;
      a.tactics.setMode(retreat?'retreat':'pursuit');
      const ringFootwork=this.ringCombat&&!prone&&mobility.mode==='biped';
      // A new bearing far outside the approach cone needs a planted turn.
      // Keep braking until aligned even though tactics has already stored the new target.
      const pivotLimit=pivotTarget===target.id?.30:previousTarget!==target.id?.75:Infinity;
      if(ringFootwork&&seen&&!command&&!retreat&&Math.abs(heading)>pivotLimit){
        a.pivotTarget=target.id;
        if(allowed&&!a.strike.punch&&!a.impact.active&&a.gait.hopPhase==='idle'){
          a.crouchUntil=0;
          pivots.add(a.id);
          commands.set(a.id,{fighterId:a.id,forward:0,turn:clamp(heading*2,-1,1),sprint:false});
          continue;
        }
      }
      // As in v1, break a long quiet orbit with a direct approach.
      const urgent=ringFootwork&&this.tick-a.lastHitTick>420&&this.tick>420;
      if(!raiding&&horror&&ringFootwork&&seen&&unobstructed&&!a.strike.punch&&Math.abs(turn)<.8&&shouldBackstep(opportunity,a.strike.ready(this.tick)&&a.behavior.ready(this.tick),urgent)){
       const back={x:a.x-Math.sin(a.yaw)*.30,z:a.z+Math.cos(a.yaw)*.30};
       if(this.navigation.reachable(a,back)){retreat=true;a.tactics.setMode('retreat');}
      }
      const standoff=ringFootwork?(urgent?.50:.62):CLOSE_STANDOFF;
      const stalk=ringFootwork&&!horror&&!command&&!retreat&&!urgent&&distance>1.25;
      const phase=(this.tick+29*a.id)%142;
      let burst=stalk&&phase>=104,pace=stalk?(phase<28?0:burst?.8:.48):1;
      let deliberateHold=false;
      if(!raiding&&horror&&ringFootwork&&allowed&&!retreat&&!a.strike.punch){
        // Use visible body orientation, not the target's internal health or
        // future commands. The current root yaw is unchanged during planning.
        const gazeFacing=Math.abs(wrap(Math.atan2(a.x-target.x,-(a.z-target.z))-(target.segments.includes('head')?target.perception.gaze(target.yaw):target.yaw)));
        const hunt=a.hunt.advance({tick:this.tick,targetId:target.id,distance,visible:seen,clear:unobstructed,
          aligned:Math.abs(turn)<.55,exposed:gazeFacing>1.10||opportunity.opponent.phase==='recover',grounded:target.gait.posture!=='upright',urgent,
          interrupted:a.impact.active});
        burst=hunt.sprint;pace=hunt.pace;deliberateHold=hunt.holding;
      }else if(horror)a.hunt.reset(this.tick,retreat?'flee':'search');
      const approach=ringFootwork?clamp((distance-standoff)/.42,0,1):1;
      if(!command)commands.set(a.id,{fighterId:a.id,forward:retreat?(Math.abs(turn)<.8?-.65:0):pursuitForward(distance,heading,a.behavior.traits.pursuit)*approach*pace,turn:clamp((retreat?turn:heading)*2,-1,1),sprint:burst});
      // Port of v1 anti-stuck and pincer behavior, opt-in for arena.
      // Pincer uses a body-heading approximation of the original vision;
      // full head scanning and occlusion belong to the perception step.
      if(!raiding&&this.escapeCombat&&!command&&seen){
        const sense=(b:Actor):EscapeOpponent=>({id:b.id,x:b.x,z:b.z,yaw:b.yaw,
          armed:(['arm','leg','head'] as const).some(k=>usableStrike(b.segments,k,'L')||usableStrike(b.segments,k,'R')),
          attacking:b.strike.punch?.targetId===a.id,
          visible:sensing?visibleIds.includes(b.id):a.segments.includes('head')&&distanceTo(b)<=7.03125&&Math.abs(wrap(Math.atan2(b.x-a.x,-(b.z-a.z))-a.yaw))<=100*Math.PI/360});
        const plan=a.escape.choose(this.tick,a,sense(target),visible.map(sense),this.actors.filter(b=>b!==a&&!b.terrainOnly).map(b=>({x:b.x,z:b.z})),
          mobility.mode==='biped'&&!a.strike.punch&&!a.knockdown.blocked&&!retreat,
          goal=>this.navigation.reachable(a,goal));
        if(plan){
          const heading=this.routeHeading(a,plan.goal);
          a.tactics.setMode(plan.mode);
          if(horror)a.hunt.reset(this.tick);
          commands.set(a.id,{fighterId:a.id,forward:Math.max(0,Math.cos(heading))*ESCAPE.fleeSpeed/MOVEMENT.sprintSpeed,turn:clamp(heading*2,-1,1),sprint:true});
          continue;
        }
      }
      // Prone rigs extend almost a metre in front of their pelvis. Two
      // touching heads can leave the pelvis roots more than two metres apart.
      // This is only a broad phase; each source still has to pass IK/contact.
      if(!raiding&&horror&&ringFootwork&&allowed&&seen&&unobstructed&&!retreat&&!a.strike.punch&&!a.impact.active){
        const ready=a.strike.ready(this.tick)&&a.behavior.ready(this.tick);
        const lateral=a.variety.reposition(this.tick,target.id,a,target,opportunity,ready,urgent,goal=>this.navigation.reachable(a,goal)&&this.navigation.clear(a,goal,.15)&&!this.actors.some(b=>b!==a&&!b.terrainOnly&&Math.hypot(b.x-goal.x,b.z-goal.z)<.48));
        if(lateral){
          const h=this.routeHeading(a,lateral);
          a.tactics.setMode('relocate');
          commands.set(a.id,{fighterId:a.id,forward:Math.max(0,Math.cos(h))*.72,turn:clamp(h*2,-1,1),sprint:false});
          continue;
        }
      }
      if(raiding){
        const raid=raidStep(target);
        deliberateHold=!raid.attack;
        retreat=raid.phase==='withdraw';
        let h=raid.goal?this.routeHeading(a,raid.goal):turn;
        let forward=raid.goal?Math.max(0,Math.cos(h))*raid.pace:0;
        // Keep an observed target in the neck's field of regard. A route
        // behind the body can be traversed backwards instead of turning
        // the entire body away from the threat.
        if(raid.goal&&routeLook&&(retreat||raid.phase==='flank')){
          const bearing=wrap(Math.atan2(routeLook.x-a.x,-(routeLook.z-a.z))-a.yaw);
          const route=gazeAwareRoute(h,bearing);
          h=route.heading;forward=Math.max(0,Math.cos(h))*raid.pace*(route.backward?-.85:1);
        }
        if(raid.phase==='rush'||raid.phase==='attack'){
          if(distance<.57)forward=0;
          else if(distance<1.05)forward*=clamp((distance-.57)/.48,0,1);
        }
        a.tactics.setMode(retreat?'retreat':raid.phase==='flank'?'relocate':raid.phase==='observe'||raid.phase==='reassess'?'search':'pursuit');
        commands.set(a.id,{fighterId:a.id,forward,turn:clamp(h*2,-1,1),sprint:forward>0&&raid.sprint});
      }
      if(defiant)a.tactics.setMode('pursuit');
      const lowVictim=this.expandedStrikes&&!prone&&target.gait.posture!=='upright';
      const groundedPair=this.expandedStrikes&&(prone||target.gait.posture!=='upright');
      const pounceReady=mobileStrikes&&!prone&&!lowVictim&&mobility.mode==='biped'&&a.gait.hopPhase==='idle'&&!a.gait.running&&a.crouchAmount<.01&&!a.gait.footStates.some(f=>f.moving)&&Math.abs(a.speed)<.35&&distance>.82&&distance<1.8&&Math.abs(turn)<.25&&(!command||!!command.jump)&&this.navigation.clear(a,{x:a.x+Math.sin(a.yaw)*POUNCE.distance*this.patientScale,z:a.z-Math.cos(a.yaw)*POUNCE.distance*this.patientScale},.35);
      const previewRange=groundedPair?2.65:pounceReady?1.8:this.expandedStrikes?(mobileStrikes?1.18:1.05):.82;
      let checkedStrikeGeometry=false,preparingLowKick=false;
      if(unobstructed&&seen&&allowed&&!retreat&&!deliberateHold&&!a.impact.active&&(command?.attack??!command)&&Math.abs(turn)<=(mobileStrikes&&!prone?SIDE_STRIKE_LIMIT:.65)&&distance<previewRange&&a.strike.ready(this.tick)&&(!!command||a.behavior.ready(this.tick))){
        checkedStrikeGeometry=true;
        const pose=this.worldPose(this.actorPose(a,false,true,true),1/this.patientScale),victim=this.worldPose(this.actorPose(target),1/this.patientScale),eligible=(id:string)=>target.health.canDamage(id,this.tick);
        const ground=this.gaitGround(a);
        const startAttack=(kind:StrikeKind,best:PunchChoice):boolean=>{
          let secondary:StrikeChannel|undefined;
          if(mobileStrikes&&!prone&&!best.crouch&&!best.pounce&&kind!=='head'&&this.authored){
            const track=a.perception.snapshot(a.yaw).tracked.find(t=>t.id!==target.id&&t.visible);
            const other=track&&attentionVisible.find(b=>b.id===track.id);
            if(other&&distanceTo(other)<1.25&&this.navigation.clear(a,other,0)&&Math.abs(wrap(Math.atan2(other.x-a.x,-(other.z-a.z))-a.yaw))<=SIDE_STRIKE_LIMIT){
              const primary:Punch={kind,side:best.side,targetId:target.id,aim:best.aim,start:0,yaw:a.yaw,targetSegment:best.id};
              const second=chooseSecondChannel(pose,a.segments,primary,victim,eligible,other.id,this.worldPose(this.actorPose(other),1/this.patientScale),id=>other.health.canDamage(id,this.tick),this.authored,ground);
              if(second)secondary={...second,aim:this.scalePoint(second.aim,this.patientScale)};
            }
          }
          return a.strike.start(this.tick,best.side,target.id,this.scalePoint(best.aim,this.patientScale),a.yaw,best.id,kind,prone,secondary,!!best.crouch,!!best.pounce);
        };
        const order:StrikeKind[]=this.expandedStrikes?(command?.attackKind?[command.attackKind]:lowVictim?['leg','arm','head']:['arm','leg','head']):['arm'];
        if(this.expandedStrikes&&!this.ringCombat&&!command&&!lowVictim&&order.length>1){const shift=(a.strike.attempts+a.id)%order.length;order.push(...order.splice(0,shift));}
        let selected:{kind:StrikeKind;best:PunchChoice;needsPlant:boolean;score:number}|null=null;
        for(const kind of order){
          if(kind==='head'&&Math.abs(turn)>=.65)continue;
          if(ringFootwork&&!command&&kind==='head'&&!pounceReady&&distance>(horror?.60:.49))continue;
          if(a.crouchAmount>.01&&kind!=='arm')continue;
          if(kind==='leg'&&(prone||!usableStrike(a.segments,'leg','L')))continue;
          const needsPlant=kind==='leg'&&(a.gait.running||a.gait.footStates.some(f=>f.moving)||!mobileStrikes&&Math.abs(a.speed)>.10);
          // In the authored profile a kick may start at any speed when
          // both feet have landed. Finish an ongoing step without braking.
          if(needsPlant&&mobileStrikes)continue;
          if(needsPlant&&!horror&&!(this.authored?.stalk&&command?.attackKind==='leg')&&(!lowVictim||command))continue;
          const score=horror&&!prone?(c:PunchChoice)=>attackScore(kind,c,opportunity)+a.variety.adjustment(kind,c)+(c.crouch?(lowVictim?.65:.12):0)+(c.pounce?.35:0):undefined;
          let best=prone&&kind!=='leg'?chooseProneStrike(pose,a.segments,victim,a.yaw,eligible,kind,ground,a.strike.attempts+a.id):kind==='arm'?choosePunch(pose,a.segments,victim,a.yaw,eligible,a.strike.attempts+a.id,this.authored,ground,score):chooseExtra(pose,a.segments,victim,a.yaw,eligible,kind,ground,this.authored,lowVictim,score);
          if(a.crouchAmount>.01)best=null;
          if(kind==='arm'&&mobileStrikes&&mobility.mode==='biped'&&distance<1.15&&a.gait.hopPhase==='idle'){
            const crouched=choosePunch(pose,a.segments,victim,a.yaw,eligible,a.strike.attempts+a.id,this.authored,ground,score,true);
            if(crouched&&(!best||score&&score(crouched)>score(best)))best=crouched;
          }
          if(pounceReady&&this.authored){
            const rank=score??((c:PunchChoice)=>attackScore(kind,c,opportunity));
            const jumping=choosePounce(pose,a.segments,victim,a.yaw,eligible,kind,ground,this.authored,rank);
            if(jumping&&(command?.jump||!best||rank(jumping)>rank(best)))best=jumping;
          }
          const plantRequired=!best?.pounce&&needsPlant||!!best?.crouch&&(a.gait.running||a.gait.footStates.some(f=>f.moving)||Math.abs(a.speed)>.16);
          if(score){if(best){const value=score(best);if(!selected||value>selected.score)selected={kind,best,needsPlant:plantRequired,score:value};}continue;}
          if(best&&plantRequired){
            preparingLowKick=true;
            commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});
            break;
          }
          if(best&&startAttack(kind,best)){
            a.behavior.started(this.tick,a.strike.cooldownTicks);
            this.events.push({tick:this.tick,type:'combat-windup',fighterId:a.id,targetId:target.id,segmentId:strikeSource(kind,best.side),strikeKind:kind,proneStrike:prone,...(best.crouch?{crouchStrike:true}:{}),...(best.pounce?{pounceStrike:true}:{}),...(a.strike.punch?.secondary?{secondaryTargetId:a.strike.punch.secondary.targetId,secondarySourceSegment:strikeSource(a.strike.punch.secondary.kind,a.strike.punch.secondary.side)}:{})});break;
          }
        }
        if(selected){
          const {kind,best,needsPlant}=selected;
          if(needsPlant){preparingLowKick=true;commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});}
          else if(startAttack(kind,best)){
            a.lastKind=kind;a.lastContact=best.contactId;a.variety.committed(kind,best);
            if(raiding)a.raid.committed(this.tick,target.id);
            a.behavior.started(this.tick,a.strike.cooldownTicks);
            this.events.push({tick:this.tick,type:'combat-windup',fighterId:a.id,targetId:target.id,segmentId:strikeSource(kind,best.side),strikeKind:kind,proneStrike:prone,...(best.crouch?{crouchStrike:true}:{}),...(best.pounce?{pounceStrike:true}:{}),...(a.strike.punch?.secondary?{secondaryTargetId:a.strike.punch.secondary.targetId,secondarySourceSegment:strikeSource(a.strike.punch.secondary.kind,a.strike.punch.secondary.side)}:{})});
          }
        }
      }
      // v1 close-range fallback: a root gap below standoff does not mean
      // an actual healthy capsule is reachable by any usable strike.
      // Move a little closer only after the existing IK/swept preview failed;
      // blocked roots can then participate in the anti-stuck logic.
      if(!command&&checkedStrikeGeometry&&!preparingLowKick&&!a.strike.punch&&!mobility.prone&&distance<=standoff){
        const old=commands.get(a.id)!;
        commands.set(a.id,{...old,forward:pursuitForward(distance,heading,a.behavior.traits.pursuit,true)*(ringFootwork?.55:1)});
      }
      const punch=a.strike.punch;
      if(punch){
        if(horror)a.hunt.reset(this.tick);
        if(this.ringCombat&&!raiding)a.route.clear();
        if(!raiding||a.raid.snapshot().phase!=='withdraw')a.tactics.setMode('strike');
        const victim=this.actors.find(b=>b.id===punch.targetId&&!b.fixed);
        const windup=a.strike.phase(this.tick)==='windup';
        if(windup)for(const channel of strikeChannels(punch)){
          const foe=this.actors.find(b=>b.id===channel.targetId&&!b.fixed);
          if(!foe||!channel.targetSegment||sensing&&!visibleIds.includes(foe.id))continue;
          const part=this.actorPose(foe).find(p=>p.id===channel.targetSegment);
          const shoulder=this.actorPose(a).find(p=>p.id===strikeOrigin(channel.kind??'arm',channel.side));
          if(part&&shoulder)a.strike.track(this.tick,closestAim(shoulder.a,part),channel.targetId);
        }
        if(this.authored?.stalk){a.gazeFocus=a.strike.punch?.aim??punch.aim;
          if(victim&&(!sensing||visibleIds.includes(victim.id)))this.lookAt(a,{x:a.gazeFocus[0],z:a.gazeFocus[2]});
        }
        const gap=victim?Math.hypot(victim.x-a.x,victim.z-a.z):0;
        if(mobileStrikes&&!punch.prone){
          // Preserve player intent or the already evaluated autonomous
          // movement. An unseen target does not authorize auto pursuit.
          const desired=command??commands.get(a.id)??{fighterId:a.id,forward:0,turn:0,sprint:false};
          const locomotion=command||victim&&(!sensing||visibleIds.includes(victim.id))?desired:{...desired,forward:0,turn:0,sprint:false};
          commands.set(a.id,strikeLocomotion(locomotion,punch,a.strike.phase(this.tick)));
        }else commands.set(a.id,{fighterId:a.id,forward:!punch.prone&&windup&&!command&&(!sensing||visibleIds.includes(punch.targetId))&&gap>(this.ringCombat?.75:.60)&&(punch.kind??'arm')==='arm'?.55:0,turn:0,sprint:false});
      }
    }
  }
  private resolveStrikes(previous:Map<number,readonly RigPose[]>):void{
    const current=new Map(this.actors.filter(a=>!a.fixed).map(a=>[a.id,this.actorPose(a)]));
    const requests:DamageRequest[]=[];
    // Capture all contacts before mutating anatomy or incapacitating either fighter.
    for(const a of this.actors){
      const p=a.strike.punch;if(a.fixed||!p||a.strike.exhausted||a.strike.phase(this.tick)!=='thrust'||p.pounce&&a.gait.hopPhase!=='flight'||(p.prone?a.gait.posture!=='prone':a.gait.posture!=='upright'))continue;
      const a0=previous.get(a.id),a1=current.get(a.id);if(!a0||!a1)continue;
      const contacts=strikeChannels(p).flatMap(channel=>{
        const b=this.actors.find(b=>b.id===channel.targetId&&!b.fixed);
        if(!b||b===a||!a.strike.canContact(b.id)||!this.navigation.clear(a,b))return [];
        const b0=previous.get(b.id),b1=current.get(b.id);if(!b0||!b1)return [];
        const contact=firstStrikeContactDetail(a0,a1,b0,b1,channel.side,channel.kind??'arm');
        return contact?[{b,contact,channel}]:[];
      }).sort((l,r)=>l.contact.time-r.contact.time||l.b.id-r.b.id);
      for(const {b,contact,channel} of contacts){
        if(!a.strike.resolveTarget(b.id))continue;
        this.events.push({tick:this.tick,type:'strike-contact',fighterId:b.id,attackerId:a.id,segmentId:contact.id,sourceSegment:strikeSource(channel.kind??'arm',channel.side),strikeKind:channel.kind??'arm',proneStrike:!!p.prone,...(p.crouch?{crouchStrike:true}:{}),...(p.pounce?{pounceStrike:true}:{}),...(this.authored?.stalk?{point:contact.point}:{})});
        requests.push({fighterId:b.id,segmentId:contact.id,attackerId:a.id,amount:b.health.canDamage(contact.id,this.tick)?a.behavior.damage():1});
      }
    }
    for(const request of requests){
      if(this.applyDamage(request)&&this.ringCombat&&this.authored?.stalk){
        const attacker=this.actors.find(a=>a.id===request.attackerId);
        attacker?.raid.damagedTarget(request.fighterId,attacker.strike.punch?.secondary?.targetId===request.fighterId);
      }
    }
  }
  private finishFight():void{
    if(this.fightEnded||this.actors.length<2)return;
    const active=this.actors.filter(a=>!a.fixed);
    if(active.length>1)return;
    this.fightEnded=true;this.winnerId=active[0]?.id??null;
    for(const a of this.actors)a.strike.advance(this.tick,false,a.segments,!!this.authored?.stalk&&!a.fixed&&!a.knockdown.blocked&&a.gait.posture==='upright'&&a.gait.hopPhase==='idle');
    this.events.push({tick:this.tick,type:'fight-ended',fighterId:this.winnerId??0});
  }
  step(dt: number, input: InputFrame): void {
    this.requireReady();
    if (dt !== FIXED_DT) throw new RangeError('Lab requires exactly 1/60 s');
    const commands = new Map<number,FighterCommand>();
    for (const c of input.commands) {
      if (commands.has(c.fighterId) || !this.actors.some(a=>a.id===c.fighterId) ||
          !Number.isFinite(c.forward) || Math.abs(c.forward)>1 ||
          !Number.isFinite(c.turn) || Math.abs(c.turn)>1 || typeof c.sprint !== 'boolean'||(c.jump!==undefined&&typeof c.jump!=='boolean')||(c.attack!==undefined&&typeof c.attack!=='boolean')||(c.attackKind!==undefined&&!['arm','leg','head'].includes(c.attackKind)))
        throw new RangeError('Invalid or duplicate command');
      commands.set(c.fighterId,c);
    }
    const rootsBefore=this.actors.map(a=>[a.x,a.y,a.z] as const);
    const automatic=this.escapeCombat?new Set(this.actors.filter(a=>!commands.has(a.id)).map(a=>a.id)):null;
    const escapeStart=automatic?new Map(this.actors.map(a=>[a.id,[a.x,a.z] as const])):null;
    const pivots=new Set<number>();
    if(this.combat)this.planCombat(commands,pivots);
    const previous=this.combat&&!this.fightEnded?new Map(this.actors.filter(a=>!a.fixed).map(a=>[a.id,this.actorPose(a)])):null;
    // Reuse the existing pre-step strike geometry on authored rounds.
    // Non-combat authored diagnostics need a sample as well. No extra
    // queries in the normal combat path or the legacy simulation.
    this.handoffPrevious=this.authored?.stalk?(previous??new Map(this.actors.filter(a=>!a.fixed).map(a=>[a.id,this.actorPose(a)]))):null;
    this.handoffTick=this.tick;
    for (const a of this.actors) {
      if(a.fixed)continue;
      const c = commands.get(a.id);
      if(this.authored?.stalk){
       const stableHead=a.strike.visual(this.tick)?.punch.kind==='head'&&!a.knockdown.blocked;
       const h=(stableHead?this.actorPose(a,false,true):this.handoffPrevious?.get(a.id))?.find(p=>p.id==='head');
       a.gazePitch.advance(dt,h?.a??[a.x,a.y+1.5,a.z],a.gazeFocus,!!a.strike.punch||a.raid.snapshot().phase==='rush');
      }
      let target = 0;
      const mobility=mobilityFor(a.segments);
      const previousPhase=a.knockdown.phase;
      a.knockdown.advance(dt,!mobility.prone);
      if(previousPhase!=='standing'&&a.knockdown.phase==='standing'&&!mobility.prone)this.events.push({tick:this.tick+1,type:'fighter-recovered',fighterId:a.id});
      const flinch=a.impact.slow,recoil=a.impact.advance(dt);
      if(a.knockdown.blocked||previousPhase!=='standing'&&a.gait.hasKnockdownMotion&&!mobility.prone){
        a.speed=0;a.crouchAmount=0;a.crouchUntil=0;
        const ground=(x:number,z:number)=>this.ground(a,x,z);
        a.y+=clamp(ground(a.x,a.z)-a.y,-.9*dt,.9*dt);
        a.gait.advance(this.gaitPoint([a.x,a.y,a.z]),a.yaw,0,dt,this.gaitGround(a),mobility,a.segments,a.knockdown.amount??0);
        if(this.authored?.stalk&&this.combat)a.perception.advanceLook(a.yaw,a,a.lookTarget);
        a.gait.advanceExpression(dt,a.impact.active);
        continue;
      }
      const beforeYaw=a.yaw,organic=!!this.authored?.stalk&&this.patientScale!==1;
      const attack=a.strike.punch;
      if(attack?.crouch)a.crouchUntil=this.tick+30;
      const holdCrouch=organic&&mobility.mode==='biped'&&a.gait.posture==='upright'&&(!!attack?.crouch||!attack&&this.tick<a.crouchUntil&&!!a.gazeFocus&&Math.hypot(a.gazeFocus[0]-a.x,a.gazeFocus[2]-a.z)<1.3&&!a.impact.active&&(a.raid.snapshot().phase==='attack'||!!c?.attack));
      a.crouchAmount=mobility.mode==='biped'?clamp(a.crouchAmount+(holdCrouch?1:-1)*dt/.28,0,1):0;
      const movement=organic?HORROR_MOVEMENT:MOVEMENT;
      if (c || a.id === 0) {
        const turn=a.crouchAmount>.01?0:c?.turn??0,quick=!!this.authored?.stalk&&this.patientScale!==1&&mobility.mode==='biped'&&a.gait.posture==='upright'&&a.gait.hopPhase==='idle';
        a.yaw += (quick?horrorTurnRate(turn):turn*2.15)*dt*flinch*a.behavior.traits.turnMultiplier;
        target = organic&&mobility.mode==='biped'?patientDriveSpeed(c?.forward??0,!!c?.sprint&&mobility.canSprint,a.behavior.traits.movementMultiplier):(c?.forward ?? 0) * (c?.sprint && mobility.canSprint ? movement.sprintSpeed : organic&&mobility.mode!=='biped'?1.20:movement.walkSpeed);
        if(organic&&mobility.mode==='biped'&&c?.sprint){
          // High speed and a sharp change of heading cannot share a
          // planted foot. Slow into turns instead of skidding in place.
          const turnLoad=Math.abs(turn);target*=1-.72*Math.min(1,turnLoad*turnLoad);
        }
      } else {
        a.wanderTimer -= dt;
        if (a.wanderTimer <= 0) {
          a.wanderTimer = 1.5 + this.random()*2.5;
          a.wanderAngle += 1 - this.random()*2;
          a.wanderSpeed = .24 + this.random()*.43;
        }
        if (Math.abs(a.x)>4.2 || Math.abs(a.z)>4.2)
          a.wanderAngle = -Math.atan2(a.x,a.z);
        a.yaw += clamp(wrap(a.wanderAngle-a.yaw),-1.1*dt,1.1*dt)*flinch*a.behavior.traits.turnMultiplier;
        target = a.wanderSpeed;
      }
      target*=mobility.speedScale*flinch*(organic&&mobility.mode==='biped'&&(c||a.id===0)?1:a.behavior.traits.movementMultiplier)*(organic&&mobility.prone?(mobility.mode==='arm-crawl'?HORROR_MOVEMENT.crawlMultiplier:HORROR_MOVEMENT.residualCrawlMultiplier):1);
      const crouch=a.crouchAmount>.01,kick=a.strike.punch?.kind==='leg'&&!a.strike.punch?.pounce,kickSupport=organic&&kick?(a.strike.punch!.side==='L'?'R':'L'):undefined;
      const planted=pivots.has(a.id)||this.ringCombat&&this.fightEnded&&a.id===this.winnerId;
      a.speed = planted||crouch||mobility.mode==='unsupported'||kick&&!organic||a.strike.punch?.prone?0:damp(a.speed,target,organic&&c?.sprint&&mobility.mode==='biped'?5.5:3);
      const ground=(x:number,z:number)=>this.ground(a,x,z);
      const travel=a.strike.punch?.prone?0:a.gait.travel(dt,a.speed/this.patientScale,mobility,a.id,this.gaitPoint([a.x,a.y,a.z]),a.yaw,this.tick*FIXED_DT,this.gaitGround(a),!crouch&&c?.jump,Math.abs(target)>.025,kickSupport,!!attack?.pounce)*this.patientScale;
      const oldX=a.x,oldZ=a.z;
      a.x = clamp(a.x+Math.sin(a.yaw)*travel+recoil[0],-5.65,5.65);
      a.z = clamp(a.z-Math.cos(a.yaw)*travel+recoil[2],-5.65,5.65);
      if(this.navigation instanceof PolygonNavigation||this.navigation.walls.length){const p=this.navigation.move({x:oldX,z:oldZ},a);a.x=p.x;a.z=p.z;}
      a.y+=clamp(ground(a.x,a.z)-a.y,-.9*dt,.9*dt);
      // Update local neck angle against the new body yaw/position, once per tick.
      if(this.authored?.stalk&&this.combat&&!this.fightEnded)a.perception.advanceLook(a.yaw,a,a.lookTarget,(a.yaw-beforeYaw)/dt,!!a.strike.punch||!!c?.sprint);
      const actualSpeed=mobility.mode==='biped'?((a.x-oldX)*Math.sin(a.yaw)-(a.z-oldZ)*Math.cos(a.yaw))/dt:a.speed;
      a.gait.advance(this.gaitPoint([a.x,a.y,a.z]),a.yaw,actualSpeed/this.patientScale,dt,this.gaitGround(a),mobility,a.segments,undefined,crouch||kick,(a.yaw-beforeYaw)/dt,a.speed/this.patientScale);
      const mode=a.tactics.snapshot().mode;
      const intent=this.ringCombat&&!this.fightEnded?(a.strike.punch?'aggressive':mode==='search'||mode==='memory'?(Math.abs(a.speed)<.055?'freeze':'stalk'):mode==='pursuit'?(Math.abs(c?.forward??0)<.08?'freeze':c?.sprint?'aggressive':'stalk'):'stance'):'stance';
      // Guard is a combat-distance state, not the generic aggressive
      // expression used during sprint. Aim from an observed target only.
      const aim=a.lookTarget,guard=this.combat&&!this.fightEnded&&(!!a.strike.punch||!!aim&&!!a.gazeFocus&&Math.hypot(a.gazeFocus[0]-a.x,a.gazeFocus[2]-a.z)<1.9);
      const armBearing=aim?wrap(Math.atan2(aim.x-a.x,-(aim.z-a.z))-a.yaw):0;
      a.gait.advanceExpression(dt,a.impact.active,intent,guard,armBearing);
    }
    this.tick++;
    if(previous)this.resolveStrikes(previous);
    this.advanceFlights(previous);
    const hits:SegmentContact[] = [];
    const before=this.dynamicBalance?this.actors.map(a=>[a.x,a.z] as const):[];
    this.collisionStats = resolveCollisions(this.actors.filter(a=>!a.terrainOnly),a=>this.actorPose(a),this.fracture?hits:undefined,this.combat,this.navigation instanceof PolygonNavigation||this.navigation.walls.length?(a,x,z)=>this.navigation.move(a,{x,z}):undefined);
    if(this.dynamicBalance)for(let i=0;i<this.actors.length;i++){
      const a=this.actors[i]!,old=before[i]!,displacement=Math.hypot(a.x-old[0],a.z-old[1]),mobility=mobilityFor(a.segments);
      if(a.fixed||displacement<KNOCKDOWN.softDisplacement||a.knockdown.blocked||mobility.prone||(a.gait.hopHeight>.025||a.gait.runningAirborne))continue;
      const root=this.gaitPoint([a.x,a.y,a.z]);
       const full=a.gait.pose(a.id,root,a.yaw,this.tick*FIXED_DT,false,this.authored?.stalk?a.perception.gaze(a.yaw)-a.yaw:0,this.authored?.stalk?a.impact.reaction:undefined,a.gazePitch.pitch);
       const parts=full.filter(p=>a.segments.includes(p.id));
      const world=this.worldPose(parts);
      const support=analyzeSupport(this.gradeContact?.(world,a.baseY)??world,(x,z)=>this.ground(a,x,z));
      const onset=this.authored?.stalk&&this.patientScale!==1&&mobility.mode==='biped'?(parts.length===full.length?this.actorPose(a,true):full):null;
      if(a.knockdown.observe(displacement,support.margin,true)){
        if(onset)a.gait.beginKnockdown(root,onset);
        a.speed=0;this.events.push({tick:this.tick,type:'fighter-knocked-down',fighterId:a.id});
      }
    }
    if(this.fracture)this.episodes.advance(this.tick,hits,(id,part)=>this.actors.some(a=>a.id===id&&!a.fixed&&a.segments.includes(part)),(hit,chain)=>{
      this.hitCount++;
      this.events.push({tick:this.tick,type:'lab-hit',fighterId:hit.fighterId,segmentId:hit.segmentId});
      const actor=this.actors.find(a=>a.id===hit.fighterId)!;
      this.detach(actor,chain);
    });
    if(automatic&&escapeStart)for(const a of this.actors){
      if(!automatic.has(a.id))continue;
      const old=escapeStart.get(a.id)!,c=commands.get(a.id),mode=a.tactics.snapshot().mode;
      const huntPhase=a.hunt.snapshot().phase;
      const eligible=!a.fixed&&!a.knockdown.blocked&&!a.impact.active&&!a.strike.punch&&mobilityFor(a.segments).mode==='biped'&&mode==='pursuit'&&huntPhase!=='observe'&&huntPhase!=='recover';
      const wantsMove=!!c&&Math.abs(c.forward)>.16;
      a.escape.observe(Math.hypot(a.x-old[0],a.z-old[1]),wantsMove,!wantsMove&&!!c&&Math.abs(c.turn)<.2&&this.tick-a.lastHitTick>120,eligible);
    }
    this.actors.forEach((a,i)=>{const b=rootsBefore[i]!;a.velocity=a.fixed?[0,0,0]:[(a.x-b[0])/dt,(a.y-b[1])/dt,(a.z-b[2])/dt];});
    // v1 game/loop.js stops round damage and oil-loss deadlines after
    // the result, while presentation/physical settling can continue.
    if(!this.fightEnded){this.updateOil();if(this.combat)this.finishFight();}
    if(this.ringCombat&&this.winnerId!==null&&this.victoryStart===null){
      const winner=this.actors.find(a=>a.id===this.winnerId)!;
      if(!mobilityFor(winner.segments).prone&&!winner.knockdown.blocked&&winner.gait.posture==='upright'&&winner.gait.hopPhase==='idle'&&!winner.impact.active){
        this.victoryStart=this.tick;
      }
    }
  }

  getSnapshot(): WorldSnapshot {
    this.requireReady();
    const fighterIds = new Uint32Array(this.actors.length);
    const roots = new Float32Array(this.actors.length*4);
    this.actors.forEach((a,i)=>{
      fighterIds[i]=a.id;
      roots.set([a.x,a.y,a.z,a.yaw],i*4);
    });
    const rigSegments=this.actors.map(a=>{
      const pose=this.actorPose(a);
      if(a.id!==this.winnerId||this.victoryStart===null)return this.copyPose(pose);
      const elapsed=this.tick-this.victoryStart;
      if(elapsed<=0||elapsed>=VICTORY_TICKS)return this.copyPose(pose);
      const celebratory=victoryPose(this.worldPose(pose,1/this.patientScale),a.yaw,elapsed,this.gaitGround(a));
      return this.copyPose(this.worldPose(celebratory));
    });
    const supports=rigSegments.map((parts,i)=>analyzeSupport(parts,(x,z)=>this.ground(this.actors[i]!,x,z)));
    return {tick:this.tick,elapsedSeconds:this.tick*FIXED_DT,fighterIds,roots,
      segmentIds:this.actors.map(a=>Object.freeze([...a.segments])),
      mobilityModes:this.actors.map(a=>mobilityFor(a.segments).mode),
      postures:this.actors.map(a=>a.gait.posture),
      bodyTerrainStates:this.actors.map(a=>a.terrainOnly),
      oil:this.actors.map(a=>a.oil.snapshot()),oilMarks:this.oilMarks.map(m=>({...m,point:[...m.point]})),impacts:this.actors.map(a=>a.impact.snapshot()),
      routes:this.actors.map(a=>a.route.snapshot()),
      perception:this.actors.map(a=>a.perception.snapshot(a.yaw)),
      headFrames:this.actors.map((a,i)=>{
        if(a.fixed)return null;
        const frame=headFrame(rigSegments[i]!,a.perception.gaze(a.yaw),this.authored?.stalk?a.gazePitch.pitch:undefined);
        const strike=a.strike.visual(this.tick)?.punch;
        return this.authored?.stalk&&strike?.kind==='head'&&!a.knockdown.blocked&&!strike.prone
          ?withCameraMount(frame,this.actorPose(a,false,true)):frame;
      }),
      escapes:this.actors.map(a=>a.escape.snapshot()),
      tactics:this.actors.map(a=>a.tactics.snapshot()),
      hunts:this.actors.map(a=>a.hunt.snapshot()),
      raids:this.actors.map(a=>a.raid.snapshot()),
      patientTraits:this.actors.map(a=>a.behavior.snapshot()),
      strikes:this.actors.map(a=>a.strike.snapshot(this.tick)),fight:{ended:this.fightEnded,winnerId:this.winnerId},
      health:this.actors.map(a=>a.health.snapshot()),distress:this.actors.map(a=>a.distress.snapshot()),
      lifeStates:this.actors.map(a=>a.fixed?'incapacitated':'active'),
      balanceStates:this.actors.map(a=>a.knockdown.phase),
      stepCounts:this.actors.map(a=>a.gait.stepCount),footStates:this.actors.map(a=>a.gait.footStates.map(f=>({...f,point:this.scalePoint(f.point,this.patientScale),target:this.scalePoint(f.target,this.patientScale)}))),
      hopHeights:this.actors.map(a=>a.gait.hopHeight*this.patientScale),hopPhases:this.actors.map(a=>a.gait.hopPhase),
      damageStats:{hits:this.hitCount,detached:this.detachedCount}, collisionStats:{...this.collisionStats}, rigVersion:2, rigSegments,supports,crawlAnchors:rigSegments.map((parts,i)=>this.actors[i]!.fixed?[]:this.actors[i]!.gait.crawlAnchors(this.worldPose(parts,1/this.patientScale)).map(c=>({...c,point:this.scalePoint(c.point,this.patientScale)}))),residualTraction:rigSegments.map((parts,i)=>this.actors[i]!.fixed?null:this.actors[i]!.gait.residualSupport(this.worldPose(parts,1/this.patientScale)))};
  }
  drainEvents(): readonly SimulationEvent[] { this.requireReady(); const events=this.events;this.events=[];return events; }
  dispose(): void { this.ready=false; this.mounds=[]; this.actors=[];this.flights=[]; this.tick=0;this.handoffPrevious=null;this.handoffTick=-1; this.rng=0;this.oilMarks=[];this.events=[];this.episodes.reset(); }
  private requireReady(): void { if (!this.ready) throw new Error('Simulation core is not initialized'); }
}
