import type {StrikeKind} from './strike.js';
import type {PunchChoice} from './punch-choice.js';
import type {FightOpportunity} from './opportunity.js';
import type {PointXZ} from './escape.js';
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
/** Bounded memory of committed attempts. The bias is stable throughout an
 * evaluation, so additional previews cannot consume RNG or change a decision. */
export class FightVariety{
 private history:{kind:StrikeKind;contact:string;side:'L'|'R'}[]=[];
 private sequence=0;private orbitSide:1|-1;
 private orbitUntil=0;private orbitTarget:number|null=null;
 constructor(private readonly seed:number,private readonly id:number){this.orbitSide=((seed^id)&1)?1:-1;}
 private bias(kind:StrikeKind,c:PunchChoice):number{
  const key=kind+':'+c.side+':'+c.contactId;
  let h=(this.seed^Math.imul(this.id+1,0x85ebca6b)^Math.imul(this.sequence+1,0x9e3779b9))>>>0;
  for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619)>>>0;
  return ((h>>>8)/16777216-.5)*.16;
 }
 adjustment(kind:StrikeKind,c:PunchChoice):number{
  let penalty=0;
  this.history.forEach((p,i)=>{const recency=1-i*.18;
   if(p.kind===kind)penalty+=.10*recency;
   if(p.contact===c.contactId)penalty+=.13*recency;
   if(p.kind===kind&&p.side===c.side)penalty+=.05*recency;
  });
  return this.bias(kind,c)-Math.min(.52,penalty);
 }
 committed(kind:StrikeKind,c:PunchChoice):void{
  this.history.unshift({kind,contact:c.contactId,side:c.side});this.history.length=Math.min(4,this.history.length);this.sequence++;
  this.orbitUntil=0;this.orbitTarget=null;
 }
 /** During recovery, exploit a free lateral lane rather than repeatedly
  * walking into the same frontal guard. Never orbit instead of a ready
  * attack; navigation/occupied checks are supplied by the caller. */
 reposition(tick:number,targetId:number,here:PointXZ,target:PointXZ,context:FightOpportunity,ready:boolean,urgent:boolean,clear:(goal:PointXZ)=>boolean):PointXZ|null{
  if(ready||urgent||context.grounded||context.distance<.72||context.distance>1.8||Math.abs(context.facing)>1.25||context.temperament==='impulsive'){
   this.orbitUntil=0;this.orbitTarget=null;return null;
  }
  if(this.orbitTarget!==targetId||tick>=this.orbitUntil){
   this.orbitTarget=targetId;this.orbitUntil=tick+30;this.orbitSide=this.sequence%2===0?this.orbitSide:(this.orbitSide===1?-1:1);
  }
  const dx=here.x-target.x,dz=here.z-target.z,d=Math.hypot(dx,dz);if(d<1e-6)return null;
  const radius=clamp(d,.92,1.35);
  for(const sign of [this.orbitSide,-this.orbitSide]){
   const angle=sign*.48,c=Math.cos(angle),s=Math.sin(angle),goal={x:target.x+radius*(dx*c-dz*s)/d,z:target.z+radius*(dx*s+dz*c)/d};
   if(clear(goal)){this.orbitSide=sign>0?1:-1;return goal;}
  }
  return null;
 }
}
