import test from 'node:test';
import assert from 'node:assert/strict';
import {StrikeState,strikeAge,punchPose} from '../dist/combat/strike.js';
import {attackScore} from '../dist/combat/opportunity.js';
import {POUNCE,pounceOffset} from '../dist/combat/pounce.js';
import {HopCycle} from '../dist/rig/hop-cycle.js';
import {PatientGait} from '../dist/rig/gait.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {strikeLocomotion} from '../dist/combat/strike-locomotion.js';
const ids=LAB_SEGMENTS.map(p=>p.id),dt=1/60;
test('authored thrust is nine ticks instead of twelve; windup recovery and cooldown unchanged',()=>{
 const a=new StrikeState(1,true),legacy=new StrikeState();
 for(const s of [a,legacy])assert.ok(s.start(0,'L',1,[0,1,-.5],0));
 assert.equal(a.phase(19),'windup');assert.equal(a.phase(20),'thrust');assert.equal(a.phase(28),'thrust');
 assert.equal(a.phase(29),'recover');assert.equal(a.phase(44),'recover');assert.equal(a.phase(45),'idle');
 assert.equal(legacy.phase(31),'thrust');assert.equal(legacy.phase(32),'recover');assert.equal(a.cooldownTicks,legacy.cooldownTicks);
 assert.equal(strikeAge(a.punch,29),32);
});
test('actual head contacts outrank otherwise comparable torso contacts but do not force aim',()=>{
 const c={side:'L',id:'head',aim:[0,1,0],distance:.5,contactId:'head'},context={distance:.7,facing:0,grounded:false,opponent:{phase:'idle'},temperament:'balanced'};
 assert.ok(attackScore('arm',c,context)>attackScore('arm',{...c,contactId:'chest'},context));
 assert.ok(attackScore('arm',{...c,id:'chest',contactId:'head'},context)>attackScore('arm',{...c,contactId:'chest'},context));
});
test('pounce preview trajectory matches the actual hop and all three airborne sources retain bone lengths',()=>{
 const hop=new HopCycle(POUNCE.prepare,POUNCE.flight,POUNCE.settle,true,POUNCE.distance);
 let z=0;
 for(let i=1;i<=48;i++){
  const f=hop.advance(dt,i===1?POUNCE.distance/(POUNCE.prepare+POUNCE.flight+POUNCE.settle):0);z-=f.distance;
  const expected=pounceOffset(i*dt,0);
  assert.ok(Math.abs(z-expected[2])<1e-8);assert.ok(Math.abs(f.lift-expected[1])<1e-8);
 }
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk'),punch:referencePose('punch'),kick:referencePose('kick'),headbutt:referencePose('headbutt')}});
 const base=new PatientGait([0,0,0],0,true,motion).pose(0,[0,0,0],0,0);
 const d=pounceOffset(25*dt,0),air=base.map(p=>({...p,a:p.a.map((v,i)=>v+d[i]),b:p.b.map((v,i)=>v+d[i])}));
 for(const kind of ['arm','leg','head']){
  const state=new StrikeState(1,true);assert.ok(state.start(0,'L',1,[-.18,kind==='leg'?1:1.5,-1.1],0,'head',kind,false,undefined,false,true));
  assert.equal(state.snapshot(25).pounce,true);
  assert.equal(strikeLocomotion({fighterId:0,forward:1,turn:1,sprint:true},state.punch,'windup').jump,true);
  const pose=punchPose(air,state.punch,25,()=>0,motion);
  for(const p of pose)assert.ok(Math.abs(Math.hypot(...p.a.map((v,i)=>v-p.b[i]))-LAB_SEGMENTS.find(s=>s.id===p.id).nominalLength)<1e-7,p.id);
 }
});
