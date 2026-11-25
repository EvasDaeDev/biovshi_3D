import test from 'node:test';
import assert from 'node:assert/strict';
import {ImpactMotion,localImpact} from '../dist/animation/impact-motion.js';
import {ImpactState} from '../dist/combat/impact.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const dt=1/60,dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('directional reaction has onset, uninterrupted rebasing and bounded decay after repeated hits',()=>{
 const m=new ImpactMotion(),zero=m.sample;
 m.hit('head',1,0);assert.deepEqual(m.sample,zero);
 m.advance(.065);assert.ok(m.sample.head[0]>.1);
 const before=m.sample;m.hit('R.lowerArm',-1,0,true);assert.deepEqual(m.sample,before);
 m.advance(.085);assert.ok(m.sample.rightArm[0]<-.1);assert.ok(Math.abs(m.sample.leftArm[0])<.03);
 m.advance(.78);assert.deepEqual(m.sample,zero);
 assert.ok(dist(localImpact([1,0,0],Math.PI/2),[0,0,-1])<1e-9);
});
test('pose reaction outlasts physical impact without extending recoil or slowdown',()=>{
 const a=new ImpactState(),b=new ImpactState();
 a.hit('head',1,0,true);b.hit('head',1,0,false);
 for(let i=0;i<33;i++){assert.deepEqual(a.advance(dt),b.advance(dt));assert.equal(a.slow,b.slow);}
 assert.equal(a.active,false);assert.ok(a.reaction.head[0]>0);assert.equal(a.slow,1);
 for(let i=0;i<20;i++)assert.deepEqual(a.advance(dt),[0,0,0]);
 assert.deepEqual(a.reaction,new ImpactMotion().sample);
});
test('authored pose reacts to opposite hit directions without stretching bones or mutating reads',()=>{
 const slots={stance:referencePose('stance'),stalk:referencePose('stalk')};
 const gait=new PatientGait([0,0,0],0,true,compileAuthoredMotion({schemaVersion:1,stature:1.65,slots}));
 const a=new ImpactMotion(),b=new ImpactMotion();
 a.hit('chest',1,0);b.hit('chest',-1,0);a.advance(.085);b.advance(.085);
 const pose=m=>gait.pose(0,[0,0,0],0,0,false,0,m.sample);
 const p=pose(a),q=pose(b),get=(p,id)=>p.find(v=>v.id===id);
 assert.ok(get(p,'head').a[0]>get(q,'head').a[0]+.08);
 assert.deepEqual(p,pose(a));
 for(const parts of [p,q])for(const part of parts)assert.ok(Math.abs(dist(part.a,part.b)-LAB_SEGMENTS.find(s=>s.id===part.id).nominalLength)<1e-7,part.id);
});
