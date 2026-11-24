import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {DebrisWorld} from '../../lab-next/debris.js';
test('detached segment falls, rests on floor, and reset removes bodies',async()=>{
 await RAPIER.init();const world=new DebrisWorld(RAPIER);
 try{
  world.accept({type:'lab-hit'});
  assert.equal(world.snapshot().length,0);
  world.accept({type:'segment-detached',fighterId:0,tick:1,detachedPose:{id:'R.upperArm',a:[0,1.5,0],b:[0,1.14,0],radius:.1}});
  const initial=world.snapshot()[0];assert.ok(initial.position.y>1);
  for(let i=0;i<360;i++)world.step(1/60);
  const settled=world.snapshot()[0];assert.ok(settled.position.y<.5&&settled.position.y>-.05);
  assert.ok(Object.values(settled.position).every(Number.isFinite));
  assert.throws(()=>world.step(1/30));
  world.reset();assert.equal(world.snapshot().length,0);
 }finally{world.dispose();}
});
