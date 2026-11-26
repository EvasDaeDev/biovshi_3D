import test from 'node:test';
import assert from 'node:assert/strict';
import {StrikeState,punchPose} from '../dist/combat/strike.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const ids=LAB_SEGMENTS.map(p=>p.id),motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:Object.fromEntries(['stance','stalk','punch','kick','headbutt'].map(k=>[k,referencePose(k)]))});
const base=new PatientGait([0,0,0],0,true,motion).pose(0,[0,0,0],0,0);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('cancel immediately removes damage authority but retains fading visual state',()=>{
 const s=new StrikeState();assert.ok(s.start(0,'L',1,[-.3,1.3,-.5],0));
 s.advance(25,false,ids,true);assert.equal(s.punch,null);assert.equal(s.phase(25),'idle');
 assert.equal(s.visual(25).weight,1);const mid=s.visual(32);assert.ok(mid.weight>0&&mid.weight<1);assert.equal(mid.tick,25);
 s.track(32,[99,99,99]);assert.notEqual(s.visual(32).punch.aim[0],99);
 assert.equal(s.visual(40),null);assert.equal(s.ready(40),false);assert.ok(s.ready(54));
});
test('remaining visual cannot recreate a lost source or affect legacy or prone attacks',()=>{
 const s=new StrikeState();s.start(0,'L',1,[0,1,-.5],0);s.advance(25,false,ids,true);
 s.advance(26,false,ids.filter(id=>id!=='L.lowerArm'),true);assert.equal(s.visual(26),null);
 const l=new StrikeState();l.start(0,'L',1,[0,1,-.5],0);l.advance(25,false,ids);assert.equal(l.visual(25),null);
 const p=new StrikeState();p.start(0,'L',1,[0,1,-.5],0,undefined,'arm',true);p.advance(25,false,ids,true);assert.equal(p.visual(25),null);
});
test('faded upright attacks return to base with connected nominal-length segments',()=>{
 for(const kind of ['arm','leg','head']){
  const s=new StrikeState();s.start(0,'L',1,kind==='arm'?[-.3,1.3,-.5]:kind==='leg'?[-.22,.45,-.45]:[0,1.6,-.4],0,undefined,kind);
  const full=punchPose(base,s.punch,27,()=>0,motion);
  s.advance(27,false,ids,true);
  let previous=full;
  for(let t=27;t<=42;t++){
   const v=s.visual(t),pose=v?punchPose(base,v.punch,v.tick,()=>0,motion,v.weight):base;
   if(t===27)assert.deepEqual(pose,full);
   for(let i=0;i<pose.length;i++){
    const part=pose[i];
    assert.ok(Math.abs(distance(part.a,part.b)-LAB_SEGMENTS.find(p=>p.id===part.id).nominalLength)<1e-7,part.id);
    assert.ok(distance(part.a,previous[i].a)<.30,kind+' '+t+' '+part.id);
   }
   previous=pose;
  }
  assert.deepEqual(previous,base);
 }
});
