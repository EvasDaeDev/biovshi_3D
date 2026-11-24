import test from 'node:test';
import assert from 'node:assert/strict';
import {boneFrame} from '../dist/rig/bone-frame.js';
import {LAB_SEGMENTS,severingChain} from '../dist/rig/anatomy.js';
import {createLabConfig} from '../dist/lab-config.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
test('bone frames remain orthonormal and right handed including degenerate axes',()=>{
 for(const b of [[0,1,0],[0,-1,0],[0,0,-1],[0,0,1],[1,0,0],[1,2,3],[0,0,0]]){
  const f=boneFrame([0,0,0],b);
  for(const axis of [f.x,f.y,f.z])near(dot(axis,axis),1);
  near(dot(f.x,f.y),0);near(dot(f.x,f.z),0);near(dot(f.y,f.z),0);
  near(dot(cross(f.x,f.y),f.z),1);near(f.length,Math.hypot(...b));
  if(f.length)near(dot(f.y,b),f.length);
 }
});
test('bone center and projected forward match lab convention',()=>{
 const f=boneFrame([1,2,3],[1,4,3]);assert.deepEqual(f.center,[1,3,3]);near(f.z[2],-1);
 assert.throws(()=>boneFrame([NaN,0,0],[0,1,0]));
});
test('anatomy preserves capsule IDs, order, dimensions and severing dependencies',()=>{
 assert.equal(LAB_SEGMENTS.length,15);assert.equal(new Set(LAB_SEGMENTS.map(s=>s.id)).size,15);
 assert.deepEqual(createLabConfig(1).fighters[0].segmentIds,LAB_SEGMENTS.map(s=>s.id));
 assert.deepEqual(severingChain('R.upperArm'),['R.upperArm','R.lowerArm','R.hand']);
 assert.deepEqual(severingChain('L.lowerLeg'),['L.lowerLeg','L.foot']);
 assert.deepEqual(severingChain('neck'),['neck','head']);assert.deepEqual(severingChain('torso'),[]);
 assert.equal(LAB_SEGMENTS.find(s=>s.id==='L.upperLeg').radius,.124);
});
