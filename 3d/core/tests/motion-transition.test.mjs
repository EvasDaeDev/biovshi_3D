import test from 'node:test';
import assert from 'node:assert/strict';
import {PoseTransition} from '../dist/animation/pose-transition.js';
import {FixedClock,FIXED_DT} from '../dist/fixed-clock.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
test('expressive pose has intermediate weights and exact endpoints',()=>{
 const b=new PoseTransition();assert.deepEqual(b.weights,[1,0,0,0]);
 b.advance('hurt',.05);assert.deepEqual(b.weights,[.5,0,.5,0]);
 b.advance('hurt',.05);assert.deepEqual(b.weights,[0,0,1,0]);
 b.advance('stance',.225);assert.deepEqual(b.weights,[.5,0,.5,0]);
 b.advance('stance',.225);assert.deepEqual(b.weights,[1,0,0,0]);
});
test('interruption starts from current weights, queries do not advance',()=>{
 const b=new PoseTransition();b.advance('hurt',.033);const before=b.weights;
 b.advance('jump',0);assert.deepEqual(b.weights,before);
 for(let i=0;i<9;i++){b.advance('jump',FIXED_DT);const w=b.weights;near(w.reduce((a,v)=>a+v,0),1);assert.ok(w.every(v=>v>=0&&v<=1));assert.deepEqual(w,b.weights);}
 b.advance('jump',FIXED_DT);assert.deepEqual(b.weights,[0,0,0,1]);
});
test('render alpha tracks only residual fixed-clock debt',()=>{
 const c=new FixedClock();let n=0;const step=()=>n++;
 c.advance(FIXED_DT*.5,step);near(c.alpha,.5);assert.equal(n,0);
 c.advance(FIXED_DT,step);near(c.alpha,.5);assert.equal(n,1);
 c.advance(1,step,true);near(c.alpha,.5);assert.equal(n,1);
 c.reset();assert.equal(c.alpha,0);
 for(const hz of [30,60,75,120,144]){const clock=new FixedClock();let ticks=0;for(let i=0;i<hz;i++){clock.advance(1/hz,()=>ticks++);assert.ok(clock.alpha>=0&&clock.alpha<=1);}assert.equal(ticks,60);}
});
