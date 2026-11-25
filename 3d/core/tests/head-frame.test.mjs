import test from 'node:test';
import assert from 'node:assert/strict';
import {headFrame,headCameraPosition,HEAD_CAMERA_CLEARANCE} from '../dist/rig/head-frame.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
const head=(radius=.15)=>({id:'head',a:[0,1.5,0],b:[0,1.5,0],radius});
const neck=(axis=[0,1,0])=>({id:'neck',a:[0,1,0],b:axis.map((v,i)=>v+[0,1,0][i]),radius:.06});
test('head gaze independent of body heading',()=>{const h=headFrame([head(),neck()],Math.PI/2);h.forward.forEach((v,i)=>near(v,[1,0,0][i]));near(headCameraPosition(h)[1],1.7);});
test('orthonormal frame and exact crown clearance at any scale and tilt',()=>{
 for(const radius of [.08,.15,.22])for(const axis of [[0,1,0],[.4,.5,.3],[0,0,1],[1,0,0],[0,-1,0]]){
  const h=headFrame([head(radius),neck(axis)],0),p=headCameraPosition(h);
  near(Math.hypot(...h.forward),1);near(Math.hypot(...h.up),1);near(h.up.reduce((n,v,i)=>n+v*h.forward[i],0),0);
  near(Math.hypot(...p.map((v,i)=>v-h.center[i]-h.up[i]*radius)),HEAD_CAMERA_CLEARANCE);
 }
});
test('missing head returns null; missing neck has stable upright fallback',()=>{assert.equal(headFrame([neck()],0),null);assert.deepEqual(headFrame([head()],0).up,[0,1,0]);});
