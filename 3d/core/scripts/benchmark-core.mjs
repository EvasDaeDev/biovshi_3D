import {performance} from 'node:perf_hooks';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const q=(values,p)=>values[Math.floor((values.length-1)*p)];
const summarize=a=>{a.sort((x,y)=>x-y);return {p50:q(a,.5),p95:q(a,.95),p99:q(a,.99)};};
const base=createLabConfig(7);
for(const scenario of ['intact','legless','balance']){
 const damaged=scenario==='legless';
 const fighters=damaged
  ?base.fighters.map(f=>({...f,segmentIds:f.segmentIds.filter(s=>!/\.(upperLeg|lowerLeg|foot)$/.test(s))}))
  :base.fighters;
 const cfg={...base,fighters};
 const core=new LabSimulationCore();core.initialize({...cfg,labContactFracture:false,labDynamicBalance:scenario==='balance'});
 const run=i=>core.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:Math.sin(i*.005)*.5,sprint:false}]});
 for(let i=0;i<300;i++)run(i);
 const step=[],snapshot=[];
 for(let i=0;i<3600;i++){
  let t=performance.now();run(i);step.push(performance.now()-t);
  t=performance.now();core.getSnapshot();snapshot.push(performance.now()-t);
 }
 console.log(JSON.stringify({scenario:'8 '+scenario+' patients, 60 simulated seconds, seed 7',segments:core.getSnapshot().rigSegments.flat().length,unit:'ms',step:summarize(step),snapshot:summarize(snapshot)},null,2));
 core.dispose();
}
