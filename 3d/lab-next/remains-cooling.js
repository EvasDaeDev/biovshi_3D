import {FIXED_DT} from '../core/dist/fixed-clock.js';

export const COOLED_SATURATION=.40;
const LOSS=1-COOLED_SATURATION;
const DURATION_TICKS=2/FIXED_DT;
const archived=id=>typeof id==='string'&&id.startsWith('floor:v:');
const saturation=(tick,start)=>{
 if(start===undefined||tick<=start)return 1;
 if(tick>=start+DURATION_TICKS)return COOLED_SATURATION;
 const phase=(tick-start)/DURATION_TICKS;
 return 1-LOSS*phase*phase*(3-2*phase);
};

/** Record physical settling at fixed ticks, then sample at render time. */
export class RemainsCooling{
 constructor(){this.reset();}
 reset(){this.bodies=new Map();this.debris=new Map();}
 record(state,parts){
  for(let i=0;i<state.fighterIds.length;i++){
   const id=state.fighterIds[i];
   if(state.bodyTerrainStates[i]&&!this.bodies.has(id))this.bodies.set(id,state.tick);
  }
  for(const part of parts){
   if(part.settled&&!archived(part.id)&&!this.debris.has(part.id))this.debris.set(part.id,state.tick);
  }
 }
 body(id,tick){return saturation(tick,this.bodies.get(id));}
 part(id,tick){return archived(id)?COOLED_SATURATION:saturation(tick,this.debris.get(id));}
}
