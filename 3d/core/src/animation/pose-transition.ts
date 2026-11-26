export const EXPRESSION_SLOTS = ['stance','balance','hurt','jump','aggressive','stalk','freeze'] as const;
export type ExpressionSlot = typeof EXPRESSION_SLOTS[number];
const duration: Record<ExpressionSlot,number> = {stance:.45,balance:.30,hurt:.10,jump:.15,aggressive:.28,stalk:.38,freeze:.32};
const unit=(slot:ExpressionSlot):number[]=>EXPRESSION_SLOTS.map(s=>Number(s===slot));
/** Advance exactly once per simulation tick, never from a pose query.
 * Rebase interrupted transitions on their currently evaluated weights. */
export class PoseTransition {
 constructor(private readonly hurtDuration=duration.hurt){}
 private target:ExpressionSlot='stance';
 private start=unit('stance');
 private current=unit('stance');
 private elapsed=0;
 advance(slot:ExpressionSlot,dt:number):void{
  if(!Number.isFinite(dt)||dt<0)throw new RangeError('Invalid pose delta');
  if(slot!==this.target){this.start=[...this.current];this.target=slot;this.elapsed=0;}
  const seconds=slot==='hurt'?this.hurtDuration:duration[slot];
  this.elapsed=Math.min(seconds,this.elapsed+dt);
  const t=this.elapsed/seconds,w=t*t*(3-2*t);
  this.current=this.start.map((v,i)=>v+(Number(EXPRESSION_SLOTS[i]===slot)-v)*w);
 }
 get weights():readonly number[]{return [...this.current];}
}
