import { MOVEMENT } from './movement-timing.js';
const smooth=(q:number)=>q*q*(3-2*q);
export interface HopSample { readonly distance:number; readonly lift:number; readonly phase:'idle'|'flight'|'pause'; readonly followsRoot:boolean }
/** Fixed-step, continuous phase boundaries; finishes an already launched hop
 * even if input is released. Horizontal displacement uses v1's smooth curve. */
export class HopCycle {
 private age=0;private travel=0;private running=false;
 reset():void{this.age=0;this.travel=0;this.running=false;}
 advance(dt:number,speed:number):HopSample{
  const flight=MOVEMENT.hopFlightSeconds,pause=MOVEMENT.hopPauseSeconds,cycle=flight+pause;
  let remaining=dt,distance=0,followsRoot=false;
  while(remaining>1e-10){
   if(!this.running){
    if(Math.abs(speed)<.03)break;
    this.running=true;this.age=0;
    this.travel=Math.sign(speed)*Math.min(MOVEMENT.hopMaxDistance,Math.abs(speed)*cycle);
   }
   const end=this.age<flight-1e-10?flight:cycle;
   const delta=Math.min(remaining,end-this.age);
   const a=Math.min(1,this.age/flight),b=Math.min(1,(this.age+delta)/flight);
   if(a<1){distance+=this.travel*(smooth(b)-smooth(a));followsRoot=true;}
   this.age+=delta;remaining-=delta;
   if(this.age>=cycle-1e-10){this.running=false;this.age=0;}
  }
  const phase=!this.running?'idle':this.age<flight-1e-10?'flight':'pause';
  const t=phase==='flight'?this.age:0;
  return {distance,lift:phase==='flight'?.5*MOVEMENT.gravity*t*(flight-t):0,phase,followsRoot};
 }
}
