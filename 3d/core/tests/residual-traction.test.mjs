import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {residualTraction} from '../dist/rig/residual-traction.js';
import {mobilityFor} from '../dist/rig/mobility.js';
const f=createLabConfig(7).fighters[0],base=f.segmentIds.filter(s=>!/\.(upperLeg|lowerLeg|foot|upperArm|lowerArm|hand)$/.test(s)),flat=()=>0;
const ball=(id,y,r)=>({id,a:[0,y,0],b:[0,y,0],radius:r});
test('only the designated grounded segment authorizes a residual drive stroke',()=>{
 const m=mobilityFor(base),pose=[ball('head',.19,.19),ball('pelvis',.135,.135)];
 assert.ok(residualTraction(pose,m,0,flat).scale>0);
 assert.equal(residualTraction(pose,m,Math.PI,flat).scale,0);
 assert.equal(residualTraction([ball('head',.4,.19),pose[1]],m,0,flat).scale,0);
 assert.equal(residualTraction([pose[1]],m,0,flat).scale,0);
 assert.equal(residualTraction(pose,m,0,()=>-.2).scale,0);
 assert.equal(residualTraction(pose,mobilityFor(f.segmentIds),0,flat),null);
});
test('head, torso and shoulder stump move only during a grounded working stroke',()=>{
 for(const [mode,ids] of [['head',base],['torso',base.filter(s=>s!=='neck'&&s!=='head')],['stump',[...base,'L.upperArm']]]){
  const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,segmentIds:ids}]});
  let prev=c.getSnapshot(),moves=0,pauses=0;
  for(let i=0;i<300;i++){
   c.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:0,sprint:false}]});
   const s=c.getSnapshot(),old=prev.residualTraction[0],delta=prev.roots[2]-s.roots[2];
   if(old){assert.equal(old.mode,mode);
    if(delta>1e-6){assert.ok(old.scale>0&&old.contacts.length,mode);moves++;}
    if(old.scale===0){assert.ok(Math.abs(delta)<1e-6,mode);pauses++;}
   }
   for(const p of s.rigSegments[0])assert.ok(Math.min(p.a[1],p.b[1])-p.radius>=-1e-8,p.id);
   prev=s;
  }
  assert.ok(moves>10&&pauses>10&&prev.roots[2]<f.origin[2]-.03,mode);
 }
});
