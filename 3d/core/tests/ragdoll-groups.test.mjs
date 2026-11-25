import test from 'node:test';
import assert from 'node:assert/strict';
import {ragdollCollisionGroups,RAGDOLL_SLOTS} from '../../lab-next/ragdoll.js';
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
