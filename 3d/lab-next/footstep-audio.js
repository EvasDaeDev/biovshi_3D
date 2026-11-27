const DISTANCE_GAINS=[1,.6,.3,.15,.1];
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

/** The 2D game's authored curve, measured in metres. */
export function stepDistanceGain(distance){
 if(distance<=1)return 1;
 if(distance>=7)return .1*clamp((10-distance)/3,0,1);
 const step=(distance-1)/1.5,index=Math.floor(step);
 return DISTANCE_GAINS[index]+(DISTANCE_GAINS[index+1]-DISTANCE_GAINS[index])*(step-index);
}

export function footContacts(before,after){
 const contacts=[];
 if(after.tick<=before.tick||after.fight.ended)return contacts;
 for(const [i,id] of after.fighterIds.entries()){
  const j=before.fighterIds.indexOf(id);
  if(j<0||after.lifeStates[i]!=='active'||after.postures[i]!=='upright'||after.hopPhases[i]==='flight')continue;
  const feet=after.footStates[i],old=before.footStates[j];
  const planted=after.segmentIds[i];
  if(before.hopPhases[j]==='flight'){
   const landed=feet.filter((foot,side)=>planted.includes((side?'R.':'L.')+'foot'));
   if(landed.length){
    const point=landed[0].point.map((_,axis)=>landed.reduce((sum,foot)=>sum+foot.point[axis],0)/landed.length);
    contacts.push({id,point,landed:true,side:0,tick:after.tick});
   }
   continue;
  }
  for(const [side,foot] of feet.entries()){
   if(old[side]?.moving&&!foot.moving&&planted.includes((side?'R.':'L.')+'foot'))
    contacts.push({id,point:foot.point,landed:false,side,tick:after.tick});
  }
 }
 return contacts;
}

export class FootstepAudio{
 constructor(){
  this.pending=[];
  this.voices=0;
 }
 async unlock(){
  if(this.context){
   if(this.context.state!=='running')await this.context.resume().catch(()=>{});
   return;
  }
  const Context=window.AudioContext??window.webkitAudioContext;
  if(!Context)return;
  try{
   const context=this.context=new Context();
   this.bus=context.createDynamicsCompressor();
   this.bus.threshold.value=-10;
   this.bus.connect(context.destination);
   await context.resume();
   const response=await fetch(new URL('./audio/step_1.mp3',import.meta.url));
   if(!response.ok)throw Error('Step sample unavailable');
   this.sample=await context.decodeAudioData(await response.arrayBuffer());
  }catch{
   this.context?.close().catch(()=>{});
   this.context=null;
  }
 }
 record(before,after){
  if(!this.sample||this.context?.state!=='running')return;
  this.pending.push(...footContacts(before,after));
 }
 clear(){
  this.pending.length=0;
 }
 update(eye,forward,up,controlled,clear){
  const pending=this.pending.splice(0),ctx=this.context,sample=this.sample;
  if(!sample||ctx?.state!=='running'||document.hidden)return;
  const listener=ctx.listener;
  for(const [i,axis] of ['X','Y','Z'].entries()){
   listener['position'+axis].value=eye[i];
   listener['forward'+axis].value=forward[i];
   listener['up'+axis].value=up[i];
  }
  for(const step of pending){
   if(this.voices>=14)break;
   const distance=Math.hypot(...step.point.map((value,i)=>value-eye[i]));
   const gain=stepDistanceGain(distance);
   if(gain<=.002)continue;
   const own=step.id===controlled;
   const unobstructed=own||!clear||clear(eye,step.point);
   const source=ctx.createBufferSource(),panner=ctx.createPanner(),filter=ctx.createBiquadFilter(),level=ctx.createGain();
   const pitch=((step.id*7)%11-5)*.28+(step.side?.18:-.18)+(step.tick%5-2)*.07;
   source.buffer=sample;
   source.playbackRate.value=2**(pitch/12);
   filter.type='lowpass';filter.frequency.value=unobstructed?11000:1400;filter.Q.value=.35;
   panner.panningModel='HRTF';
   panner.rolloffFactor=0;
   [panner.positionX.value,panner.positionY.value,panner.positionZ.value]=step.point;
   level.gain.value=.54*gain*(own?2/3:1)*(step.landed?1.12:1)*(unobstructed?1:.62);
   source.connect(filter).connect(panner).connect(level).connect(this.bus);
   this.voices++;
   source.onended=()=>{this.voices--;source.disconnect();filter.disconnect();panner.disconnect();level.disconnect();};
   source.start();
  }
 }
}
