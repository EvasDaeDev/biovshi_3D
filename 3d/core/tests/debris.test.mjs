import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {DebrisWorld} from '../../lab-next/debris.js';
const event={type:'segment-detached',fighterId:0,tick:1,detachedPose:{id:'R.upperArm',a:[0,1.5,0],b:[0,1.14,0],radius:.1}};
test('real Rapier: fall, bake once, reset both states',async()=>{
 await RAPIER.init();const world=new DebrisWorld(RAPIER);
 try{
  world.accept({type:'lab-hit'});assert.equal(world.snapshot().length,0);
  world.accept(event);assert.ok(world.snapshot()[0].position.y>1);
  for(let i=0;i<15;i++)world.step(1/60);
  assert.ok(world.snapshot()[0].position.y<1.32);
  for(let i=0;i<900;i++)world.step(1/60);
  const [visible]=world.snapshot();assert.equal(world.snapshot().length,1);assert.ok(visible.settled);assert.equal(visible.segmentId,'R.upperArm');assert.ok(Math.abs(visible.length-.36)<1e-9);const [m]=world.moundSnapshot();assert.ok(m);assert.equal(m.source,'segment');
  assert.ok(m.height>0&&m.height<=.30);assert.ok(m.radius>=.30&&m.radius<=.77);
  assert.ok(Number.isFinite(m.x)&&Number.isFinite(m.z));assert.equal(world.moundSnapshot().length,1);
  for(let i=0;i<120;i++)world.step(1/60);assert.equal(world.moundSnapshot().length,1);assert.deepEqual(world.snapshot()[0],visible);visible.position.x=999;assert.notEqual(world.snapshot()[0].position.x,999);
  m.height=999;assert.ok(world.moundSnapshot()[0].height<=.30);
  assert.throws(()=>world.step(1/30));world.accept({...event,tick:2});
  world.reset();assert.equal(world.snapshot().length,0);assert.equal(world.moundSnapshot().length,0);
 }finally{world.dispose();}
});

test('real Rapier: differently sized settled spheres produce different mound heights',async()=>{
 await RAPIER.init();const world=new DebrisWorld(RAPIER);
 try{
  for(const [id,x,radius] of [[0,-2,.06],[1,2,.13]])world.accept({type:'segment-detached',fighterId:id,tick:1,detachedPose:{id:'hand',a:[x,1,0],b:[x,1,0],radius}});
  for(let i=0;i<960;i++)world.step(1/60);
  assert.equal(world.snapshot().length,2);assert.ok(world.snapshot().every(d=>d.settled));assert.deepEqual(world.snapshot().map(d=>d.radius).sort(),[.06,.13]);
  const mounds=world.moundSnapshot().sort((a,b)=>a.id-b.id);assert.equal(mounds.length,2);
  assert.ok(Math.abs(mounds[0].height-.12)<.015,JSON.stringify(mounds[0]));
  assert.ok(Math.abs(mounds[1].height-.26)<.015,JSON.stringify(mounds[1]));
  assert.ok(mounds[1].height>mounds[0].height+.10);
 }finally{world.dispose();}
});
