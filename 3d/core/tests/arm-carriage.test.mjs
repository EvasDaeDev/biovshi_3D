import test from 'node:test';
import assert from 'node:assert/strict';
import {ArmCarriage} from '../dist/animation/arm-carriage.js';
import {BASE_MOTION_PROFILE,patientMotionProfile} from '../dist/animation/motion-profile.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
import {mobilityFor} from '../dist/rig/mobility.js';
const dt=1/60,ids=LAB_SEGMENTS.map(p=>p.id),mobility=mobilityFor(ids);
const elbow=[0,-.36,0],hand=[0,-.68,0];
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const pitch=(v)=>Math.atan2(-v[2],-v[1])*180/Math.PI;
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
test('walk both directions raises arms 30–40 degrees, toward the observed target',()=>{
 for(const speed of [-1.2,1.2])for(const side of [-1,1]){
  const a=new ArmCarriage(BASE_MOTION_PROFILE);
  for(let i=0;i<180;i++){a.advanceMotion(dt,speed,speed,false,true);a.advanceAttention(dt,false,0);}
  const p=a.offsets(side,elbow,hand,0);
  assert.ok(pitch(p.elbow)>=30&&pitch(p.elbow)<=40);
  assert.ok(p.hand[2]<-.4);
  for(let i=0;i<90;i++)a.advanceAttention(dt,false,.5);
  const q=a.offsets(side,elbow,hand,0);assert.ok(q.hand[0]>p.hand[0]+.15);
  assert.ok(Math.abs(dist(q.elbow,[0,0,0])-.36)<1e-9);
  assert.ok(Math.abs(dist(q.elbow,q.hand)-.32)<1e-9);
 }
});
test('combat guard bends elbows at chest level; sprint overrides guard smoothly and leans forward',()=>{
 const a=new ArmCarriage(BASE_MOTION_PROFILE);
 for(let i=0;i<180;i++){a.advanceMotion(dt,1.4,1.4,false,true);a.advanceAttention(dt,true,0);}
 const guard=a.offsets(-1,elbow,hand,0);
 assert.ok(Math.abs(guard.hand[1])<.09);assert.ok(guard.hand[2]<-.4);
 let prev=guard;
 for(let i=0;i<180;i++){
  a.advanceMotion(dt,5,5,true,true);a.advanceAttention(dt,true,0);
  const p=a.offsets(-1,elbow,hand,0);
  assert.ok(dist(p.hand,prev.hand)<.16);prev=p;
 }
 assert.ok(pitch(prev.elbow)>=25&&pitch(prev.elbow)<=45);assert.ok(prev.hand[2]<-.43);
 assert.ok(a.runLean>.14);
 const forward=a.offsets(-1,elbow,hand,1),back=a.offsets(-1,elbow,hand,-1);
 assert.ok(forward.hand[2]<back.hand[2]-.06);
 assert.ok(back.hand[2]<0);
});
test('live gait carries arms at steady walk, run and guard without changing bone lengths or feet',()=>{
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:Object.fromEntries(['stance','stalk','aggressive','freeze'].map(k=>[k,referencePose(k)]))});
 const sample=(speed,guard,bearing=0)=>{
  const g=new PatientGait([0,0,0],0,true,motion,patientMotionProfile(7,2,'balanced'));let root=[0,0,0];
  for(let i=0;i<180;i++){
   const d=g.travel(dt,speed,mobility,2,root,0,i*dt,()=>0);
   root=[0,0,root[2]-d];g.advance(root,0,d/dt,dt,()=>0,mobility,ids,undefined,false,0,speed);
   g.advanceExpression(dt,false,'stance',guard,bearing);
  }
  const p=g.pose(2,root,0,3);
  for(const v of p)assert.ok(Math.abs(dist(v.a,v.b)-LAB_SEGMENTS.find(s=>s.id===v.id).nominalLength)<1e-7,v.id);
  const get=id=>p.find(v=>v.id===id),mid=v=>v.a.map((x,i)=>(x+v.b[i])*.5);
  return {arms:['L','R'].map(side=>({upper:sub(get(side+'.upperArm').b,get(side+'.upperArm').a),hand:sub(get(side+'.hand').a,get(side+'.upperArm').a)})),lean:mid(get('chest'))[2]-mid(get('pelvis'))[2]};
 };
 const walk=sample(1.4,false),back=sample(-1.4,false),run=sample(5.7,false),guard=sample(0,true);
 for(const p of [walk,back])for(const a of p.arms)assert.ok(pitch(a.upper)>=29&&pitch(a.upper)<=41);
 for(const a of run.arms)assert.ok(pitch(a.upper)>=24&&pitch(a.upper)<=46);
 for(const a of guard.arms)assert.ok(Math.abs(a.hand[1])<.12);
 assert.ok(run.lean<walk.lean-.06,JSON.stringify({walk,run}));
});

test('guard and run transitions remain bounded in both directions across profile and target angles',()=>{
 for(const lag of [.86,1,1.16])for(const asymmetry of [-1.15,1.15])for(const side of [-1,1])for(const bearing of [-55,0,55])for(const swing of [-1,0,1]){
  const a=new ArmCarriage({...BASE_MOTION_PROFILE,lag,asymmetry});
  let previous=null;
  for(const [speed,running,guard] of [[1.4,false,true],[5,true,true],[1.4,false,true],[-1.4,false,false],[0,false,false]]){
   for(let i=0;i<180;i++){
    a.advanceMotion(dt,speed,speed,running,true);a.advanceAttention(dt,guard,bearing*Math.PI/180);
    const p=a.offsets(side,elbow,hand,swing);
    assert.ok(Math.abs(dist(p.elbow,[0,0,0])-.36)<1e-9);
    assert.ok(Math.abs(dist(p.elbow,p.hand)-.32)<1e-9);
    if(previous)assert.ok(dist(p.hand,previous.hand)<.16,JSON.stringify({lag,asymmetry,side,bearing,swing,speed,running,guard,i,delta:dist(p.hand,previous.hand)}));
    previous=p;
   }
   if(running)assert.ok(pitch(previous.elbow)>=24.99&&pitch(previous.elbow)<=45.01);
  }
 }
});
