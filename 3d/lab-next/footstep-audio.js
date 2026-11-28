import {combatSoundCues,combatSoundLoops} from './combat-sound-cues.js';

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

const soundLevels={step:.54,drag:.76,crawl:.42,hit:.72,crit:.56};
const levelFor=key=>soundLevels[key]??(key.includes('Pain')?.72:.76);

export class BattlefieldAudio{
 constructor(){
  this.pending=[];
  this.voices=new Set();
  this.samples=new Map();
  this.loops=[];
  this.dragActivity=new Map();
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
   const directory=new URL('./audio/',import.meta.url);
   const response=await fetch(new URL('catalog.json',directory));
   if(!response.ok)throw Error('Combat sound catalog unavailable');
   const files=await response.json(),buffers=new Map();
   await Promise.allSettled(Object.entries(files).map(async([key,file])=>{
    if(!buffers.has(file))buffers.set(file,fetch(new URL(file,directory)).then(async asset=>{
     if(!asset.ok)throw Error('Combat sound unavailable');
     return context.decodeAudioData(await asset.arrayBuffer());
    }));
    this.samples.set(key,await buffers.get(file));
   }));
  }catch{
   this.context?.close().catch(()=>{});
   this.context=null;this.samples.clear();
  }
 }
 record(before,after,events){
  if(this.context?.state!=='running')return;
  const steps=footContacts(before,after).map(step=>({...step,key:'step',priority:0}));
  this.pending.push(...steps,...combatSoundCues(before,after,events));
  const loops=combatSoundLoops(before,after);
  for(const cue of loops)if(cue.key==='drag')this.dragActivity.set(cue.id,{cue,tick:after.tick});
  for(const [id,{cue,tick}] of this.dragActivity){
   const i=after.fighterIds.indexOf(id);
   if(after.fight.ended||after.lifeStates[i]!=='active'||after.postures[i]!=='prone'||after.tick-tick>8)
    this.dragActivity.delete(id);
   else if(tick!==after.tick)loops.push(cue);
  }
  this.loops=loops;
 }
 stop(voice){
  this.voices.delete(voice);
  voice.source.onended=null;
  voice.source.stop();
  for(const node of voice.nodes)node.disconnect();
 }
 clear(){
  this.pending.length=0;this.loops=[];this.dragActivity.clear();
  for(const voice of this.voices)this.stop(voice);
 }
 spatialize(voice,eye,forward,controlled,clear,immediate=false){
  const {point,id,key,level,panner,filter}=voice,time=this.context.currentTime;
  let gain=levelFor(key);
  if(point){
   voice.own=key==='step'&&id===controlled;
   const visible=id===controlled||!clear||clear(eye,point);
   gain*=stepDistanceGain(Math.hypot(point[0]-eye[0],point[1]-eye[1],point[2]-eye[2]));
   gain*=(voice.own?2/3:1)*(voice.landed?1.12:1)*(visible?1:.62);
   [panner.positionX.value,panner.positionY.value,panner.positionZ.value]=point;
   filter.frequency.value=visible?11000:1400;
   updateTone(voice,eye,forward,time,immediate);
  }
  if(immediate)level.gain.value=gain;
  else if(Math.abs(gain-level.gain.value)>.004)level.gain.setTargetAtTime(gain,time,.035);
 }
 play(cue,eye,forward,controlled,clear){
  const sample=this.samples.get(cue.key);
  if(!sample||cue.point&&stepDistanceGain(Math.hypot(...cue.point.map((value,i)=>value-eye[i])))<=.002)return;
  if(this.voices.size>=14){
   const replace=[...this.voices].find(voice=>!voice.slot&&voice.priority<cue.priority);
   if(!replace)return;
   this.stop(replace);
  }
  const ctx=this.context,source=ctx.createBufferSource(),level=ctx.createGain();
  source.buffer=sample;source.loop=!!cue.slot;
  const pitch=cue.key==='step'?((cue.id*7)%11-5)*.28+(cue.side?.18:-.18)+(cue.tick%5-2)*.07:
   cue.id===undefined?0:[-1.5,-.5,.5,1.5][cue.id%4]+(cue.slot?0:(Math.random()-.5)*.4);
  source.playbackRate.value=2**(pitch/12);
  const voice={...cue,source,level,nodes:[source,level]};
  if(cue.point){
   const panner=ctx.createPanner(),filter=ctx.createBiquadFilter(),tone=createStepTone(ctx);
   filter.type='lowpass';filter.Q.value=.35;
   panner.panningModel='HRTF';panner.rolloffFactor=0;
   source.connect(filter).connect(tone.body);
   tone.edge.connect(panner).connect(level);
   Object.assign(voice,{panner,filter,tone});
   voice.nodes.push(filter,tone.body,tone.edge,panner);
  }else source.connect(level);
  level.connect(this.bus);
  this.spatialize(voice,eye,forward,controlled,clear,true);
  this.voices.add(voice);
  source.onended=()=>{
   this.voices.delete(voice);
   for(const node of voice.nodes)node.disconnect();
  };
  source.start(ctx.currentTime+(cue.delay??0));
 }
 update(eye,forward,up,controlled,clear,paused){
  const pending=this.pending.splice(0),ctx=this.context;
  if(!ctx||ctx.state!=='running')return;
  const listener=ctx.listener;
  for(const [i,axis] of ['X','Y','Z'].entries()){
   listener['position'+axis].value=eye[i];
   listener['forward'+axis].value=forward[i];
   listener['up'+axis].value=up[i];
  }
  for(const voice of this.voices){
   if(voice.slot){
    const active=!paused&&this.loops.find(cue=>cue.slot===voice.slot);
    if(!active){this.stop(voice);continue;}
    voice.point=active.point;
   }
   this.spatialize(voice,eye,forward,controlled,clear);
  }
  for(const cue of pending)this.play(cue,eye,forward,controlled,clear);
  if(!paused)for(const cue of this.loops)if(![...this.voices].some(voice=>voice.slot===cue.slot))
   this.play(cue,eye,forward,controlled,clear);
 }
}
