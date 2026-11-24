import { severingChain, isProtectedSegment } from '../rig/anatomy.js';
export interface SegmentContact { readonly fighterId:number; readonly segmentId:string; readonly otherId:number }
interface Episode { lastSeen:number; lastHit:number }
export interface LabHit extends SegmentContact { readonly count:number }
export class ContactEpisodes {
 private episodes=new Map<string,Episode>();
 private counts=new Map<string,number>();
 /** Fixed 60 Hz: release > .12s (8 ticks), cooldown >= .42s (26 ticks). */
 advance(tick:number,contacts:readonly SegmentContact[],active:(fighterId:number,segmentId:string)=>boolean,onHit:(hit:LabHit,chain:readonly string[])=>void):void{
  const seen=new Set<string>();
  for(const hit of contacts){
   if(isProtectedSegment(hit.segmentId)||!active(hit.fighterId,hit.segmentId))continue;
   const part=JSON.stringify([hit.fighterId,hit.segmentId]),key=JSON.stringify([hit.fighterId,hit.segmentId,hit.otherId]);
   if(seen.has(key))continue;seen.add(key);
   const rec=this.episodes.get(key);
   if(!rec||(tick-rec.lastSeen>=8&&tick-rec.lastHit>=26)){
    const count=(this.counts.get(part)??0)+1;this.counts.set(part,count);
    this.episodes.set(key,{lastSeen:tick,lastHit:tick});
    onHit({...hit,count},count>=3?severingChain(hit.segmentId):[]);
   }else rec.lastSeen=tick;
  }
  for(const [key,rec] of this.episodes)if(tick-rec.lastSeen>120)this.episodes.delete(key);
 }
 reset():void{this.episodes.clear();this.counts.clear();}
}
