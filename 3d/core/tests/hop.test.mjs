import test from 'node:test';
import assert from 'node:assert/strict';
import {HopCycle} from '../dist/rig/hop-cycle.js';
import {MOVEMENT,stepLead} from '../dist/rig/movement-timing.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('v1 timing, distance curve, gravity arc and pause',()=>{
 const h=new HopCycle(),v=.27;
 near(MOVEMENT.hopFlightSeconds,.28);near(MOVEMENT.hopPauseSeconds,.12);
 const a=h.advance(.14,v);assert.equal(a.phase,'flight');near(a.distance,v*.4/2);near(a.lift,1.25*9.81*.28**2/8);
 const b=h.advance(.14,0);assert.equal(b.phase,'pause');near(b.distance,v*.4/2);near(b.lift,0);
 const c=h.advance(.12,0);assert.equal(c.phase,'idle');near(c.distance,0);
 near(h.advance(.1,0).distance,0);
 near(MOVEMENT.stepLeadSeconds,.18);near(stepLead(0),0);
 assert.ok(stepLead(1.9)>0&&stepLead(-1.9)<0);
});
test('fixed ticks preserve complete cycle distance despite fractional flight boundary',()=>{
 const h=new HopCycle();let d=0,max=0;
 for(let i=0;i<24;i++){const s=h.advance(FIXED_DT,.27);d+=s.distance;max=Math.max(max,s.lift);}
 near(d,.27*.4);assert.ok(max>.119&&max<.121);
});
test('one-leg patient hops, lands, preserves leg lengths, and stops after input release',()=>{
 const f=createLabConfig(7).fighters[0],ids=f.segmentIds.filter(s=>!/^R\.(upperLeg|lowerLeg|foot)$/.test(s));
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,segmentIds:ids}]});
 const step=forward=>{c.step(FIXED_DT,{commands:[{fighterId:0,forward,turn:0,sprint:false}]});return c.getSnapshot();};
 let max=0,sawPause=false;
 for(let i=0;i<120;i++){const s=step(1);max=Math.max(max,s.hopHeights[0]);sawPause||=s.hopPhases[0]==='pause';
 for(const p of s.rigSegments[0].filter(p=>p.id.endsWith('Leg')))near(Math.hypot(...p.a.map((v,j)=>v-p.b[j])),p.id.endsWith('upperLeg')?.49:.50);
 const foot=s.rigSegments[0].find(p=>p.id==='L.foot');assert.ok(foot.a[1]>=.12);}
 assert.ok(max>.09&&sawPause);
 for(let i=0;i<180;i++)step(0);const a=c.getSnapshot();assert.equal(a.hopPhases[0],'idle');
 for(let i=0;i<60;i++)step(0);assert.equal(c.getSnapshot().roots[2],a.roots[2]);
});
