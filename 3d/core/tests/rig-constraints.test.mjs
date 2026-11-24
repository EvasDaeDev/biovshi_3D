import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const f=createLabConfig(7).fighters[0],lengths=new Map(LAB_SEGMENTS.map(p=>[p.id,p.nominalLength]));
const d=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function verify(parts){
 const p=Object.fromEntries(parts.map(p=>[p.id,p]));
 for(const part of parts)assert.ok(Math.abs(d(part.a,part.b)-lengths.get(part.id))<1e-8,part.id);
 for(const side of ['L','R'])for(const [u,l,g] of [['upperLeg','lowerLeg','pelvis'],['upperArm','lowerArm','chest']]){
  const a=p[side+'.'+u],b=p[side+'.'+l];
  if(a&&p[g])assert.ok(d(a.a,p[g][side==='L'?'a':'b'])<1e-9);
  if(a&&b)assert.ok(d(a.b,b.a)<1e-9);
 }
}
test('all nominal capsule lengths and joint anchors hold on every falling tick',()=>{
 const ids=f.segmentIds.filter(s=>!/\.(upperLeg|lowerLeg|foot)$/.test(s));
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,segmentIds:ids}]});
 let falling=false,prone=false;
 for(let i=0;i<100;i++){
  const s=c.getSnapshot();verify(s.rigSegments[0]);falling||=s.postures[0]==='falling';prone||=s.postures[0]==='prone';
  c.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:.2,sprint:false}]});
 }
 assert.ok(falling&&prone);
});
test('all intact bones keep lengths while walking, sprinting and turning',()=>{
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});
 for(let i=0;i<180;i++){
  c.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:.3,sprint:i>90}]});
  verify(c.getSnapshot().rigSegments[0]);
 }
});
