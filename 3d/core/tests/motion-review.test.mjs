import test from 'node:test';
import assert from 'node:assert/strict';
import {FixedClock,FIXED_DT} from '../dist/fixed-clock.js';
import {Playback} from '../../lab-next/playback.js';
import {reviewInput,measureMotion} from '../../lab-next/motion-review.js';
test('playback preserves fixed dt at each rate and single-step advances exactly once',()=>{
 for(const rate of [1,.5,.25]){
  const p=new Playback(new FixedClock());p.setRate(rate);let count=0;
  const step=dt=>{assert.equal(dt,FIXED_DT);count++;};
  for(let i=0;i<120;i++)p.advance(1/120,step);
  assert.equal(count,60*rate);
  p.setPaused(true);p.advance(1,step);assert.equal(count,60*rate);
  p.requestStep();p.advance(1,step);assert.equal(count,60*rate+1);assert.equal(p.alpha,1);
  p.advance(1,step);assert.equal(count,60*rate+1);
  p.requestStep();p.advance(1,step,true);p.advance(1,step);assert.equal(count,60*rate+1);
 }
});
test('review uses deterministic commands for two patients and stops permanently',()=>{
 assert.equal(reviewInput(0).phase,'idle');
 assert.equal(reviewInput(90).phase,'walk');
 assert.equal(reviewInput(190).phase,'brake');
 assert.equal(reviewInput(250).phase,'turn');
 assert.equal(reviewInput(310).phase,'burst');
 assert.equal(reviewInput(350).phase,'settle');
 for(let tick=0;tick<1000;tick++)assert.ok(reviewInput(tick).input.commands.every(c=>c.attack===false));
 assert.ok(reviewInput(999).input.commands.every(c=>!c.forward&&!c.turn&&!c.sprint));
});
test('motion diagnostic identifies moving endpoint without treating ownership changes as jumps',()=>{
 const snapshot=(x,state='active')=>({tick:1,fighterIds:[0],lifeStates:[state],rigSegments:[[{id:'head',a:[x,1,0],b:[x,1,0]}]]});
 assert.deepEqual(measureMotion(snapshot(0),snapshot(.1)),{max:.1,segment:'head',fighterId:0,excluded:0,tick:1});
 assert.equal(measureMotion(snapshot(0),snapshot(10,'incapacitated')).excluded,1);
 assert.equal(measureMotion(snapshot(0),snapshot(10,'incapacitated')).max,0);
});
