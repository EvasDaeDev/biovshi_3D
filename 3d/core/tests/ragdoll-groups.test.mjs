import test from 'node:test';
import assert from 'node:assert/strict';
import {ragdollCollisionGroups,RAGDOLL_SLOTS,collapseDirection} from '../../lab-next/ragdoll.js';
const interacts=(a,b)=>!!((a>>>16)&(b&65535))&&!!((b>>>16)&(a&65535));
test('settling ragdoll relaxes only its own contacts, retaining terrain, debris and other casualties',()=>{
 for(let i=0;i<RAGDOLL_SLOTS;i++){
  const active=ragdollCollisionGroups(i),relaxed=ragdollCollisionGroups(i,false);
  assert.ok(interacts(active,active));assert.ok(!interacts(relaxed,relaxed));
  assert.ok(!interacts(active,relaxed));
  for(const other of [0x00010006,0x00020005,0xffffffff]){
   assert.ok(interacts(active,other));assert.ok(interacts(relaxed,other));
  }
  for(let j=0;j<RAGDOLL_SLOTS;j++)if(i!==j){
   assert.ok(interacts(relaxed,ragdollCollisionGroups(j,false)));
   assert.ok(interacts(relaxed,ragdollCollisionGroups(j,true)));
  }
 }
});

test('collapse direction follows actual torso tilt instead of the old hit',()=>{
 for(const axis of [[.3,.5,0],[-.3,.5,0],[0,.5,-.3],[.3,-.5,0],[0,-.5,-.3]])for(let i=0;i<3;i++){
  const d=collapseDirection(axis,0,1,i);
  const dy=-d.x*axis[0]-d.z*axis[2];
  assert.ok(axis[1]*dy<0,JSON.stringify({axis,d}));
  assert.ok(Math.abs(Math.hypot(d.x,d.z)-1)<1e-9);
 }
 assert.deepEqual(collapseDirection([0,1,0],0,1),{x:0,z:1});
});
