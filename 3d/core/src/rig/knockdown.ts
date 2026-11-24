/** Temporary lab reaction; not yet combat damage/trauma or a rigid-body solver.
 * The .52 s grounded hold uses the existing v1 reaction duration
 * (src/robot/anatomy.js). Fall and rise are native 3D timings. */
export const KNOCKDOWN=Object.freeze({fall:.65,hold:.52,rise:.85,cooldown:.60,
 softDisplacement:.065,hardDisplacement:.11,margin:-.025});
export type BalancePhase='standing'|'falling'|'down'|'rising';
export class Knockdown {
 private state:BalancePhase='standing';
 private age=0;private cooldown=0;
 get phase():BalancePhase{return this.state;}
 get blocked():boolean{return this.state!=='standing';}
 get amount():number|undefined{
  switch(this.state){
   case 'falling':return this.age/KNOCKDOWN.fall;
   case 'down':return 1;
   case 'rising':return 1-this.age/KNOCKDOWN.rise;
   default:return undefined;
  }
 }
 observe(displacement:number,margin:number|null,canStand:boolean):boolean{
  if(!canStand||this.blocked||this.cooldown>0)return false;
  if(displacement<KNOCKDOWN.hardDisplacement&&!(displacement>=KNOCKDOWN.softDisplacement&&(margin===null||margin<KNOCKDOWN.margin)))return false;
  this.state='falling';this.age=0;return true;
 }
 advance(dt:number,canStand:boolean):void{
  if(!canStand){this.state='standing';this.age=0;this.cooldown=0;return;}
  this.cooldown=Math.max(0,this.cooldown-dt);
  if(!this.blocked)return;
  this.age+=dt;
  const duration=this.state==='falling'?KNOCKDOWN.fall:this.state==='down'?KNOCKDOWN.hold:KNOCKDOWN.rise;
  if(this.age+1e-10<duration)return;
  this.age=0;
  if(this.state==='falling')this.state='down';
  else if(this.state==='down')this.state='rising';
  else{this.state='standing';this.cooldown=KNOCKDOWN.cooldown;}
 }
}
