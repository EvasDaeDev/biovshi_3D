import test from 'node:test';
import assert from 'node:assert/strict';
import {patientMotionProfile,BASE_MOTION_PROFILE} from '../dist/animation/motion-profile.js';
import {HuntState} from '../dist/combat/hunt-state.js';
import {LocomotionMotion,organicSwing} from '../dist/animation/locomotion-motion.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const dt=1/60;
test('stable seeded profiles reuse temperament and stay inside small physical accents',()=>{
 assert.deepEqual(patientMotionProfile(7,0),BASE_MOTION_PROFILE);
 const profiles=Array.from({length:10},(_,i)=>patientMotionProfile(7,i,'balanced'));
 assert.deepEqual(profiles,Array.from({length:10},(_,i)=>patientMotionProfile(7,i,'balanced')));
 assert.ok(profiles.some(p=>p.asymmetry<0)&&profiles.some(p=>p.asymmetry>0));
 for(const p of profiles){assert.ok(Math.abs(p.asymmetry)>=.85&&Math.abs(p.asymmetry)<=1.15);assert.ok(Object.isFrozen(p));}
});
test('same target and seed yield temperament-specific observation, pace and recovery',()=>{
 const input={tick:0,targetId:2,distance:2,visible:true,clear:true,aligned:true,exposed:false,grounded:false,urgent:false,interrupted:false};
 const impulsive=new HuntState(7,0,patientMotionProfile(7,0,'impulsive'));
 const hesitant=new HuntState(7,0,patientMotionProfile(7,0,'hesitant'));
 impulsive.advance(input);hesitant.advance(input);
 assert.ok(impulsive.snapshot().until<hesitant.snapshot().until);
 const a=impulsive.advance({...input,tick:impulsive.snapshot().until}),b=hesitant.advance({...input,tick:hesitant.snapshot().until});
 assert.ok(a.pace>b.pace);assert.equal(a.sprint,false);assert.equal(b.sprint,false);
 for(const h of [impulsive,hesitant])assert.equal(h.advance({...input,tick:120,distance:1}).pace,1);
});
test('profile lag differentiates secondary motion without modifying support schedule',()=>{
 const a=new LocomotionMotion(patientMotionProfile(7,0,'impulsive')),b=new LocomotionMotion(patientMotionProfile(7,0,'hesitant'));
 for(let i=0;i<6;i++){assert.equal(a.prepare(0,dt),b.prepare(0,dt));a.advance(dt,.9,1,1);b.advance(dt,.9,1,1);}
 assert.equal(a.sample.pelvis,b.sample.pelvis);assert.ok(a.sample.chest>b.sample.chest&&a.sample.arms>b.sample.arms);
 assert.ok(organicSwing(0,.32,.085,1).duration>organicSwing(0,.32,.085,-1).duration);
});
test('individual pose offsets preserve nominal anatomy',()=>{
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk')}});
 const make=kind=>new PatientGait([0,0,0],0,true,motion,patientMotionProfile(7,1,kind));
 const a=make('impulsive'),b=make('hesitant');
 for(let i=0;i<90;i++)for(const g of [a,b])g.advance([0,0,-i*.01],0,.6,dt);
 const pa=a.pose(1,[0,0,-.89],0,1.5),pb=b.pose(1,[0,0,-.89],0,1.5);
 assert.notDeepEqual(pa,pb);
 for(const p of [...pa,...pb])assert.ok(Math.abs(Math.hypot(...p.a.map((v,i)=>v-p.b[i]))-LAB_SEGMENTS.find(v=>v.id===p.id).nominalLength)<1e-7,p.id);
});
