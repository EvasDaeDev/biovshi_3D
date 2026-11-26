import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntState} from '../dist/combat/hunt-state.js';
const input={tick:0,targetId:2,distance:2,visible:true,clear:true,aligned:true,exposed:false,grounded:false,urgent:false,interrupted:false};
const phase=h=>h.snapshot().phase;
test('hunt observes specific target, stalks facing foe and bursts only on opening',()=>{
 const h=new HuntState(7,0);
 assert.equal(h.advance(input).pace,0);assert.equal(phase(h),'observe');
 let tick=h.snapshot().until;
 assert.equal(h.advance({...input,tick}).sprint,false);assert.equal(phase(h),'stalk');
 assert.equal(h.advance({...input,tick:++tick,exposed:true}).sprint,true);assert.equal(phase(h),'burst');
 assert.equal(h.advance({...input,tick:++tick,exposed:true,clear:false}).sprint,false);assert.equal(phase(h),'recover');
 tick=h.snapshot().until;
 h.advance({...input,tick});assert.equal(phase(h),'stalk');
});
test('lost sight and changing target reset observation; close and grounded previews remain available',()=>{
 const h=new HuntState(7,1);
 h.advance(input);h.advance({...input,tick:100,visible:false});assert.equal(phase(h),'search');assert.equal(h.snapshot().targetId,null);
 h.advance({...input,tick:101,targetId:3});assert.equal(phase(h),'observe');
 h.advance({...input,tick:102,targetId:3,distance:1});assert.equal(phase(h),'engage');
 h.advance({...input,tick:103,targetId:4,distance:2.5,grounded:true});assert.equal(phase(h),'engage');
 h.reset(104,'flee');assert.equal(phase(h),'flee');
 h.advance({...input,tick:105,urgent:true});assert.equal(phase(h),'engage');
});
test('seeded hunt is deterministic and no global periodic burst against attentive target',()=>{
 const a=new HuntState(42,5),b=new HuntState(42,5);
 for(let tick=0;tick<600;tick++){
  const f={...input,tick};
  assert.deepEqual(a.advance(f),b.advance(f));assert.deepEqual(a.snapshot(),b.snapshot());
  assert.notEqual(phase(a),'burst');
 }
});
