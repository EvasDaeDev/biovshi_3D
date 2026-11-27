import { JUMP_HEIGHT_SCALE,MOVEMENT } from './movement-timing.js';
const smooth=(q:number)=>q*q*(3-2*q);
export interface HopSample { readonly distance:number; readonly lift:number; readonly phase:'idle'|'prepare'|'flight'|'pause';readonly crouch?:number; readonly followsRoot:boolean }
/** Fixed-step, continuous phase boundaries; finishes an already launched hop
 * even if input is released. A manual leap carries takeoff speed. */
export class HopCycle {
 private age=0;private travel=0;private running=false;private carry=false;
 constructor(private readonly preparation=0,private readonly flightTime:number=MOVEMENT.hopFlightSeconds,private readonly pauseTime:number=MOVEMENT.hopPauseSeconds,private readonly absorb=false,private readonly maxDistance=MOVEMENT.hopMaxDistance){}
 reset():void{this.age=0;this.travel=0;this.running=false;}
 advance(dt:number,speed:number,carryMomentum=false):HopSample{
  const flight=this.flightTime,pause=this.pauseTime,takeoff=this.preparation,landing=takeoff+flight,cycle=landing+pause;
  let remaining=dt,distance=0,followsRoot=false;
  while(remaining>1e-10){
   if(!this.running){
    if(Math.abs(speed)<.03)break;
    this.running=true;this.age=0;
    this.carry=carryMomentum;
    this.travel=this.carry?speed*flight:Math.sign(speed)*Math.min(this.maxDistance,Math.abs(speed)*cycle);
   }
   if(this.carry&&this.age<takeoff-1e-10)this.travel=speed*flight;
   const end=this.age<takeoff-1e-10?takeoff:this.age<landing-1e-10?landing:cycle;
   const delta=Math.min(remaining,end-this.age);
   const a=Math.max(0,Math.min(1,(this.age-takeoff)/flight)),b=Math.max(0,Math.min(1,(this.age+delta-takeoff)/flight));
   if(b>a){distance+=this.travel*(this.carry?b-a:smooth(b)-smooth(a));followsRoot=true;}
   this.age+=delta;remaining-=delta;
   if(this.age>=cycle-1e-10){this.running=false;this.age=0;}
  }
  const phase=!this.running?'idle':this.age<takeoff-1e-10?'prepare':this.age<landing-1e-10?'flight':'pause';
  const t=phase==='flight'?this.age-takeoff:0;
  let crouch=phase==='prepare'?.14*smooth(this.age/takeoff):phase==='flight'?.14*Math.max(0,1-t/.065):phase==='pause'&&takeoff>0?.06*Math.sin(Math.PI*Math.min(1,(this.age-landing)/pause)):0;
  if(this.absorb){
   // Anticipatory knee flexion; smooth extension through takeoff.
   // Match landing velocity at contact, then release with zero final
   // compression velocity. Only the body bends; feet remain on ground.
   if(phase==='flight')crouch=.14*(1-smooth(Math.min(1,t/.10)));
   if(phase==='pause'){const q=Math.max(0,Math.min(1,(this.age-landing)/pause));crouch=.5*MOVEMENT.gravity*JUMP_HEIGHT_SCALE*flight*pause*q*(1-q)**2;}
  }
  return {distance,crouch,lift:phase==='flight'?.5*MOVEMENT.gravity*JUMP_HEIGHT_SCALE*t*(flight-t):0,phase,followsRoot};
 }
}
