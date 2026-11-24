import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedClock, FIXED_DT } from '../dist/fixed-clock.js';
import { capsuleContact } from '../dist/collision/capsule-contact.js';
const point = (x,y=0,z=0) => ({x,y,z});
const cap = (a,b,r=.5) => ({a,b,r});
test('60 Hz clock gives same tick count at 30, 60 and 120 FPS', () => {
  for (const hz of [30,60,120]) {
    const clock = new FixedClock(); let n=0;
    for(let i=0;i<hz;i++) clock.advance(1/hz,dt=>{assert.equal(dt,FIXED_DT);n++;});
    assert.equal(n,60);
  }
});
test('pause, reset, clamped long frame and invalid elapsed', () => {
  const clock = new FixedClock(); let n=0; const step=()=>n++;
  clock.advance(FIXED_DT/2,step);
  clock.advance(10,step,true); assert.equal(n,0);
  clock.reset(); clock.advance(FIXED_DT/2,step); assert.equal(n,0);
  clock.advance(10,step); assert.equal(n,5);
  assert.throws(()=>clock.advance(NaN,step));
});
test('capsule separation, tangency and sphere overlap', () => {
  const a=cap(point(0),point(0));
  assert.equal(capsuleContact(a,cap(point(2),point(2))),null);
  assert.equal(capsuleContact(a,cap(point(1),point(1))),null);
  assert.equal(capsuleContact(a,cap(point(.5),point(.5))).penetration,.5);
});
test('crossing, parallel and degenerate axes', () => {
  const a=cap(point(-1),point(1));
  assert.equal(capsuleContact(a,cap(point(0,-1),point(0,1))).penetration,1);
  assert.equal(capsuleContact(a,cap(point(-1,.5),point(1,.5))).penetration,.5);
  assert.equal(capsuleContact(a,cap(point(0,.5),point(0,.5))).penetration,.5);
  assert.equal(capsuleContact(cap(point(0,.5),point(0,.5)),a).penetration,.5);
});
