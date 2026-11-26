/** Adapted from src/render/robot-skin.js. Simulation time, exact segment,
 * no inherited tint and no change to damage authority. */
export const HIT_TINT=.40,HIT_SECONDS=.30,CRIT_SECONDS=.48;
export function segmentTint(age,critical){
 if(!Number.isFinite(age)||age<0)return 0;
 return critical?Math.max(0,1-age/CRIT_SECONDS):age<HIT_SECONDS?HIT_TINT:0;
}
const key=(id,segment)=>id+':'+segment;
export class SegmentTints{
 constructor(){this.reset();}
 reset(){this.live=new Map();this.debris=new Map();}
 record(events,previousDebris,currentDebris,tick){
  for(const e of events)if(e.type==='fighter-damaged')this.live.set(key(e.fighterId,e.segmentId),{tick:e.tick,critical:e.critical===true});
  const prior=new Set(previousDebris.map(d=>d.id));
  for(const d of currentDebris){
   if(prior.has(d.id))continue;
   const hit=this.live.get(key(d.fighterId,d.segmentId));
   if(hit&&segmentTint((tick-hit.tick)/60,hit.critical)>0)this.debris.set(d.id,hit);
  }
  for(const map of [this.live,this.debris])for(const [id,h] of map)if((tick-h.tick)/60>= (h.critical?CRIT_SECONDS:HIT_SECONDS))map.delete(id);
 }
 sample(id,segment,tick,detached=false){
  const h=(detached?this.debris:this.live).get(detached?id:key(id,segment));
  return h?{strength:segmentTint((tick-h.tick)/60,h.critical),critical:h.critical}:{strength:0,critical:false};
 }
}
