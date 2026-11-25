import { FIXED_DT } from '../fixed-clock.js';
import { MOVEMENT } from '../rig/movement-timing.js';
// v1 movement calibration, same scale as movement-timing.ts.
const metres=(cm:number)=>cm*MOVEMENT.walkSpeed/(32*1.2);
const ticks=(s:number)=>Math.ceil(s/FIXED_DT-1e-9);
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export interface PointXZ {readonly x:number;readonly z:number}
/** Goal-footprint validity adapter. The original 2D AI rejected blocked escape endpoints. */
export type EscapeGoalClear=(goal:PointXZ)=>boolean;
const allGoalsClear:EscapeGoalClear=()=>true;
export interface EscapeActor extends PointXZ {readonly id:number;readonly yaw:number}
export interface EscapeOpponent extends EscapeActor {readonly armed:boolean;readonly attacking:boolean;readonly visible:boolean}
export interface EscapePlan {readonly mode:'relocate'|'pincer';readonly goal:PointXZ;readonly until:number}
const distance=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
const bearing=(a:PointXZ,b:PointXZ)=>Math.atan2(b.x-a.x,-(b.z-a.z));
const wall=5.65;
const goalAt=(a:PointXZ,dx:number,dz:number,length:number):PointXZ=>({x:clamp(a.x+dx*length,-wall,wall),z:clamp(a.z+dz*length,-wall,wall)});
const clearance=(p:PointXZ)=>wall-Math.max(Math.abs(p.x),Math.abs(p.z));
export const ESCAPE=Object.freeze({stuckSeconds:2.5,relocateSeconds:4,pincerMin:.9,pincerMax:1.6,pincerCooldownMin:7,pincerCooldownMax:11,fleeSpeed:MOVEMENT.walkSpeed*64/32,arrival:metres(25)});
/** Port src/systems/ai.js tacticalEscape direction/length ordering.
 * The current arena is convex. Static walkable cones are not blockers;
 * occupied destinations and the outer boundary are rejected. */
export function tacticalEscape(a:PointXZ,foe:PointXZ,side:number,occupied:readonly PointXZ[],goalClear:EscapeGoalClear=allGoalsClear):PointXZ|null{
 const d=distance(a,foe),nx=d>1e-8?(a.x-foe.x)/d:1,nz=d>1e-8?(a.z-foe.z)/d:0;
 const directions=[[-nz*side*.9+nx*.42,nx*side*.9+nz*.42],[nz*side*.9+nx*.42,-nx*side*.9+nz*.42],[nx,nz],[-nz,nx],[nz,-nx],[-nx*.35-nz*side,-nz*.35+nx*side]];
 for(const [dx,dz] of directions)for(const cm of [110,75,45]){
  const p=goalAt(a,dx!,dz!,metres(cm));
  if(distance(a,p)>ESCAPE.arrival&&goalClear(p)&&occupied.every(o=>distance(o,p)>=metres(35)))return p;
 }
 const p={x:a.x*.55,z:a.z*.55};
 return distance(a,p)>ESCAPE.arrival&&goalClear(p)&&occupied.every(o=>distance(o,p)>=metres(35))?p:null;
}
/** Two nearby visible armed opponents facing this patient, separated
 * by the original 1.15-radian threshold. 98 cm is the midpoint of
 * the original 92–104 cm range. */
export function pincerThreats(a:EscapeActor,opponents:readonly EscapeOpponent[]):readonly EscapeOpponent[]{
 const threats=opponents.filter(o=>o.armed&&o.visible&&distance(a,o)<metres(98)&&(o.attacking||Math.abs(wrap(bearing(o,a)-o.yaw))<=1.7)).sort((x,y)=>distance(a,x)-distance(a,y)||x.id-y.id).slice(0,2);
 return threats.length===2&&Math.abs(wrap(bearing(a,threats[0]!)-bearing(a,threats[1]!)))>1.15?threats:[];
}
export function pincerGoal(a:EscapeActor,threats:readonly EscapeOpponent[],side:number,occupied:readonly PointXZ[],goalClear:EscapeGoalClear=allGoalsClear):PointXZ|null{
 if(threats.length!==2)return null;
 let best:PointXZ|null=null,score=-Infinity;
 for(let i=0;i<12;i++){
  const angle=i*Math.PI/6+side*.17,p=goalAt(a,Math.cos(angle),Math.sin(angle),metres(90));
  if(distance(a,p)<ESCAPE.arrival||!goalClear(p)||occupied.some(o=>distance(p,o)<metres(26)))continue;
  const separation=Math.abs(wrap(bearing(p,threats[0]!)-bearing(p,threats[1]!)));
  const value=Math.min(...threats.map(o=>distance(o,p)))-separation*metres(52)-Math.max(0,metres(55)-clearance(p));
  if(value>score){score=value;best=p;}
 }
 return best;
}
export class EscapeState{
 private stationary=0;private plan:EscapePlan|null=null;private cooldown=0;private side=1;private rng:number;
 private relocationTarget:number|null=null;private pincerTargets:number[]=[];
 constructor(seed:number,id:number){this.rng=(seed^Math.imul(id+1,0x27d4eb2d)^0x165667b1)>>>0;}
 private random():number{this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
 private clearPlan():void{this.plan=null;this.relocationTarget=null;this.pincerTargets=[];}
 clear():void{this.stationary=0;this.clearPlan();}
 choose(tick:number,a:EscapeActor,foe:EscapeOpponent,opponents:readonly EscapeOpponent[],occupied:readonly PointXZ[],allowed:boolean,goalClear:EscapeGoalClear=allGoalsClear):EscapePlan|null{
  if(!allowed){this.clear();return null;}
  const threats=pincerThreats(a,opponents);
  const threatIds=threats.map(t=>t.id).sort((x,y)=>x-y);
  // An escape is a response to specific opponents, not a generic destination.
  // When a target dies or attention switches, do not spend the remainder of
  // the four-second manoeuvre running toward a stale goal.
  // A goal can become occupied after the manoeuvre begins. Recheck moving
  // patients each tick; static wall reachability remains checked at creation.
  const blockedGoal=this.plan&&occupied.some(o=>distance(o,this.plan!.goal)<metres(this.plan!.mode==='pincer'?26:35));
  if(this.plan&&(tick>=this.plan.until||distance(a,this.plan.goal)<ESCAPE.arrival||blockedGoal||
   (this.plan.mode==='relocate'&&this.relocationTarget!==foe.id)||
   (this.plan.mode==='pincer'&&(threatIds.length!==this.pincerTargets.length||
    threatIds.some((id,i)=>id!==this.pincerTargets[i])))))this.clearPlan();
  if(threats.length&&this.plan?.mode!=='pincer'&&tick>=this.cooldown){
   const goal=pincerGoal(a,threats,this.side,occupied,goalClear);
   if(goal){this.plan={mode:'pincer',goal,until:tick+ticks(.9+this.random()*.7)};this.relocationTarget=null;this.pincerTargets=threatIds;this.cooldown=tick+ticks(7+this.random()*4);this.stationary=0;}
  }
  if(!this.plan&&this.stationary>ticks(ESCAPE.stuckSeconds)){
   this.side*=-1;const goal=tacticalEscape(a,foe,this.side,occupied,goalClear);this.stationary=0;
   if(goal){this.plan={mode:'relocate',goal,until:tick+ticks(ESCAPE.relocateSeconds)};this.relocationTarget=foe.id;this.pincerTargets=[];}
  }
  return this.plan;
 }
 /** v1 game/loop.js accumulates blocked ticks, decays twice as fast
  * when moving. Observe final post-collision movement, not requested root. */
 observe(moved:number,wantsMove:boolean,holdingWithoutHit:boolean,eligible:boolean):void{
  if(!eligible||this.plan){this.stationary=0;return;}
  const blocked=wantsMove&&moved<metres(.09)||holdingWithoutHit;
  this.stationary=blocked?this.stationary+1:Math.max(0,this.stationary-2);
 }
 snapshot(){return {stationaryTicks:this.stationary,plan:this.plan?{...this.plan,goal:{...this.plan.goal}}:null};}
}
