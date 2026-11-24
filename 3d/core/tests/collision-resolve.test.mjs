import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCollisions} from '../dist/collision/resolve.js';
import {LabSimulationCore,FIXED_DT} from '../dist/index.js';
const actor=(id,x,z=0)=>({id,x,y:0,z});
const pose=a=>[{id:'torso',a:[a.x,1,a.z],b:[a.x,1.5,a.z],radius:.235}];
test('overlapping actors separate without vertical motion',()=>{
 const a=actor(0,0),b=actor(1,.2);const stats=resolveCollisions([a,b],pose);
 assert.ok(b.x-a.x>.2);assert.ok(stats.contacts>0);assert.equal(a.y,0);assert.equal(b.y,0);
 assert.ok(Math.abs(a.x+b.x-.2)<1e-9);
});
test('broad phase skips distant actors; coincident roots stay finite',()=>{
 const a=actor(0,-3),b=actor(1,3);assert.equal(resolveCollisions([a,b],pose).tests,0);
 a.x=b.x=0;resolveCollisions([a,b],pose);assert.ok(Number.isFinite(a.x)&&Number.isFinite(b.x));assert.ok(a.x>b.x);
});
test('wall correction is bounded and applies to capsule endpoints',()=>{
 const a=actor(0,5.65);const high=a=>[{id:'head',a:[a.x+.7,4.3,0],b:[a.x+.7,4.3,0],radius:.19}];
 const s=resolveCollisions([a],high);assert.equal(s.wallContacts,3);assert.ok(Math.abs(a.x-5.35)<1e-9);
});
test('live core resolves contact and reports independent diagnostics',()=>{
 const c=new LabSimulationCore();c.initialize({seed:1,fighters:[0,1].map(id=>({id,origin:[id*.2,0,0],yawRad:0,segmentIds:['torso']}))});
 c.step(FIXED_DT,{commands:[0,1].map(fighterId=>({fighterId,forward:0,turn:0,sprint:false}))});
 const s=c.getSnapshot();assert.ok(s.roots[4]-s.roots[0]>.2);assert.ok(s.collisionStats.contacts>0);
 s.collisionStats.contacts=999;assert.notEqual(c.getSnapshot().collisionStats.contacts,999);
});
