import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {bipedStep} from '../dist/rig/movement-timing.js';
const f={...createLabConfig(7).fighters[0],origin:[0,0,0],yawRad:0};
const make=()=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});return c;};
const step=(c,forward,sprint=false)=>{c.step(FIXED_DT,{commands:[{fighterId:0,forward,turn:0,sprint}]});return c.getSnapshot();};
test('biped stride includes swing prediction and a full stance interval, signed in both directions',()=>{
 const w=bipedStep(.9),r=bipedStep(1.9),b=bipedStep(-.9);
 assert.ok(w.lead>.45&&w.swing>=.3&&w.interval>=.48);
 assert.ok(r.lead>w.lead&&r.interval<w.interval&&r.swing<r.interval);
 assert.equal(b.lead,-w.lead);assert.equal(b.interval,w.interval);
});
test('forward and backward walking have long alternating steps, fixed plants and matching arm swings',()=>{
 for(const dir of [1,-1]){
  const c=make();let prev=c.getSnapshot(),landings=0,maxLead=0,maxSpan=0,minGap=Infinity,lastStart=-1,locked=0,opposite=0;
  for(let i=0;i<240;i++){
   const s=step(c,dir),feet=s.footStates[0],old=prev.footStates[0];
   if(s.stepCounts[0]!==prev.stepCounts[0]){
    if(lastStart>=0)minGap=Math.min(minGap,i-lastStart);
    lastStart=i;
   }
   const pose=Object.fromEntries(s.rigSegments[0].map(p=>[p.id,p]));
   for(let k=0;k<2;k++){
    const side=k===0?'L':'R',p=pose[side+'.foot'],a=feet[k],b=old[k];
    if(!a.moving&&b.moving&&i>60){landings++;maxLead=Math.max(maxLead,dir*(s.roots[2]-p.a[2]));}
    if(!a.moving&&!b.moving&&i>60){assert.ok(Math.hypot(a.point[0]-b.point[0],a.point[2]-b.point[2])<1e-8);locked++;}
    const leg=p.a[2]-s.roots[2],arm=pose[side+'.hand'].a[2]-pose[side+'.upperArm'].a[2];
    if(Math.abs(leg)>.12&&leg*arm<0)opposite++;
   }
   if(i>60)maxSpan=Math.max(maxSpan,Math.abs(pose['L.foot'].a[2]-pose['R.foot'].a[2]));
   assert.ok(feet.filter(v=>v.moving).length<=1);
   prev=s;
  }
  assert.ok(landings>=4&&minGap>=29&&maxLead>.16&&maxSpan>.32&&locked>100&&opposite>50,JSON.stringify({dir,landings,minGap,maxLead,maxSpan,locked,opposite}));
  assert.ok(prev.stepCounts[0]<=9);
 }
});
test('standing after releasing movement does not keep shuffling',()=>{
 const c=make();for(let i=0;i<120;i++)step(c,1);
 for(let i=0;i<150;i++)step(c,0);
 const a=c.getSnapshot();for(let i=0;i<90;i++)step(c,0);
 const b=c.getSnapshot();assert.equal(a.stepCounts[0],b.stepCounts[0]);assert.ok(b.footStates[0].every(f=>!f.moving));
});
