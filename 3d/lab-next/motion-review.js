/** Deterministic two-patient locomotion review. Simulation time, not RAF,
 * drives every command. Both patients stop permanently at the final stage. */
export function reviewInput(tick){
 let phase='idle',forward=0,turn=0,sprint=false;
 if(tick>=90&&tick<190){phase='walk';forward=.65;}
 else if(tick>=190&&tick<250)phase='brake';
 else if(tick>=250&&tick<310){phase='turn';turn=.65;}
 else if(tick>=310&&tick<350){phase='burst';forward=.85;sprint=true;}
 else if(tick>=350)phase='settle';
 return {phase,input:{commands:[0,1].map(fighterId=>({fighterId,forward,turn:turn*(fighterId===0?1:-1),sprint,attack:false}))}};
}
/** Compare only continuous ownership and equal surviving anatomy. A topology
 * change is reported separately, not mistaken for a pose discontinuity. */
export function measureMotion(before,after){
 let max=0,segment=null,fighterId=null,excluded=0;
 for(let i=0;i<after.fighterIds.length;i++){
  const id=after.fighterIds[i],j=before.fighterIds.indexOf(id),parts=after.rigSegments[i],old=j>=0?before.rigSegments[j]:null;
  if(!old||before.lifeStates[j]!==after.lifeStates[i]||old.length!==parts.length||parts.some(p=>!old.some(q=>q.id===p.id))){excluded++;continue;}
  for(const p of parts){
   const q=old.find(v=>v.id===p.id);
   for(const k of ['a','b']){
    const d=Math.hypot(p[k][0]-q[k][0],p[k][1]-q[k][1],p[k][2]-q[k][2]);
    if(d>max){max=d;segment=p.id;fighterId=id;}
   }
  }
 }
 return {max,segment,fighterId,excluded,tick:after.tick};
}
