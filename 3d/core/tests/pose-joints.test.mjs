import test from 'node:test';
import assert from 'node:assert/strict';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
import {buildEditedPose,readPoseDocument,referencePose} from '../dist/rig/pose-editor.js';
import {poseJointAnchor} from '../dist/rig/pose-joints.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';

const midpoint=part=>part.a.map((value,i)=>(value+part.b[i])/2);
const distance=(a,b)=>Math.hypot(...a.map((value,i)=>value-b[i]));

test('the T-pose has a level symmetric arm span and a 1.65 m collider envelope',()=>{
 const segments=referencePose('tPose');
 const {slots}=readPoseDocument({schemaVersion:1,stature:1.65,slots:{tPose:segments}});
 const rig=buildEditedPose(slots.tPose);
 assert.equal(rig.length,LAB_SEGMENTS.length);
 const top=Math.max(...rig.map(p=>Math.max(p.a[1],p.b[1])+p.radius));
 const bottom=Math.min(...rig.map(p=>Math.min(p.a[1],p.b[1])-p.radius));
 assert.ok(Math.abs(top-1.65)<1e-8&&Math.abs(bottom)<1e-8);
 const [left,right]=['L.hand','R.hand'].map(id=>rig.find(p=>p.id===id).a);
 assert.ok(Math.abs(left[0]+right[0])<1e-8&&Math.abs(left[1]-right[1])<1e-8&&left[0]<-.8&&right[0]>.8);
 const joints=new Map(rig.map(part=>[part.id,part]));
 for(const [id,parent] of [['chest','abdomen'],['head','neck'],['L.foot','L.lowerLeg'],['R.foot','R.lowerLeg']]){
  const part=joints.get(id);
  const anchor=poseJointAnchor(part,joints);
  assert.deepEqual(anchor,joints.get(parent).b);
  if(id==='chest'||id==='head')assert.ok(distance(midpoint(part),anchor)>.05);
 }
});

test('rotating the chest or skull in a saved slot sweeps its centre around the parent socket',()=>{
 const parts=referencePose('tPose'),doc=tPose=>({schemaVersion:1,stature:1.65,slots:{tPose}});
 const base=compileAuthoredMotion(doc(parts)).tPose;
 for(const [id,parent] of [['chest','abdomen'],['head','neck']]){
  const edited=compileAuthoredMotion(doc(parts.map(part=>part.id===id?{...part,rotation:[.5,0,0]}:part))).tPose;
  assert.deepEqual(edited.get(parent),base.get(parent));
  const anchor=base.get(parent).b;
  assert.ok(distance(midpoint(base.get(id)),midpoint(edited.get(id)))>.04);
  assert.ok(Math.abs(distance(midpoint(base.get(id)),anchor)-distance(midpoint(edited.get(id)),anchor))<1e-8);
 }
});

test('custom collider size round-trips independently of the edited bone length',()=>{
 const parts=referencePose('tPose'),id='L.upperArm';
 const parse=values=>readPoseDocument({schemaVersion:1,pivotVersion:2,stature:1.65,slots:{tPose:values}});
 const original=parse(parts),edited=parse(parts.map(p=>p.id===id?{...p,collider:{radius:.075,length:.2}}:p));
 assert.deepEqual(buildEditedPose(edited.slots.tPose),buildEditedPose(original.slots.tPose));
 assert.deepEqual(parse(edited.slots.tPose).slots.tPose.find(p=>p.id===id).collider,{radius:.075,length:.2});
 const extended=parse(edited.slots.tPose.map(p=>p.id===id?{...p,length:p.length+.12}:p));
 const rig=buildEditedPose(extended.slots.tPose),byId=new Map(rig.map(p=>[p.id,p]));
 assert.ok(Math.abs(distance(byId.get(id).a,byId.get(id).b)-extended.slots.tPose.find(p=>p.id===id).length)<1e-8);
 assert.deepEqual(byId.get('L.lowerArm').a,byId.get(id).b);
 assert.deepEqual(extended.slots.tPose.find(p=>p.id===id).collider,{radius:.075,length:.2});
 assert.throws(()=>parse(parts.map(p=>p.id==='head'?{...p,collider:{length:.1}}:p)),/коллайдера/);
});
