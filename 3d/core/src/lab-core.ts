import { ArenaNavigation,RouteState,sightClear } from './arena/navigation.js';
import type { PointXZ } from './combat/escape.js';
import { PatientPerception,notices,type VisionBody } from './combat/perception.js';
import { EscapeState,ESCAPE,type EscapeOpponent } from './combat/escape.js';
import { usableStrike } from './combat/strike.js';
import { CombatTactics } from './combat/tactics.js';
import { pursuitForward,CLOSE_STANDOFF } from './combat/engagement.js';
import { PatientBehavior } from './combat/patient-profile.js';
import { chooseProneStrike } from './combat/prone-choice.js';
import { chooseExtra } from './combat/extra-choice.js';
import { choosePunch,closestAim } from './combat/punch-choice.js';
import { STRIKE,StrikeState,punchPose,strikeSource,strikeOrigin,type StrikeKind } from './combat/strike.js';
import { firstStrikeContact } from './combat/swept-contact.js';
import { ImpactState } from './combat/impact.js';
import { OilState,OIL,type OilMark } from './combat/oil.js';
import { DamageState,type IncapacitationCause } from './combat/damage.js';
import { Knockdown,KNOCKDOWN } from './rig/knockdown.js';
import { analyzeSupport } from './rig/support.js';
import { MOVEMENT } from './rig/movement-timing.js';
import { mobilityFor } from './rig/mobility.js';
import { expandLegacyTorso } from './rig/anatomy.js';
import { terrainHeight, type Mound } from './collision/terrain.js';
import { ContactEpisodes, type SegmentContact } from './collision/contact-episodes.js';
import { resolveCollisions, type CollisionStats } from './collision/resolve.js';
import { PatientGait,type RigPose } from './rig/gait.js';
import { FIXED_DT } from './fixed-clock.js';
import type { FighterCommand, InputFrame, SimulationCore, SimulationEvent, WorldConfig, WorldSnapshot, PhysicsSegmentPose, DamageRequest } from './types.js';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
const damp = (a: number, b: number, k: number) => a + (b - a) * (1 - Math.exp(-k * FIXED_DT));

interface Actor {
  id: number; x: number; y: number; z: number; yaw: number; baseY:number;
  speed: number; wanderTimer: number; wanderAngle: number; wanderSpeed: number;
  segments: string[]; gait: PatientGait; knockdown:Knockdown; fixed:boolean; health:DamageState; impact:ImpactState; oil:OilState; strike:StrikeState; behavior:PatientBehavior; tactics:CombatTactics; escape:EscapeState; perception:PatientPerception; route:RouteState; lastHitTick:number; terrainOnly:boolean; physicsPose:readonly RigPose[];
}

/** Root locomotion and procedural rig. Includes kinematic collision correction; optional lab-only contact fracture; no debris yet.
 * Public yaw is positive right (towards +X from -Z).
 * Lab Three.js heading is the negative of this yaw.
 */
export class LabSimulationCore implements SimulationCore {
  private actors: Actor[] = [];
  private tick = 0;
  private rng = 0;
  private oilRng=0;private oilMarks:OilMark[]=[];private nextMark=0;
  private ready = false;
  private mounds:readonly Mound[]=[];
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
  private hitCount = 0;
  private detachedCount = 0;
  private collisionStats: CollisionStats = {tests:0,contacts:0,wallContacts:0};

  initialize(config: WorldConfig): void {
    if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff)
      throw new RangeError('seed must be uint32');
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
      return {id:f.id,x,y,z,yaw:f.yawRad,baseY:y,speed:0,wanderTimer:1+f.id*.3,
        wanderAngle:f.yawRad,wanderSpeed:.35,segments:expandLegacyTorso(f.segmentIds),gait:new PatientGait(f.origin,f.yawRad),knockdown:new Knockdown(),fixed:false,health:new DamageState(expandLegacyTorso(f.segmentIds)),impact:new ImpactState(),oil:new OilState(),strike:new StrikeState(),behavior:new PatientBehavior(config.seed,f.id,f.profile),tactics:new CombatTactics(config.seed,f.id),escape:new EscapeState(config.seed,f.id),perception:new PatientPerception(config.seed,f.id),route:new RouteState(),lastHitTick:0,terrainOnly:false,physicsPose:[]};
    }).sort((a,b)=>a.id-b.id);
    const navigation=new ArenaNavigation(config.walls);
    if(actors.some(a=>!navigation.clear(a,a,.50)))throw new RangeError('Fighter starts inside arena wall clearance');
    this.navigation=navigation;
    this.actors = actors;
    this.mounds=[];
    this.tick = 0;
    this.rng = config.seed;
    this.oilRng=(config.seed^0x9e3779b9)>>>0;this.oilMarks=[];this.nextMark=0;
    this.combat=config.combatEnabled===true;this.expandedStrikes=this.combat&&config.expandedStrikes===true;this.tacticalCombat=this.combat&&config.tacticalCombat===true;this.escapeCombat=this.tacticalCombat&&config.escapeCombat===true;this.perceptionCombat=this.tacticalCombat&&config.perceptionCombat===true;this.fightEnded=false;this.winnerId=null;
    this.fracture = !this.combat&&config.labContactFracture === true;
    this.dynamicBalance=config.labDynamicBalance===true;
    this.episodes.reset();this.events=[];this.hitCount=0;this.detachedCount=0;
    this.collisionStats = {tests:0,contacts:0,wallContacts:0};
    this.ready = true;
    for(const a of this.actors)a.gait.advance([a.x,a.y,a.z],a.yaw,0,0,()=>a.baseY,mobilityFor(a.segments),a.segments);
  }

  private actorPose(a:Actor):readonly RigPose[]{
    if(a.fixed)return a.physicsPose;
    const pose=a.gait.pose(a.id,[a.x,a.y,a.z],a.yaw,this.tick*FIXED_DT).filter(p=>a.segments.includes(p.id));
    const strike=a.strike.punch;return strike&&!a.knockdown.blocked?punchPose(pose,strike,this.tick,(x,z)=>a.baseY+terrainHeight(x,z,this.mounds)):pose;
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
    a.fixed=true;a.speed=0;a.physicsPose=pose;a.health.finish(cause);a.tactics.setMode('inactive');a.escape.clear();a.perception.clear();a.route.clear();a.impact.clear();a.oil.clear();a.strike.advance(this.tick,false,a.segments);
    const source=this.actors.find(b=>b.id===attackerId&&b.id!==a.id);
    let dx=source?a.x-source.x:-Math.sin(a.yaw),dz=source?a.z-source.z:Math.cos(a.yaw);
    if(Math.hypot(dx,dz)<1e-6){dx=-Math.sin(a.yaw);dz=Math.cos(a.yaw);}
    const n=Math.hypot(dx,dz)||1;
    this.events.push({tick:this.tick,type:'fighter-incapacitated',fighterId,cause,fallDirection:[dx/n,0,dz/n],bodyPose:this.copyPose(pose)});
    return true;
  }
  private detach(a:Actor,ids:readonly string[],product=false):void{
    const active=ids.filter(id=>a.segments.includes(id));
    if(!active.length)return;
    const pose=this.actorPose(a),byId=new Map(pose.map(p=>[p.id,p]));
    const parts=this.copyPose(active.flatMap(id=>{const p=byId.get(id);return p?[p]:[];}));
    const removed=new Set(active);
    a.segments=a.segments.filter(id=>!removed.has(id));a.health.detach(active);this.detachedCount+=active.length;
    if(product)a.oil.cut(active[0]!,active,a.segments,this.tick,()=>this.oilRandom());
    // A single cut creates a single physical branch, not one body per bone.
    this.events.push({tick:this.tick,type:'segment-detached',fighterId:a.id,segmentId:active[0]!,detachedParts:parts});
  }
  /** Validated contact from a future strike resolver, or explicit lab test.
   * Plain collision overlaps never invoke this product damage path. */
  applyDamage(request:DamageRequest):boolean{
    this.requireReady();
    const {fighterId,segmentId,amount,attackerId}=request;
    if(!Number.isFinite(amount)||amount<=0)throw new RangeError('Invalid damage');
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
    this.detach(a,result.detached,true);
    if(result.cause)this.incapacitate(a.id,result.cause,attackerId);
    else{
      const source=this.actors.find(v=>v.id===attackerId&&v.id!==a.id);
      let dx=source?a.x-source.x:-Math.sin(a.yaw),dz=source?a.z-source.z:Math.cos(a.yaw);
      if(Math.hypot(dx,dz)<1e-8){dx=-Math.sin(a.yaw);dz=Math.cos(a.yaw);}
      a.impact.hit(segmentId,dx,dz);
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
      const failed=a.oil.advance(this.tick,a.segments,()=>this.actorPose(a),()=>this.oilRandom(),(segmentId,origin)=>{
        const point:[number,number,number]=[origin[0],a.baseY+terrainHeight(origin[0],origin[2],this.mounds),origin[2]];
        this.oilMarks.push({id:this.nextMark++,fighterId:a.id,point,tick:this.tick});
        if(this.oilMarks.length>OIL.limit)this.oilMarks.shift();
        this.events.push({tick:this.tick,type:'oil-drop',fighterId:a.id,segmentId,point:[...point]});
      });
      if(failed)this.incapacitate(a.id,'oil-loss');
    }
  }
  private random(): number {
    // Mulberry32; seed zero is valid.
    this.rng = (this.rng + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.rng ^ (this.rng >>> 15), 1 | this.rng);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private routeHeading(a:Actor,goal:PointXZ):number{
    const p=this.navigation.walls.length?a.route.waypoint(this.navigation,a,goal,this.tick):goal;
    return wrap(Math.atan2(p.x-a.x,-(p.z-a.z))-a.yaw);
  }
  private planCombat(commands:Map<number,FighterCommand>):void{
    // Shared pre-intent pose snapshot avoids an order-dependent view of newly started strikes.
    const vision=this.perceptionCombat?new Map(this.actors.filter(a=>!a.fixed).map(a=>[a.id,{id:a.id,x:a.x,z:a.z,yaw:a.yaw,parts:this.actorPose(a)} satisfies VisionBody])):null;
    for(const a of this.actors){
      const mobility=mobilityFor(a.segments),prone=this.expandedStrikes&&mobility.prone&&a.gait.posture==='prone';
      const allowed=!a.fixed&&!a.knockdown.blocked&&!this.fightEnded&&((!mobility.prone&&a.gait.posture==='upright')||prone);
      const compatible=!a.strike.punch||!!a.strike.punch.prone===prone;
      a.strike.advance(this.tick,allowed&&compatible,a.segments);
      if(a.fixed){a.tactics.setMode('inactive');continue;}
      const command=commands.get(a.id);
      if(this.fightEnded){a.tactics.setMode('inactive');a.perception.clear();a.route.clear();commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});continue;}
      const opponents=this.actors.filter(b=>b!==a&&!b.fixed);
      const distanceTo=(b:Actor)=>Math.hypot(b.x-a.x,b.z-a.z);
      const previousTarget=a.tactics.snapshot().targetId;
      const sensing=vision!==null&&!command;
      const visible=sensing?opponents.filter(b=>notices(vision!.get(a.id)!,vision!.get(b.id)!,a.perception.gaze(a.yaw),(from,to)=>sightClear(from,to,this.navigation.walls))):opponents;
      const visibleIds=visible.map(b=>b.id);
      if(sensing)a.perception.setVisible(visibleIds);
      const locked=a.strike.punch?.targetId;
      const candidates=sensing?opponents.filter(b=>visibleIds.includes(b.id)||b.id===locked):opponents;
      const chosen=this.tacticalCombat&&!command?a.tactics.choose(this.tick,candidates.map(b=>({id:b.id,distance:distanceTo(b)})),locked,opponents.map(b=>b.id)):null;
      const target=this.tacticalCombat&&!command
        ?opponents.find(b=>b.id===chosen)
        :opponents.sort((b,c)=>distanceTo(b)-distanceTo(c)||b.id-c.id)[0];
      if(!target){
        a.escape.clear();
        if(sensing&&!this.fightEnded&&opponents.length&&!a.strike.punch){
          const remembered=a.perception.recalled(this.tick,a,opponents.map(b=>b.id)),goal=remembered?.point??a.perception.patrol(this.tick,a);
          a.perception.advanceLook(a.yaw,a,remembered?.point??null);
          a.tactics.setMode(remembered?'memory':'search');
          const heading=this.routeHeading(a,goal);
          commands.set(a.id,{fighterId:a.id,forward:Math.max(0,Math.cos(heading)),turn:clamp(heading*2,-1,1),sprint:false});
        }else{a.tactics.setMode('search');if(!command)commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});}
        continue;
      }
      const seen=!sensing||visibleIds.includes(target.id);
      if(sensing){
        if(seen)a.perception.remember(target.id,target,this.tick);
        const look=seen?target:a.perception.recalled(this.tick,a,opponents.map(b=>b.id))?.point??null;
        a.perception.advanceLook(a.yaw,a,look);
      }
      if(this.tacticalCombat&&!command&&previousTarget!==target.id)this.events.push({tick:this.tick,type:'combat-target',fighterId:a.id,targetId:target.id});
      a.behavior.notice(target.id,this.tick);
      const dx=target.x-a.x,dz=target.z-a.z,distance=Math.hypot(dx,dz),turn=wrap(Math.atan2(dx,-dz)-a.yaw);
      const unobstructed=this.navigation.clear(a,target,.0),heading=(!command&&this.navigation.walls.length&&!a.strike.punch)?this.routeHeading(a,target):turn;
      const retreat=this.tacticalCombat&&!command&&!a.strike.punch&&!mobility.prone&&mobility.mode==='biped'&&a.tactics.retreating(this.tick)&&unobstructed&&distance<1.6&&Math.abs(a.x)<5.1&&Math.abs(a.z)<5.1;
      a.tactics.setMode(retreat?'retreat':'pursuit');
      if(!command)commands.set(a.id,{fighterId:a.id,forward:retreat?(Math.abs(turn)<.8?-.65:0):pursuitForward(distance,heading,a.behavior.traits.pursuit),turn:clamp((retreat?turn:heading)*2,-1,1),sprint:false});
      // Port of v1 anti-stuck and pincer behavior, opt-in for arena.
      // Pincer uses a body-heading approximation of the original vision;
      // full head scanning and occlusion belong to the perception step.
      if(this.escapeCombat&&!command&&seen){
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
          commands.set(a.id,{fighterId:a.id,forward:Math.max(0,Math.cos(heading))*ESCAPE.fleeSpeed/MOVEMENT.sprintSpeed,turn:clamp(heading*2,-1,1),sprint:true});
          continue;
        }
      }
      // Prone rigs extend almost a metre in front of their pelvis. Two
      // touching heads can leave the pelvis roots more than two metres apart.
      // This is only a broad phase; each source still has to pass IK/contact.
      const groundedPair=this.expandedStrikes&&(prone||target.gait.posture==='prone');
      const previewRange=groundedPair?2.65:this.expandedStrikes?1.05:.82;
      let checkedStrikeGeometry=false;
      if(unobstructed&&seen&&allowed&&!retreat&&!a.impact.active&&(command?.attack??!command)&&Math.abs(turn)<.65&&distance<previewRange&&a.strike.ready(this.tick)&&(!!command||a.behavior.ready(this.tick))){
        checkedStrikeGeometry=true;
        const pose=this.actorPose(a),victim=this.actorPose(target),eligible=(id:string)=>target.health.canDamage(id,this.tick);
        const ground=(x:number,z:number)=>a.baseY+terrainHeight(x,z,this.mounds);
        const order:StrikeKind[]=this.expandedStrikes?(command?.attackKind?[command.attackKind]:['arm','leg','head']):['arm'];
        if(this.expandedStrikes&&!command&&order.length>1){const shift=(a.strike.attempts+a.id)%order.length;order.push(...order.splice(0,shift));}
        for(const kind of order){
          if(kind==='leg'&&(prone||a.gait.footStates.some(f=>f.moving)||Math.abs(a.speed)>.10))continue;
          const best=prone&&kind!=='leg'?chooseProneStrike(pose,a.segments,victim,a.yaw,eligible,kind,ground,a.strike.attempts+a.id):kind==='arm'?choosePunch(pose,a.segments,victim,a.yaw,eligible,a.strike.attempts+a.id):chooseExtra(pose,a.segments,victim,a.yaw,eligible,kind,ground);
          if(best&&a.strike.start(this.tick,best.side,target.id,best.aim,a.yaw,best.id,kind,prone)){
            a.behavior.started(this.tick,Math.ceil(STRIKE.cooldown/FIXED_DT-1e-9));
            this.events.push({tick:this.tick,type:'combat-windup',fighterId:a.id,targetId:target.id,segmentId:strikeSource(kind,best.side),strikeKind:kind,proneStrike:prone});break;
          }
        }
      }
      // v1 close-range fallback: a root gap below standoff does not mean
      // an actual healthy capsule is reachable by any usable strike.
      // Move a little closer only after the existing IK/swept preview failed;
      // blocked roots can then participate in the anti-stuck logic.
      if(!command&&checkedStrikeGeometry&&!a.strike.punch&&!mobility.prone&&distance<=CLOSE_STANDOFF){
        const old=commands.get(a.id)!;
        commands.set(a.id,{...old,forward:pursuitForward(distance,heading,a.behavior.traits.pursuit,true)});
      }
      const punch=a.strike.punch;
      if(punch){
        a.tactics.setMode('strike');
        const victim=this.actors.find(b=>b.id===punch.targetId&&!b.fixed);
        const windup=a.strike.phase(this.tick)==='windup';
        if(windup&&victim&&punch.targetSegment&&(!sensing||visibleIds.includes(victim.id))){
          const part=this.actorPose(victim).find(p=>p.id===punch.targetSegment);
          const shoulder=this.actorPose(a).find(p=>p.id===strikeOrigin(punch.kind??'arm',punch.side));
          if(part&&shoulder)a.strike.track(this.tick,closestAim(shoulder.a,part));
        }
        const gap=victim?Math.hypot(victim.x-a.x,victim.z-a.z):0;
        commands.set(a.id,{fighterId:a.id,forward:!punch.prone&&windup&&!command&&(!sensing||visibleIds.includes(punch.targetId))&&gap>.60&&(punch.kind??'arm')==='arm'?.55:0,turn:0,sprint:false});
      }
    }
  }
  private resolveStrikes(previous:Map<number,readonly RigPose[]>):void{
    const current=new Map(this.actors.filter(a=>!a.fixed).map(a=>[a.id,this.actorPose(a)]));
    const requests:DamageRequest[]=[];
    // Capture all contacts before mutating anatomy or incapacitating either fighter.
    for(const a of this.actors){
      const p=a.strike.punch;if(a.fixed||!p||a.strike.resolved||a.strike.phase(this.tick)!=='thrust'||(p.prone?a.gait.posture!=='prone':a.gait.posture!=='upright'))continue;
      const b=this.actors.find(v=>v.id===p.targetId&&!v.fixed);
      const a0=previous.get(a.id),a1=current.get(a.id),b0=b&&previous.get(b.id),b1=b&&current.get(b.id);
      if(!b||!a0||!a1||!b0||!b1||!this.navigation.clear(a,b))continue;
      const id=firstStrikeContact(a0,a1,b0,b1,p.side,p.kind??'arm');
      if(id){a.strike.resolve();this.events.push({tick:this.tick,type:'strike-contact',fighterId:b.id,attackerId:a.id,segmentId:id,sourceSegment:strikeSource(p.kind??'arm',p.side),strikeKind:p.kind??'arm',proneStrike:!!p.prone});requests.push({fighterId:b.id,segmentId:id,attackerId:a.id,amount:b.health.canDamage(id,this.tick)?a.behavior.damage():1});}
    }
    for(const request of requests)this.applyDamage(request);
  }
  private finishFight():void{
    if(this.fightEnded||this.actors.length<2)return;
    const active=this.actors.filter(a=>!a.fixed);
    if(active.length>1)return;
    this.fightEnded=true;this.winnerId=active[0]?.id??null;
    for(const a of this.actors)a.strike.advance(this.tick,false,a.segments);
    this.events.push({tick:this.tick,type:'fight-ended',fighterId:this.winnerId??0});
  }
  step(dt: number, input: InputFrame): void {
    this.requireReady();
    if (dt !== FIXED_DT) throw new RangeError('Lab requires exactly 1/60 s');
    const commands = new Map<number,FighterCommand>();
    for (const c of input.commands) {
      if (commands.has(c.fighterId) || !this.actors.some(a=>a.id===c.fighterId) ||
          !Number.isFinite(c.forward) || Math.abs(c.forward)>1 ||
          !Number.isFinite(c.turn) || Math.abs(c.turn)>1 || typeof c.sprint !== 'boolean'||(c.attack!==undefined&&typeof c.attack!=='boolean')||(c.attackKind!==undefined&&!['arm','leg','head'].includes(c.attackKind)))
        throw new RangeError('Invalid or duplicate command');
      commands.set(c.fighterId,c);
    }
    const automatic=this.escapeCombat?new Set(this.actors.filter(a=>!commands.has(a.id)).map(a=>a.id)):null;
    const escapeStart=automatic?new Map(this.actors.map(a=>[a.id,[a.x,a.z] as const])):null;
    if(this.combat)this.planCombat(commands);
    const previous=this.combat&&!this.fightEnded?new Map(this.actors.filter(a=>!a.fixed).map(a=>[a.id,this.actorPose(a)])):null;
    for (const a of this.actors) {
      if(a.fixed)continue;
      const c = commands.get(a.id);
      let target = 0;
      const mobility=mobilityFor(a.segments);
      const previousPhase=a.knockdown.phase;
      a.knockdown.advance(dt,!mobility.prone);
      if(previousPhase!=='standing'&&a.knockdown.phase==='standing'&&!mobility.prone)this.events.push({tick:this.tick+1,type:'fighter-recovered',fighterId:a.id});
      const flinch=a.impact.slow,recoil=a.impact.advance(dt);
      if(a.knockdown.blocked){
        a.speed=0;
        const ground=(x:number,z:number)=>a.baseY+terrainHeight(x,z,this.mounds);
        a.y+=clamp(ground(a.x,a.z)-a.y,-.9*dt,.9*dt);
        a.gait.advance([a.x,a.y,a.z],a.yaw,0,dt,ground,mobility,a.segments,a.knockdown.amount);
        continue;
      }
      if (c || a.id === 0) {
        a.yaw += (c?.turn ?? 0) * 2.15 * dt*flinch*a.behavior.traits.turnMultiplier;
        target = (c?.forward ?? 0) * (c?.sprint && mobility.canSprint ? MOVEMENT.sprintSpeed : MOVEMENT.walkSpeed);
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
      target*=mobility.speedScale*flinch*a.behavior.traits.movementMultiplier;
      a.speed = mobility.mode==='unsupported'||a.strike.punch?.kind==='leg'||a.strike.punch?.prone?0:damp(a.speed,target,3);
      const ground=(x:number,z:number)=>a.baseY+terrainHeight(x,z,this.mounds);
      const travel=a.strike.punch?.prone?0:a.gait.travel(dt,a.speed,mobility,a.id,[a.x,a.y,a.z],a.yaw,this.tick*FIXED_DT,ground);
      const oldX=a.x,oldZ=a.z;
      a.x = clamp(a.x+Math.sin(a.yaw)*travel+recoil[0],-5.65,5.65);
      a.z = clamp(a.z-Math.cos(a.yaw)*travel+recoil[2],-5.65,5.65);
      if(this.navigation.walls.length){const p=this.navigation.move({x:oldX,z:oldZ},a);a.x=p.x;a.z=p.z;}
      a.y+=clamp(ground(a.x,a.z)-a.y,-.9*dt,.9*dt);
      const actualSpeed=mobility.mode==='biped'?((a.x-oldX)*Math.sin(a.yaw)-(a.z-oldZ)*Math.cos(a.yaw))/dt:a.speed;
      a.gait.advance([a.x,a.y,a.z],a.yaw,actualSpeed,dt,ground,mobility,a.segments,undefined,a.strike.punch?.kind==='leg');
    }
    this.tick++;
    if(previous)this.resolveStrikes(previous);
    const hits:SegmentContact[] = [];
    const before=this.dynamicBalance?this.actors.map(a=>[a.x,a.z] as const):[];
    this.collisionStats = resolveCollisions(this.actors.filter(a=>!a.terrainOnly),a=>this.actorPose(a),this.fracture?hits:undefined,this.combat,this.navigation.walls.length?(a,x,z)=>this.navigation.move(a,{x,z}):undefined);
    if(this.dynamicBalance)for(let i=0;i<this.actors.length;i++){
      const a=this.actors[i]!,old=before[i]!,displacement=Math.hypot(a.x-old[0],a.z-old[1]),mobility=mobilityFor(a.segments);
      if(a.fixed||displacement<KNOCKDOWN.softDisplacement||a.knockdown.blocked||mobility.prone||a.gait.hopHeight>.025)continue;
      const parts=a.gait.pose(a.id,[a.x,a.y,a.z],a.yaw,this.tick*FIXED_DT).filter(p=>a.segments.includes(p.id));
      const support=analyzeSupport(parts,(x,z)=>a.baseY+terrainHeight(x,z,this.mounds));
      if(a.knockdown.observe(displacement,support.margin,true)){
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
      const eligible=!a.fixed&&!a.knockdown.blocked&&!a.impact.active&&!a.strike.punch&&mobilityFor(a.segments).mode==='biped'&&mode==='pursuit';
      const wantsMove=!!c&&Math.abs(c.forward)>.16;
      a.escape.observe(Math.hypot(a.x-old[0],a.z-old[1]),wantsMove,!wantsMove&&!!c&&Math.abs(c.turn)<.2&&this.tick-a.lastHitTick>120,eligible);
    }
    // v1 game/loop.js stops round damage and oil-loss deadlines after
    // the result, while presentation/physical settling can continue.
    if(!this.fightEnded){this.updateOil();if(this.combat)this.finishFight();}
  }

  getSnapshot(): WorldSnapshot {
    this.requireReady();
    const fighterIds = new Uint32Array(this.actors.length);
    const roots = new Float32Array(this.actors.length*4);
    this.actors.forEach((a,i)=>{
      fighterIds[i]=a.id;
      roots.set([a.x,a.y,a.z,a.yaw],i*4);
    });
    const rigSegments=this.actors.map(a=>this.copyPose(this.actorPose(a)));
    const supports=rigSegments.map((parts,i)=>analyzeSupport(parts,(x,z)=>this.actors[i]!.baseY+terrainHeight(x,z,this.mounds)));
    return {tick:this.tick,elapsedSeconds:this.tick*FIXED_DT,fighterIds,roots,
      segmentIds:this.actors.map(a=>Object.freeze([...a.segments])),
      mobilityModes:this.actors.map(a=>mobilityFor(a.segments).mode),
      postures:this.actors.map(a=>a.gait.posture),
      bodyTerrainStates:this.actors.map(a=>a.terrainOnly),
      oil:this.actors.map(a=>a.oil.snapshot()),oilMarks:this.oilMarks.map(m=>({...m,point:[...m.point]})),impacts:this.actors.map(a=>a.impact.snapshot()),
      routes:this.actors.map(a=>a.route.snapshot()),
      perception:this.actors.map(a=>a.perception.snapshot(a.yaw)),
      escapes:this.actors.map(a=>a.escape.snapshot()),
      tactics:this.actors.map(a=>a.tactics.snapshot()),
      patientTraits:this.actors.map(a=>a.behavior.snapshot()),
      strikes:this.actors.map(a=>a.strike.snapshot(this.tick)),fight:{ended:this.fightEnded,winnerId:this.winnerId},
      health:this.actors.map(a=>a.health.snapshot()),
      lifeStates:this.actors.map(a=>a.fixed?'incapacitated':'active'),
      balanceStates:this.actors.map(a=>a.knockdown.phase),
      stepCounts:this.actors.map(a=>a.gait.stepCount),footStates:this.actors.map(a=>a.gait.footStates),
      hopHeights:this.actors.map(a=>a.gait.hopHeight),hopPhases:this.actors.map(a=>a.gait.hopPhase),
      damageStats:{hits:this.hitCount,detached:this.detachedCount}, collisionStats:{...this.collisionStats}, rigVersion:2, rigSegments,supports,crawlAnchors:rigSegments.map((parts,i)=>this.actors[i]!.fixed?[]:this.actors[i]!.gait.crawlAnchors(parts)),residualTraction:rigSegments.map((parts,i)=>this.actors[i]!.fixed?null:this.actors[i]!.gait.residualSupport(parts))};
  }
  drainEvents(): readonly SimulationEvent[] { this.requireReady(); const events=this.events;this.events=[];return events; }
  dispose(): void { this.ready=false; this.mounds=[]; this.actors=[]; this.tick=0; this.rng=0;this.oilMarks=[];this.events=[];this.episodes.reset(); }
  private requireReady(): void { if (!this.ready) throw new Error('Simulation core is not initialized'); }
}
