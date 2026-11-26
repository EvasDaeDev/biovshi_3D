const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=v=>Math.hypot(...v);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const local=(p,s,i)=>{
 const [x,y,z,yaw]=s.roots.slice(i*4,i*4+4),dx=p[0]-x,dz=p[2]-z;
 return [Math.cos(yaw)*dx+Math.sin(yaw)*dz,p[1]-y,-Math.sin(yaw)*dx+Math.cos(yaw)*dz];
};
const make=()=>({value:0,fighterId:null,segment:null,tick:null,endpoint:null});
/** Measure root-local endpoint movement and change in its per-tick delta
 * separately from world movement. Angles are observable capsule swing only.
 * Topology/ownership changes invalidate the complete actor comparison. */
export function motionSample(before,after,older=null,include=null){
 const peaks={world:make(),local:make(),deltaChange:make(),angle:make()};
 let compared=0,excluded=0,accelerationCompared=0;
 const update=(key,value,id,segment,endpoint)=>{
  if(!Number.isFinite(value))throw Error('Nonfinite motion sample '+segment);
  if(value>peaks[key].value)peaks[key]={value,fighterId:id,segment,tick:after.tick,endpoint};
 };
 const compatible=(s,j,t,i)=>j>=0&&s.lifeStates[j]==='active'&&t.lifeStates[i]==='active'&&
  s.rigSegments[j].length===t.rigSegments[i].length&&t.rigSegments[i].every(p=>s.rigSegments[j].some(q=>q.id===p.id&&q.radius===p.radius));
 if(after.tick!==before.tick+1)throw Error('Motion sample requires consecutive ticks');
 for(let i=0;i<after.fighterIds.length;i++){
  const id=after.fighterIds[i];if(include&&!include.includes(id))continue;
  const j=before.fighterIds.indexOf(id),k=older?older.fighterIds.indexOf(id):-1;
  if(!compatible(before,j,after,i)){excluded++;continue;}
  compared++;
  const acceleration=older&&older.tick===before.tick-1&&compatible(older,k,before,j);
  if(acceleration)accelerationCompared++;
  const old=new Map(before.rigSegments[j].map(p=>[p.id,p])),ancient=acceleration?new Map(older.rigSegments[k].map(p=>[p.id,p])):null;
  for(const p of after.rigSegments[i]){
   const q=old.get(p.id),r=ancient?.get(p.id);
   const a=local(p.a,after,i),b=local(p.b,after,i),c=local(q.a,before,j),d=local(q.b,before,j);
   for(const [endpoint,u,v] of [['a',a,c],['b',b,d]]){
    const delta=sub(u,v);
    update('world',norm(sub(p[endpoint],q[endpoint])),id,p.id,endpoint);
    update('local',norm(delta),id,p.id,endpoint);
    if(r)update('deltaChange',norm(sub(delta,sub(v,local(r[endpoint],older,k)))),id,p.id,endpoint);
   }
   const axis=sub(b,a),previous=sub(d,c),len=norm(axis)*norm(previous);
   if(len>1e-10)update('angle',Math.acos(Math.max(-1,Math.min(1,dot(axis,previous)/len)))*180/Math.PI,id,p.id,null);
  }
 }
 return {peaks,compared,excluded,accelerationCompared};
}
export class MotionReport{
 groups=new Map();
 add(phase,sample){
  if(!this.groups.has(phase))this.groups.set(phase,{ticks:0,compared:0,excluded:0,accelerationCompared:0,metrics:Object.fromEntries(['world','local','deltaChange','angle'].map(k=>[k,[]]))});
  const g=this.groups.get(phase);g.ticks++;g.compared+=sample.compared;g.excluded+=sample.excluded;g.accelerationCompared+=sample.accelerationCompared;
  if(sample.compared)for(const [k,v] of Object.entries(sample.peaks))if(k!=='deltaChange'||sample.accelerationCompared)g.metrics[k].push(v);
 }
 report(){
  return Object.fromEntries([...this.groups].map(([phase,g])=>[phase,{ticks:g.ticks,compared:g.compared,excluded:g.excluded,accelerationCompared:g.accelerationCompared,
   metrics:Object.fromEntries(Object.entries(g.metrics).map(([key,values])=>{
    const sorted=[...values].sort((a,b)=>b.value-a.value);
    return [key,{samples:sorted.length,p95:sorted.length?sorted[Math.ceil((sorted.length-1)*.05)].value:null,top:sorted.slice(0,5)}];
   }))}]));
 }
}
