// Same centisecond display as src/ui/results.js in the 2D game.
export function formatRoundTime(seconds){
 const total=Math.max(0,Math.floor(seconds*100+1e-7));
 const hours=Math.floor(total/360000),minutes=Math.floor(total/6000)%60;
 const secs=Math.floor(total/100)%60,centis=total%100;
 const pad=n=>String(n).padStart(2,'0');
 if(hours)return `${hours}:${pad(minutes)}:${pad(secs)}:${pad(centis)}`;
 if(minutes)return `${minutes}:${pad(secs)}:${pad(centis)}`;
 return `${secs}:${pad(centis)}`;
}

export class RoundClock{
 constructor(){this.reset();}
 reset(){this.elapsed=0;this.finished=false;}
 sample(snapshot){
  if(!this.finished){
   this.elapsed=snapshot.elapsedSeconds;
   this.finished=snapshot.fight.ended;
  }
  return formatRoundTime(this.elapsed);
 }
}

export class FrameMeter{
 constructor(gl,output){
  this.gl=gl;this.output=output;
  this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  this.pending=[];this.start=null;this.frames=0;this.cpu=0;this.gpu=0;this.gpuFrames=0;
 }
 begin(){
  const {gl,ext}=this;
  if(!ext||gl.isContextLost())return null;
  if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
   for(const query of this.pending)gl.deleteQuery(query);
   this.pending.length=0;this.gpu=0;this.gpuFrames=0;
   return null;
  }
  while(this.pending.length&&gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE)){
   const query=this.pending.shift();
   this.gpu+=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;this.gpuFrames++;
   gl.deleteQuery(query);
  }
  if(this.pending.length>=2)return null;
  const query=gl.createQuery();
  if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
  return query;
 }
 end(query){
  if(!query)return;
  this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
  this.pending.push(query);
 }
 frame(now,cpuMs){
  if(this.start===null){this.start=now;return;}
  this.frames++;this.cpu+=cpuMs;
  const ms=now-this.start;
  if(ms<500)return;
  const fps=this.frames*1000/ms,average=this.cpu/this.frames;
  const load=time=>Math.min(100,Math.round(time*fps/10));
  const gpu=this.gpuFrames?this.gpu/this.gpuFrames:null;
  this.output.textContent=`${Math.round(fps)} FPS · CPU ${load(average)}% (${average.toFixed(1)} мс) · GPU ${gpu===null?'—':`${load(gpu)}% (${gpu.toFixed(1)} мс)`}`;
  this.start=now;this.frames=0;this.cpu=0;this.gpu=0;this.gpuFrames=0;
 }
}
