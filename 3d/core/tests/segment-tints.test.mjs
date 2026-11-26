import test from 'node:test';
import assert from 'node:assert/strict';
import {SegmentTints,segmentTint} from '../../lab-next/segment-tints.js';
test('v1 normal/critical flash timings are local to the actual damaged segment',()=>{
 assert.equal(segmentTint(0,false),.4);assert.equal(segmentTint(.299,false),.4);assert.equal(segmentTint(.30,false),0);
 assert.equal(segmentTint(0,true),1);assert.equal(segmentTint(.24,true),.5);assert.equal(segmentTint(.48,true),0);
 const t=new SegmentTints(),event={type:'fighter-damaged',fighterId:0,segmentId:'R.upperArm',tick:10,critical:false};
 t.record([event],[],[],10);
 assert.equal(t.sample(0,'R.upperArm',10).strength,.4);assert.equal(t.sample(0,'R.lowerArm',10).strength,0);assert.equal(t.sample(1,'R.upperArm',10).strength,0);
 t.record([{...event,tick:12,critical:true}],[],[],12);
 assert.equal(t.sample(0,'R.upperArm',12).strength,1);assert.equal(t.sample(0,'R.upperArm',12).critical,true);
 t.reset();assert.equal(t.sample(0,'R.upperArm',12).strength,0);
});
test('newly detached hit segment retains tint but archived and sibling pieces do not',()=>{
 const t=new SegmentTints(),event={type:'fighter-damaged',fighterId:0,segmentId:'R.upperArm',tick:30,critical:true};
 const old={id:'archive:0',fighterId:0,segmentId:'R.upperArm'},fresh={...old,id:'branch:1:R.upperArm'},sibling={...old,id:'branch:1:R.lowerArm',segmentId:'R.lowerArm'};
 t.record([event],[old],[old,fresh,sibling],30);
 assert.equal(t.sample(fresh.id,fresh.segmentId,30,true).strength,1);
 assert.equal(t.sample(old.id,old.segmentId,30,true).strength,0);
 assert.equal(t.sample(sibling.id,sibling.segmentId,30,true).strength,0);
 t.record([], [old,fresh,sibling],[old,fresh,sibling],60);
 assert.equal(t.sample(fresh.id,fresh.segmentId,60,true).strength,0);
});
