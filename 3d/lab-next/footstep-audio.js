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

/** Horizontal bearing keeps the cue stable when looking up or down.
 * HRTF handles stereo direction. The shelves give the same recording a
 * distinguishable heel/body and edge across the two hemispheres. */
export function stepDirectionTone(eye,forward,point){
 const dx=point[0]-eye[0],dz=point[2]-eye[2];
 const scale=Math.hypot(dx,dz)*Math.hypot(forward[0],forward[2]);
 const bearing=scale>1e-6?clamp((dx*forward[0]+dz*forward[2])/scale,-1,1):0;
 const front=Math.max(0,bearing),rear=Math.max(0,-bearing);
 return {body:3.5*rear-1.5*front,edge:3*front-8.5*rear};
}

export function createStepTone(context){
 const body=context.createBiquadFilter(),edge=context.createBiquadFilter();
 body.type='lowshelf';body.frequency.value=520;
 edge.type='highshelf';edge.frequency.value=1150;
 body.connect(edge);
 return {body,edge};
}

function updateTone(voice,eye,forward,time,immediate=false){
 const {body,edge}=voice.own?{body:0,edge:0}:stepDirectionTone(eye,forward,voice.point);
 if(immediate){voice.tone.body.gain.value=body;voice.tone.edge.gain.value=edge;}
 else if(Math.abs(body-voice.body)>.08||Math.abs(edge-voice.edge)>.08){
  voice.tone.body.gain.setTargetAtTime(body,time,.035);
  voice.tone.edge.gain.setTargetAtTime(edge,time,.035);
 }else return;
 voice.body=body;voice.edge=edge;
}

export class FootstepAudio{
 constructor(){
  this.pending=[];
  this.voices=new Set();
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
  for(const voice of this.voices)voice.source.stop();
  this.voices.clear();
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
  for(const voice of this.voices)updateTone(voice,eye,forward,ctx.currentTime);
  for(const step of pending){
   if(this.voices.size>=14)break;
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
   const tone=createStepTone(ctx),voice={point:step.point,own,tone,source};
   updateTone(voice,eye,forward,ctx.currentTime,true);
   source.connect(filter).connect(tone.body);
   tone.edge.connect(panner).connect(level).connect(this.bus);
   this.voices.add(voice);
   source.onended=()=>{
    this.voices.delete(voice);
    for(const node of [source,filter,tone.body,tone.edge,panner,level])node.disconnect();
   };
   source.start();
  }
 }
}
