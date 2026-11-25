import { choosePunch,closestAim } from './combat/punch-choice.js';
import { StrikeState,punchPose } from './combat/strike.js';
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
  segments: string[]; gait: PatientGait; knockdown:Knockdown; fixed:boolean; health:DamageState; impact:ImpactState; oil:OilState; strike:StrikeState; terrainOnly:boolean; physicsPose:readonly RigPose[];
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
  private combat=false;private fightEnded=false;private winnerId:number|null=null;
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
        wanderAngle:f.yawRad,wanderSpeed:.35,segments:expandLegacyTorso(f.segmentIds),gait:new PatientGait(f.origin,f.yawRad),knockdown:new Knockdown(),fixed:false,health:new DamageState(expandLegacyTorso(f.segmentIds)),impact:new ImpactState(),oil:new OilState(),strike:new StrikeState(),terrainOnly:false,physicsPose:[]};
    }).sort((a,b)=>a.id-b.id);
    this.actors = actors;
    this.mounds=[];
    this.tick = 0;
    this.rng = config.seed;
    this.oilRng=(config.seed^0x9e3779b9)>>>0;this.oilMarks=[];this.nextMark=0;
    this.combat=config.combatEnabled===true;this.fightEnded=false;this.winnerId=null;
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
    const strike=a.strike.punch;return strike&&!a.knockdown.blocked?punchPose(pose,strike,this.tick):pose;
  }
  private copyPose(parts:readonly PhysicsSegmentPose[]):readonly RigPose[]{
    return parts.map(p=>({id:p.id,a:[...p.a],b:[...p.b],radius:p.radius}));
  }
  /** Terminal handoff, used by lab and future damage resolver. An intact
   * anatomy stays intact; incapacitation is not a detachment event. */
  incapacitate(fighterId:number,cause:IncapacitationCause='manual',attackerId?:number):boolean{
    this.requireReady();const a=this.actors.find(a=>a.id===fighterId);
    if(!a)throw new RangeError('Unknown fighter');
    if(a.fixed)return false;
    const pose=this.copyPose(this.actorPose(a));
    a.fixed=true;a.speed=0;a.physicsPose=pose;a.health.finish(cause);a.impact.clear();a.oil.clear();a.strike.advance(this.tick,false,a.segments);
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
    if(a.fixed||!a.segments.includes(segmentId))return false;
    const result=a.health.apply(segmentId,amount,this.tick);
    if(!result)return false;
    this.hitCount++;
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

  private planCombat(commands:Map<number,FighterCommand>):void{
    for(const a of this.actors){
      const allowed=!a.fixed&&!a.knockdown.blocked&&a.gait.posture==='upright'&&!this.fightEnded;
      a.strike.advance(this.tick,allowed,a.segments);
      if(a.fixed)continue;
      const command=commands.get(a.id);
      if(this.fightEnded){commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});continue;}
      const target=this.actors.filter(b=>b!==a&&!b.fixed).sort((b,c)=>Math.hypot(b.x-a.x,b.z-a.z)-Math.hypot(c.x-a.x,c.z-a.z)||b.id-c.id)[0];
      if(!target){if(!command)commands.set(a.id,{fighterId:a.id,forward:0,turn:0,sprint:false});continue;}
      const dx=target.x-a.x,dz=target.z-a.z,distance=Math.hypot(dx,dz),turn=wrap(Math.atan2(dx,-dz)-a.yaw);
      if(!command)commands.set(a.id,{fighterId:a.id,forward:distance>.46?Math.max(0,Math.cos(turn)):0,turn:clamp(turn*2,-1,1),sprint:false});
      if(allowed&&!a.impact.active&&(command?.attack??!command)&&Math.abs(turn)<.65&&distance<.82&&a.strike.ready(this.tick)){
        const best=choosePunch(this.actorPose(a),a.segments,this.actorPose(target),a.yaw,id=>target.health.canDamage(id,this.tick),a.strike.attempts+a.id);
        if(best&&a.strike.start(this.tick,best.side,target.id,best.aim,a.yaw,best.id))this.events.push({tick:this.tick,type:'combat-windup',fighterId:a.id,targetId:target.id,segmentId:best.side+'.lowerArm'});
      }
      const punch=a.strike.punch;
      if(punch){
        const victim=this.actors.find(b=>b.id===punch.targetId&&!b.fixed);
        const windup=a.strike.phase(this.tick)==='windup';
        if(windup&&victim&&punch.targetSegment){
          const part=this.actorPose(victim).find(p=>p.id===punch.targetSegment);
          const shoulder=this.actorPose(a).find(p=>p.id===punch.side+'.upperArm');
          if(part&&shoulder)a.strike.track(this.tick,closestAim(shoulder.a,part));
        }
        const gap=victim?Math.hypot(victim.x-a.x,victim.z-a.z):0;
        commands.set(a.id,{fighterId:a.id,forward:windup&&!command&&gap>.60?.55:0,turn:0,sprint:false});
      }
    }
  }
  private resolveStrikes(previous:Map<number,readonly RigPose[]>):void{
    const current=new Map(this.actors.filter(a=>!a.fixed).map(a=>[a.id,this.actorPose(a)]));
    const requests:DamageRequest[]=[];
    // Capture all contacts before mutating anatomy or incapacitating either fighter.
    for(const a of this.actors){
      const p=a.strike.punch;if(a.fixed||!p||a.strike.resolved||a.strike.phase(this.tick)!=='thrust')continue;
      const b=this.actors.find(v=>v.id===p.targetId&&!v.fixed);
      const a0=previous.get(a.id),a1=current.get(a.id),b0=b&&previous.get(b.id),b1=b&&current.get(b.id);
      if(!b||!a0||!a1||!b0||!b1)continue;
      const id=firstStrikeContact(a0,a1,b0,b1,p.side);
      if(id){a.strike.resolve();requests.push({fighterId:b.id,segmentId:id,attackerId:a.id,amount:1});}
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
          !Number.isFinite(c.turn) || Math.abs(c.turn)>1 || typeof c.sprint !== 'boolean'||(c.attack!==undefined&&typeof c.attack!=='boolean'))
        throw new RangeError('Invalid or duplicate command');
      commands.set(c.fighterId,c);
    }
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
        a.yaw += (c?.turn ?? 0) * 2.15 * dt*flinch;
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
        a.yaw += clamp(wrap(a.wanderAngle-a.yaw),-1.1*dt,1.1*dt)*flinch;
        target = a.wanderSpeed;
      }
      target*=mobility.speedScale*flinch;
      a.speed = mobility.mode==='unsupported'?0:damp(a.speed,target,3);
      const ground=(x:number,z:number)=>a.baseY+terrainHeight(x,z,this.mounds);
      const travel=a.gait.travel(dt,a.speed,mobility,a.id,[a.x,a.y,a.z],a.yaw,this.tick*FIXED_DT,ground);
      const oldX=a.x,oldZ=a.z;
      a.x = clamp(a.x+Math.sin(a.yaw)*travel+recoil[0],-5.65,5.65);
      a.z = clamp(a.z-Math.cos(a.yaw)*travel+recoil[2],-5.65,5.65);
      a.y+=clamp(ground(a.x,a.z)-a.y,-.9*dt,.9*dt);
      const actualSpeed=mobility.mode==='biped'?((a.x-oldX)*Math.sin(a.yaw)-(a.z-oldZ)*Math.cos(a.yaw))/dt:a.speed;
      a.gait.advance([a.x,a.y,a.z],a.yaw,actualSpeed,dt,ground,mobility,a.segments);
    }
    this.tick++;
    if(previous)this.resolveStrikes(previous);
    const hits:SegmentContact[] = [];
    const before=this.dynamicBalance?this.actors.map(a=>[a.x,a.z] as const):[];
    this.collisionStats = resolveCollisions(this.actors.filter(a=>!a.terrainOnly),a=>this.actorPose(a),this.fracture?hits:undefined,this.combat);
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
    this.updateOil();if(this.combat)this.finishFight();
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
