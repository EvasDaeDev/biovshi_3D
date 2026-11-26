import {performance} from 'node:perf_hooks';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {reviewInput} from '../../lab-next/motion-review.js';
import {motionSample,MotionReport} from './motion-audit-metrics.mjs';
const idle={commands:[0,1].map(fighterId=>({fighterId,forward:0,turn:0,sprint:false,attack:false}))};
const q=(a,p)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
/** Native fixed-tick audit using the very same authored JSON and command
 * sequence as the review UI. No artificial hits in autonomous combat.
 * Forced damage is a distinct, explicitly labelled diagnostic. */
export function auditMotion(ring){
 const results=[];
 for(const scenario of ['locomotion','combat','damage','knockdown']){
  const core=new LabSimulationCore(),report=new MotionReport(),stepTimes=[],snapshotTimes=[],events={},phases=new Set();
  const base=createAuthoredCombatConfig(7,ring,2),combat=scenario==='combat';
  const positions=scenario==='knockdown'?[[0,0,0],[.08,0,0]]:[[-1.2,0,1.05],[1.2,0,1.05]];
  const config=combat?base:{...base,combatEnabled:false,expandedStrikes:false,escapeCombat:false,perceptionCombat:false,labContactFracture:false,labDynamicBalance:scenario==='knockdown',fighters:base.fighters.map((f,i)=>({...f,origin:positions[i],yawRad:0}))};
  const count=combat?900:scenario==='locomotion'?480:scenario==='damage'?240:240;
  try{
   core.initialize(config);
   let before=core.getSnapshot(),older=null;
   for(let i=0;i<count;i++){
    const phase=scenario==='locomotion'?reviewInput(i).phase:null;
    const t=performance.now();
    if(scenario==='damage'&&(i===60||i===150))core.applyDamage({fighterId:0,segmentId:i===60?'head':'R.lowerArm',amount:1,attackerId:1});
    core.step(FIXED_DT,combat?{commands:[]}:scenario==='locomotion'?reviewInput(i).input:idle);
    const tickEvents=core.drainEvents();stepTimes.push(performance.now()-t);
    for(const e of tickEvents)events[e.type]=(events[e.type]??0)+1;
    const s=performance.now(),after=core.getSnapshot();snapshotTimes.push(performance.now()-s);
    const states=scenario==='combat'?after.strikes.map(v=>v.phase==='idle'?'idle':v.kind+':'+v.phase):
      scenario==='knockdown'?after.balanceStates:scenario==='damage'?[after.impacts[0].active?'impact':i>=60&&i<108||i>=150&&i<198?'visual-recovery':'idle']:[phase];
    for(const label of new Set(states)){
     phases.add(label);
     const ids=scenario==='damage'?[0]:scenario==='locomotion'?null:Array.from(after.fighterIds).filter((id,index)=>states[index]===label);
     report.add(label,motionSample(before,after,older,ids));
    }
    older=before;before=after;
   }
   results.push({scenario,seed:7,ticks:count,events,phases:[...phases],cpuMs:{stepP95:q(stepTimes,.95),snapshotP95:q(snapshotTimes,.95)},motion:report.report()});
  }finally{core.dispose();}
 }
 return results;
}
