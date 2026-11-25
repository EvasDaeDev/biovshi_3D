import {performance} from 'node:perf_hooks';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
await RAPIER.init();
const c=new LabSimulationCore(),w=new DebrisWorld(RAPIER);
const config=createLabConfig(7);
c.initialize(config);
try{
 for(const f of config.fighters)c.incapacitate(f.id);
 for(const e of c.drainEvents())w.accept(e);
 const initial=w.bodySnapshot(),active=[],staticOnly=[];
 for(let i=0;i<1200;i++){
  const dynamic=w.bodySnapshot().some(b=>!b.settled),t=performance.now();
  w.step(FIXED_DT);const bodies=w.bodySnapshot();
  for(const b of bodies)c.setIncapacitatedPose(b.fighterId,b.parts,b.settled);
  (dynamic?active:staticOnly).push(performance.now()-t);
 }
 const quantiles=a=>{a.sort((a,b)=>a-b);return a.length?{samples:a.length,p50:a[Math.floor((a.length-1)*.5)],p95:a[Math.floor((a.length-1)*.95)],p99:a[Math.floor((a.length-1)*.99)]}:null;};
 const end=w.bodySnapshot();console.log(JSON.stringify({scenario:'8 simultaneous articulated casualties, 20 simulated seconds',unit:'ms',initialBodies:initial.reduce((n,b)=>n+b.dynamicBodies,0),initialJoints:initial.reduce((n,b)=>n+b.joints,0),settled:end.filter(b=>b.settled).length,remainingBodies:end.reduce((n,b)=>n+b.dynamicBodies,0),cones:w.moundSnapshot().length,active:quantiles(active),staticOnly:quantiles(staticOnly)},null,2));
}finally{w.dispose();}
