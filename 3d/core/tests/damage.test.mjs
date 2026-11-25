import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT,DamageState,DAMAGE} from '../dist/index.js';
const f=createLabConfig(7).fighters[0],idle={commands:[]};
const make=()=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});return c;};
const health=(c,id)=>c.getSnapshot().health[0].segments.find(p=>p.id===id);
const wait=c=>{for(let i=0;i<17;i++)c.step(FIXED_DT,idle);};
const hit=(c,id,amount=1)=>c.applyDamage({fighterId:0,segmentId:id,amount});
test('native segment HP, critical hit, fixed-tick invulnerability and independent segments',()=>{
 const c=make();
 assert.equal(health(c,'head').hp,6);assert.equal(health(c,'pelvis').hp,4);assert.equal(health(c,'R.upperArm').hp,3);
 assert.equal(hit(c,'R.upperArm',2),true);assert.equal(health(c,'R.upperArm').hp,1);
 assert.equal(hit(c,'R.upperArm'),false);assert.equal(hit(c,'L.hand'),true);
 for(let i=0;i<16;i++)c.step(FIXED_DT,idle);assert.equal(hit(c,'R.upperArm'),false);
 c.step(FIXED_DT,idle);assert.equal(hit(c,'R.upperArm'),true);
 const ev=c.drainEvents();assert.equal(ev.filter(e=>e.type==='fighter-damaged').length,3);assert.equal(ev[0].critical,true);
 assert.equal(c.getSnapshot().health[0].trauma,4);
 assert.ok(['R.upperArm','R.lowerArm','R.hand'].every(id=>!health(c,id).attached&&health(c,id).hp===0));
 assert.equal(ev.filter(e=>e.type==='segment-detached').length,3);
 assert.equal(hit(c,'R.hand'),false);
});
test('head loss and torso failure trigger terminal physics after detachment',()=>{
 for(const [id,amount,cause] of [['head',99,'head-loss'],['chest',99,'torso-failure'],['neck',99,'head-loss']]){
  const c=make();assert.equal(hit(c,id,amount),true);
  const s=c.getSnapshot(),events=c.drainEvents(),terminal=events.at(-1);
  assert.equal(s.lifeStates[0],'incapacitated');assert.equal(s.health[0].cause,cause);assert.equal(terminal.type,'fighter-incapacitated');assert.equal(terminal.cause,cause);
  assert.deepEqual(terminal.bodyPose.map(p=>p.id),s.rigSegments[0].map(p=>p.id));
  assert.equal(health(c,id).hp,0);assert.equal(health(c,id).attached,id==='chest');
  assert.equal(hit(c,'L.hand'),false);
 }
});
test('trauma counts actual HP only, head weighted, does not count descendants',()=>{
 const state=new DamageState(f.segmentIds);
 assert.equal(state.apply('head',2,0).amount,2);
 assert.equal(state.snapshot().trauma,3);
 assert.equal(state.apply('R.upperArm',99,0).amount,3);
 assert.equal(state.snapshot().trauma,6);
 assert.equal(state.snapshot().segments.find(p=>p.id==='R.hand').hp,0);
 const c=make();
 // Damage many different parts without destroying head or central torso.
 for(const id of ['head','pelvis','abdomen','chest','neck','L.upperLeg','L.lowerLeg','L.foot','R.upperLeg','R.lowerLeg','R.foot','L.upperArm','L.lowerArm','L.hand','R.upperArm','R.lowerArm','R.hand']){
  if(c.getSnapshot().lifeStates[0]==='active')hit(c,id,id==='neck'?1:2);
 }
 assert.equal(c.getSnapshot().health[0].cause,'trauma');
 assert.ok(c.getSnapshot().health[0].trauma>=DAMAGE.traumaThreshold);
 assert.equal(c.getSnapshot().rigSegments[0].length,17);
});
test('damage-induced loss of leg changes locomotion; snapshots and reset own health',()=>{
 const c=make();assert.equal(hit(c,'L.upperLeg',3),true);assert.equal(c.getSnapshot().mobilityModes[0],'single-support');
 const s=c.getSnapshot();s.health[0].segments[0].hp=999;assert.notEqual(health(c,'pelvis').hp,999);
 wait(c);assert.equal(hit(c,'R.upperLeg',3),true);assert.equal(c.getSnapshot().mobilityModes[0],'arm-crawl');
 assert.throws(()=>hit(c,'head',NaN));assert.throws(()=>hit(c,'head',0));
 c.initialize({seed:7,fighters:[f]});assert.equal(health(c,'L.upperLeg').hp,3);assert.equal(c.getSnapshot().health[0].trauma,0);
});
