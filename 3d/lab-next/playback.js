import {FIXED_DT} from '../core/dist/fixed-clock.js';
/** Presentation time only: the physics callback always receives FIXED_DT. */
export class Playback {
 rate=1;
 paused=false;
 pending=0;
 constructor(clock){this.clock=clock;}
 setRate(rate){
  if(![.25,.5,1].includes(rate))throw new RangeError('Unsupported playback rate');
  this.rate=rate;
 }
 setPaused(value){this.paused=!!value;this.pending=0;this.clock.reset();}
 requestStep(){if(this.paused)this.pending=Math.min(6,this.pending+1);}
 reset(){this.pending=0;this.clock.reset();}
 advance(elapsed,step,hidden=false){
  if(hidden){this.pending=0;return 0;}
  if(!this.paused)return this.clock.advance(elapsed*this.rate,step);
  const count=this.pending;this.pending=0;
  for(let i=0;i<count;i++)step(FIXED_DT);
  return count;
 }
 get alpha(){return this.paused?1:this.clock.alpha;}
}
