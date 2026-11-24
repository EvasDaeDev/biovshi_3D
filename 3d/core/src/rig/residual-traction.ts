import type { RigPose } from './gait.js';
import type { Mobility } from './mobility.js';
import { analyzeSupport } from './support.js';

export interface ResidualTraction {
 readonly mode:'stump'|'head'|'torso';
 readonly phase:'push'|'recover';
 readonly contacts:readonly string[];
 readonly scale:number;
}
export function residualMode(m:Mobility):ResidualTraction['mode']|null{
 if(m.mode==='arm-crawl'&&m.arms.some(n=>n===1)&&!m.arms.some(n=>n>=2))return 'stump';
 if(m.mode==='head-crawl')return 'head';
 if(m.mode==='torso-crawl')return 'torso';
 return null;
}
/** Residual locomotion: only an actual near-ground capsule of the active
 * propulsive group can authorize commanded travel. No fictitious limbs,
 * friction forces, or world-fixed anchors for these segments yet. */
export function residualTraction(pose:readonly RigPose[],m:Mobility,phase:number,ground:(x:number,z:number)=>number):ResidualTraction|null{
 const mode=residualMode(m);if(!mode)return null;
 const ids=mode==='head'?['head']:mode==='torso'?['pelvis','abdomen','chest']:
  ['L.upperArm','R.upperArm'].filter((_,i)=>m.arms[i]===1);
 const eligible=new Set(ids);
 const contacts=[...new Set(analyzeSupport(pose.filter(p=>eligible.has(p.id)),ground).contacts.map(c=>c.segmentId))];
 const wave=Math.cos(phase);
 let stroke=Math.max(0,wave);
 if(mode==='stump'&&m.arms[0]===1&&m.arms[1]===1){
  stroke=Math.max(contacts.includes('L.upperArm')?Math.max(0,wave):0,contacts.includes('R.upperArm')?Math.max(0,-wave):0);
 }
 const phaseName=stroke>1e-6?'push':'recover';
 // Same provisional phase gain used for one-sided prone motion, but no
 // passive creep during recovery or when the driving body part is airborne.
 return {mode,phase:phaseName,contacts,scale:contacts.length&&phaseName==='push'?2.1*stroke:0};
}
