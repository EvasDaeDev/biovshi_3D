const midpoint=part=>part.a.map((value,axis)=>(value+part.b[axis])/2);
const partAt=(state,index,id)=>state.rigSegments[index]?.find(part=>part.id===id);
const chest=(state,index)=>partAt(state,index,'chest')??state.rigSegments[index]?.[0];
function location(state,index,id){
 const part=partAt(state,index,id)??chest(state,index);
 return part?midpoint(part):null;
}

export function combatSoundCues(before,after,events,random=Math.random){
 const cues=[];
 const spatial=(key,id,point,priority,delay=0)=>{
  if(point)cues.push({key,id,point,priority,delay});
 };
 const contacts=new Map(events.filter(e=>e.type==='strike-contact'&&e.point)
  .map(e=>[e.fighterId+':'+e.segmentId,e.point]));
 for(const event of events){
  const {fighterId:id,segmentId,type}=event;
  const i=after.fighterIds.indexOf(id),j=before.fighterIds.indexOf(id);
  const origin=event.point??contacts.get(id+':'+segmentId);
  if(type==='fighter-damaged'){
   const impact=origin??location(after,i,segmentId)??location(before,j,segmentId);
   spatial(event.critical?'crit':'hit',event.attackerId??id,impact,3);
   const female=id%4>=2,variants=female?7:3;
   const voice=(female?'womanPain':'manPain')+(1+Math.floor(random()*variants));
   spatial(voice,id,location(after,i,'head')??impact,2,.1);
  }else if(type==='segment-detached'){
   const part=event.detachedParts?.[0]??event.detachedPose;
   spatial(random()<.5?'detach1':'detach2',id,origin??(part?midpoint(part):location(before,j,segmentId)),4);
  }else if(type==='fighter-incapacitated'){
   spatial('death',id,location(after,i,'chest')??location(before,j,'chest'),4);
  }
 }
 if(!before.fight.ended){
  for(const [i,id] of after.fighterIds.entries()){
   const j=before.fighterIds.indexOf(id);
   const old=before.strikes[j],current=after.strikes[i];
   if(old?.phase==='thrust'&&!old.resolved&&current?.phase==='recover'&&!current.resolved)
    spatial(random()<.5?'miss1':'miss2',id,location(after,i,current.source),1);
   if(after.hopPhases[i]==='flight'&&before.hopPhases[j]!=='flight'&&current?.pounce)
    spatial('pounce',id,location(after,i,'chest'),4);
  }
  if(after.fight.ended&&after.fight.winnerId!==null)cues.push({key:'victory',priority:5});
 }
 return cues;
}

export function combatSoundLoops(before,after){
 if(after.fight.ended)return [];
 return Array.from(after.fighterIds).flatMap((id,i)=>{
  const j=before.fighterIds.indexOf(id);
  if(j<0||after.lifeStates[i]!=='active')return [];
  const point=location(after,i,'chest');
  if(!point)return [];
  const result=[];
  if(after.oil[i].failureTick!==null)result.push({key:'crawl',slot:'crawl-'+id,id,point,priority:3});
  const moving=Math.hypot(after.roots[4*i]-before.roots[4*j],after.roots[4*i+2]-before.roots[4*j+2])>1/6000;
  if(moving&&after.postures[i]==='prone')result.push({key:'drag',slot:'drag-'+id,id,point,priority:1});
  return result;
 });
}
