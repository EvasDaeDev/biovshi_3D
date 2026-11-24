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
  assert.equal(world.snapshot().length,0);const [m]=world.moundSnapshot();assert.ok(m);
  assert.ok(m.height>=.08&&m.height<=.30);assert.ok(m.radius>=.30&&m.radius<=.77);
  assert.ok(Number.isFinite(m.x)&&Number.isFinite(m.z));assert.equal(world.moundSnapshot().length,1);
  for(let i=0;i<120;i++)world.step(1/60);assert.equal(world.moundSnapshot().length,1);
  m.height=999;assert.ok(world.moundSnapshot()[0].height<=.30);
  assert.throws(()=>world.step(1/30));world.accept({...event,tick:2});
  world.reset();assert.equal(world.snapshot().length,0);assert.equal(world.moundSnapshot().length,0);
 }finally{world.dispose();}
});
