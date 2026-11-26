import test from 'node:test';
import assert from 'node:assert/strict';
import {patientMotionProfile,BASE_MOTION_PROFILE} from '../dist/animation/motion-profile.js';
import {horrorBipedStep} from '../dist/rig/movement-timing.js';
import {StrikeState,punchPose} from '../dist/combat/strike.js';
import {HopCycle} from '../dist/rig/hop-cycle.js';
import {compensateHead,counterArms} from '../dist/animation/body-compensation.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const dt=1/60,ids=LAB_SEGMENTS.map(p=>p.id),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:Object.fromEntries(['stance','stalk','punch','kick','headbutt'].map(k=>[k,referencePose(k)]))});
const base=new PatientGait([0,0,0],0,true,motion).pose(0,[0,0,0],0,0);
const get=(pose,id)=>pose.find(p=>p.id===id);
test('same seed, same temperament: independent stride, strike, hop and leading foot',()=>{
 const profiles=Array.from({length:10},(_,id)=>patientMotionProfile(7,id,'balanced'));
 assert.ok(new Set(profiles.map(p=>p.strideTempo)).size>3);
 assert.ok(new Set(profiles.map(p=>p.strikeTempo)).size>3);
 assert.ok(new Set(profiles.map(p=>p.hopTempo)).size>3);
 assert.equal(new Set(profiles.map(p=>p.firstFoot)).size,2);
 assert.equal(patientMotionProfile(7,0).strikeTempo,BASE_MOTION_PROFILE.strikeTempo);
 assert.ok(new Set(profiles.map(p=>horrorBipedStep(1.2,p.strideTempo).interval)).size>3);
 const a=new StrikeState(.9),b=new StrikeState(1.1);
 for(const s of [a,b])assert.ok(s.start(0,'L',1,[-.2,1.4,-.5],0));
 assert.equal(a.phase(19),'thrust');assert.equal(b.phase(19),'windup');
 assert.ok(a.cooldownTicks<b.cooldownTicks);
 for(const s of [a,b]){
  const p=s.punch,canonical={...p,tempo:1};
  // Same physical trajectory evaluated on the actor's own clock.
  const x=punchPose(base,p,25*p.tempo,()=>0,motion),y=punchPose(base,canonical,25,()=>0,motion);
  for(let i=0;i<x.length;i++)assert.ok(distance(x[i].a,y[i].a)<1e-8);
 }
});
test('physical neck counter-motion reduces head excursion and preserves attachment/length',()=>{
 const head=get(base,'head'),neck=get(base,'neck'),ref=[head.a[0]+.12,head.a[1],head.a[2]-.09];
 const p=compensateHead(base,ref,.8),h=get(p,'head'),n=get(p,'neck');
 assert.ok(distance(h.a,ref)<distance(head.a,ref));
 assert.deepEqual(n.a,neck.a);
 assert.ok(Math.abs(distance(n.a,n.b)-distance(neck.a,neck.b))<1e-8);
 assert.ok(Math.abs(distance(n.b,h.a)-distance(neck.b,head.a))<1e-8);
 assert.deepEqual(get(p,'L.foot'),get(base,'L.foot'));
 const arms=counterArms(base,'arm','L',0,1);
 assert.deepEqual(get(arms,'L.lowerArm'),get(base,'L.lowerArm'));
 assert.ok(distance(get(arms,'R.hand').a,get(base,'R.hand').a)>.01);
 assert.deepEqual(get(arms,'R.upperArm').a,get(base,'R.upperArm').a);
 for(const s of arms)assert.ok(Math.abs(distance(s.a,s.b)-LAB_SEGMENTS.find(d=>d.id===s.id).nominalLength)<1e-7);
});
test('landing absorption keeps head/pelvis descent continuous while settling to neutral',()=>{
 const hop=new HopCycle(.18,.42,.20,true),samples=[];
 for(let i=0;i<100;i++){const v=hop.advance(dt,i===0?1:0);samples.push(v);}
 const landing=samples.findIndex((s,i)=>i>0&&s.phase==='pause'&&samples[i-1].phase==='flight');
 assert.ok(landing>0);
 const height=s=>s.lift-(s.crouch??0);
 const before=height(samples[landing-1])-height(samples[landing-2]),after=height(samples[landing+1])-height(samples[landing]);
 assert.ok(before<0&&after<0,JSON.stringify({before,after}));
 assert.ok(samples.slice(landing).some(s=>s.phase==='pause'&&s.crouch>.015));
 assert.equal(samples.at(-1).phase,'idle');assert.equal(samples.at(-1).crouch,0);
});
