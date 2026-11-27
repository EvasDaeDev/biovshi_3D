import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readPoseDocument,POSE_SLOTS,referencePose} from '../dist/rig/pose-editor.js';
import {HORROR_POSES} from '../dist/animation/horror-poses.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {PatientGait} from '../dist/rig/gait.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const doc=readPoseDocument(JSON.parse(await readFile(new URL('../../lab-next/patient-poses.json',import.meta.url),'utf8')));
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('new editable silhouettes match the authored rotation presets; legacy partial documents still load',()=>{
 assert.equal(Object.keys(doc.slots).length,Object.keys(POSE_SLOTS).length);
 for(const [slot,rotations] of Object.entries(HORROR_POSES)){
  for(const p of referencePose(slot))assert.deepEqual(p.rotation,rotations[p.id]??[0,0,0]);
  assert.equal(referencePose(slot).length,17);
 }
 assert.ok(readPoseDocument({schemaVersion:1,stature:1.65,slots:{stance:doc.slots.stance}}).slots.stance);
});
test('blended horror silhouettes differ without changing nominal bone lengths or adding anatomy',()=>{
 const gait=new PatientGait([0,0,0],0,true,compileAuthoredMotion(doc)),p0=gait.pose(0,[0,0,0],0,0);
 for(const slot of ['stalk','aggressive','freeze']){
  gait.advanceExpression(.5,false,slot);
  const p=gait.pose(0,[0,0,0],0,0);
  assert.equal(p.length,p0.length);
  assert.ok(p.some((v,i)=>dist(v.b,p0[i].b)>.025),slot);
  for(const part of p)assert.ok(Math.abs(dist(part.a,part.b)-LAB_SEGMENTS.find(s=>s.id===part.id).nominalLength)<1e-7,part.id);
 }
});
