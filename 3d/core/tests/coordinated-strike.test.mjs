import test from 'node:test';
import assert from 'node:assert/strict';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {punchPose} from '../dist/combat/strike.js';
import {firstStrikeContact} from '../dist/combat/swept-contact.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const slots=Object.fromEntries(['stance','stalk','punch','kick','headbutt'].map(k=>[k,referencePose(k)]));
const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots});
const gait=new PatientGait([0,0,0],0,true,motion),base=gait.pose(0,[0,0,0],0,0);
const get=(p,id)=>p.find(v=>v.id===id);
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const center=p=>p.a.map((v,i)=>(v+p.b[i])*.5);
test('coordinated strikes preserve anatomy and return to base without major boundary jumps',()=>{
 for(const kind of ['arm','leg','head']){
  const p={kind,side:'L',targetId:1,start:0,yaw:0,aim:kind==='arm'?[-.3,1.3,-.5]:kind==='leg'?[-.2,.45,-.45]:[0,1.6,-.4]};
  let prev=base;
  for(let tick=0;tick<=48;tick++){
   const pose=punchPose(base,p,tick,()=>0,motion);
   for(const v of pose){
    assert.ok(Math.abs(dist(v.a,v.b)-LAB_SEGMENTS.find(d=>d.id===v.id).nominalLength)<1e-7,v.id);
    assert.ok(dist(v.a,get(prev,v.id).a)<.30,kind+' '+tick+' '+v.id);
   }
   assert.ok(dist(get(pose,'chest').a,get(pose,'L.upperArm').a)<1e-8);
   assert.ok(dist(get(pose,'chest').b,get(pose,'R.upperArm').a)<1e-8);
   assert.ok(dist(center(get(pose,'chest')),get(pose,'neck').a)<1e-8);
   assert.ok(Math.abs(dist(get(pose,'abdomen').b,center(get(pose,'chest')))-.14)<1e-7);
   if(kind==='leg')assert.ok(dist(get(pose,'R.foot').a,get(base,'R.foot').a)<.025);
   else for(const side of ['L','R'])assert.deepEqual(get(pose,side+'.foot'),get(base,side+'.foot'));
   prev=pose;
  }
  assert.deepEqual(prev,base);
 }
});
test('low arm strike inclines torso farther than a high strike without moving the feet',()=>{
 const punch={kind:'arm',side:'L',targetId:1,start:0,yaw:0,aim:[-.3,1.6,-.5]};
 const high=punchPose(base,punch,31,()=>0,motion);
 const low=punchPose(base,{...punch,aim:[-.3,.25,-.5]},31,()=>0,motion);
 assert.ok(center(get(low,'chest'))[2]<center(get(high,'chest'))[2]-.05);
 assert.deepEqual(get(low,'L.foot'),get(base,'L.foot'));
});

test('a straight single punch advances its striking shoulder with a pronounced chest turn',()=>{
 const chestAngle=pose=>{
  const c=get(pose,'chest');
  return Math.atan2(c.b[2]-c.a[2],c.b[0]-c.a[0]);
 };
 for(const [side,sign] of [['L',1],['R',-1]]){
  const p={kind:'arm',side,targetId:1,start:0,yaw:0,aim:[0,1.50,-.87]};
  const loaded=punchPose(base,p,19,()=>0,motion),extended=punchPose(base,p,31,()=>0,motion);
  const turn=sign*(chestAngle(extended)-chestAngle(loaded));
  assert.ok(turn>.70,JSON.stringify({side,turn}));
  assert.ok(get(loaded,side+'.upperArm').a[2]-get(extended,side+'.upperArm').a[2]>.20);
 }
});

test('straight punch transfers weight through the knees and hips before the arm settles',()=>{
 const punch={kind:'arm',side:'L',targetId:1,start:0,yaw:0,aim:[-.25,1.55,-1]};
 const sample=tick=>punchPose(base,punch,tick,()=>0,motion);
 const loaded=sample(19),extended=sample(31),recovering=sample(39);
 const pelvis=pose=>center(get(pose,'pelvis'));
 assert.ok(pelvis(loaded)[2]>pelvis(base)[2]+.02);
 assert.ok(pelvis(extended)[2]<pelvis(base)[2]-.10);
 assert.ok(pelvis(recovering)[2]<pelvis(base)[2]-.05);
 for(const side of ['L','R']){
  assert.deepEqual(get(extended,side+'.foot'),get(base,side+'.foot'));
  assert.ok(dist(get(extended,side+'.upperLeg').b,get(loaded,side+'.upperLeg').b)>.05);
 }
 const relativeHand=pose=>get(pose,'R.hand').a[2]-get(pose,'R.upperArm').a[2];
 assert.ok(relativeHand(extended)>relativeHand(loaded)+.08);
});

test('the edited punch torso pitch reaches the shared attack pose',()=>{
 const edit=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:{...slots,punch:slots.punch.map(part=>
  part.id==='chest'?{...part,rotation:[(part.rotation?.[0]??0)-.40,part.rotation?.[1]??0,part.rotation?.[2]??0]}:part
 )}});
 const p={kind:'arm',side:'L',targetId:1,start:0,yaw:0,aim:[-.25,1.55,-1]};
 const pitch=pose=>{
  const chest=center(get(pose,'chest')),end=get(pose,'abdomen').b;
  return Math.atan2(end[2]-chest[2],chest[1]-end[1]);
 };
 const stock=punchPose(base,p,31,()=>0,motion),adjusted=punchPose(base,p,31,()=>0,edit);
 assert.ok(pitch(adjusted)-pitch(stock)>.25);
 assert.deepEqual(get(adjusted,'L.foot'),get(stock,'L.foot'));
});

test('the side swing opens the elbow at full reach before it folds back',()=>{
 for(const side of ['L','R']){
  const p={kind:'arm',side,targetId:1,start:0,yaw:0,aim:[0,1.45,-.53]};
  const sample=tick=>punchPose(base,p,tick,()=>0,motion);
  const reach=pose=>dist(get(pose,side+'.upperArm').a,get(pose,side+'.hand').a);
  const peak=sample(31),hand=get(peak,side+'.hand').a;
  assert.ok(reach(sample(19))<.56);
  assert.ok(reach(peak)>.675,JSON.stringify({side,reach:reach(peak)}));
  assert.ok(reach(sample(34))>.635);
  assert.ok(reach(sample(39))<.65,JSON.stringify({side,reach:reach(sample(39))}));
  assert.deepEqual(sample(48),base);
  const target={id:'head',a:hand,b:hand,radius:.02};
  assert.ok(dist(p.aim,hand)>.20);
  assert.equal(firstStrikeContact(sample(27),peak,[target],[target],side),'head');
 }
});
