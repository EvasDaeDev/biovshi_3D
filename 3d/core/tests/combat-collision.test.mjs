import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCollisions} from '../dist/collision/resolve.js';
const actors=()=>[{id:0,x:0,y:0,z:0},{id:1,x:0,y:0,z:1.6}];
const limbPose=a=>[{id:'L.foot',a:[0,.13,.8],b:[0,.13,.8],radius:.13}];
test('combat limb contacts do not push whole fighters beyond attack reach',()=>{
 const a=actors(),hits=[];
 const s=resolveCollisions(a,limbPose,hits,true);
 assert.ok(s.contacts>0&&hits.length>0);
 assert.deepEqual(a,actors());
 const b=actors();resolveCollisions(b,limbPose);
 assert.notDeepEqual(b,actors(),'lab full-capsule correction is preserved');
});
test('combat central collisions and physical obstacles still separate roots',()=>{
 const a=[{id:0,x:0,y:0,z:0},{id:1,x:.2,y:0,z:0}];
 const pose=a=>[{id:'chest',a:[a.x,1,0],b:[a.x,1.3,0],radius:.235}];
 resolveCollisions(a,pose,undefined,true);
 assert.ok(a[0].x<0&&a[1].x>.2);
 const b=[{id:0,x:0,y:0,z:0},{id:1,x:.2,y:0,z:0,fixed:true}];
 resolveCollisions(b,a=>[{...pose(a)[0],id:'L.foot'}],undefined,true);
 assert.ok(b[0].x<0);assert.equal(b[1].x,.2);
});
