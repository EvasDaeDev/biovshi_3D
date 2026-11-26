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
 assert.equal(health(c,'head').hp,8);assert.equal(health(c,'pelvis').hp,5);assert.equal(health(c,'R.upperArm').hp,4);
 assert.equal(hit(c,'R.upperArm',2),true);assert.equal(health(c,'R.upperArm').hp,2);
 assert.equal(hit(c,'R.upperArm'),false);assert.equal(hit(c,'L.hand'),true);
 for(let i=0;i<16;i++)c.step(FIXED_DT,idle);assert.equal(hit(c,'R.upperArm'),false);
 c.step(FIXED_DT,idle);assert.equal(hit(c,'R.upperArm'),true);assert.equal(health(c,'R.upperArm').hp,1);
 wait(c);assert.equal(hit(c,'R.upperArm'),true);
 const ev=c.drainEvents();assert.equal(ev.filter(e=>e.type==='fighter-damaged').length,4);assert.equal(ev[0].critical,true);
 assert.equal(c.getSnapshot().health[0].trauma,5);
 assert.ok(['R.upperArm','R.lowerArm','R.hand'].every(id=>!health(c,id).attached&&health(c,id).hp===0));
 const cuts=ev.filter(e=>e.type==='segment-detached');assert.equal(cuts.length,1);assert.deepEqual(cuts[0].detachedParts.map(p=>p.id),['R.upperArm','R.lowerArm','R.hand']);assert.equal(c.getSnapshot().damageStats.detached,3);
 assert.equal(hit(c,'R.hand'),false);
});
test('head loss triggers terminal physics after detachment',()=>{
 for(const [id,amount,cause] of [['head',99,'head-loss'],['neck',99,'head-loss']]){
  const c=make();assert.equal(hit(c,id,amount),true);
  const s=c.getSnapshot(),events=c.drainEvents(),terminal=events.at(-1);
  assert.equal(s.lifeStates[0],'incapacitated');assert.equal(s.health[0].cause,cause);assert.equal(terminal.type,'fighter-incapacitated');assert.equal(terminal.cause,cause);
  assert.deepEqual(terminal.bodyPose.map(p=>p.id),s.rigSegments[0].map(p=>p.id));
  assert.equal(health(c,id).hp,0);assert.equal(health(c,id).attached,false);
  assert.equal(hit(c,'L.hand'),false);
 }
});
test('trauma counts actual HP only, head weighted, does not count descendants',()=>{
 const state=new DamageState(f.segmentIds);
 assert.equal(state.apply('head',2,0).amount,2);
 assert.equal(state.snapshot().trauma,3);
 assert.equal(state.apply('R.upperArm',99,0).amount,4);
 assert.equal(state.snapshot().trauma,7);
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
 const c=make();assert.equal(hit(c,'L.upperLeg',DAMAGE.segmentHP),true);assert.equal(c.getSnapshot().mobilityModes[0],'single-support');
 const s=c.getSnapshot();s.health[0].segments[0].hp=999;assert.notEqual(health(c,'pelvis').hp,999);
 wait(c);assert.equal(hit(c,'R.upperLeg',DAMAGE.segmentHP),true);assert.equal(c.getSnapshot().mobilityModes[0],'arm-crawl');
 assert.throws(()=>hit(c,'head',NaN));assert.throws(()=>hit(c,'head',0));assert.throws(()=>hit(c,'head',.5));
 c.initialize({seed:7,fighters:[f]});assert.equal(health(c,'L.upperLeg').hp,DAMAGE.segmentHP);assert.equal(c.getSnapshot().health[0].trauma,0);
});

test('depleted central segment remains attached and is not an instant knockout',()=>{
 const c=make();assert.ok(hit(c,'chest',DAMAGE.segmentHP));assert.equal(health(c,'chest').hp,0);assert.equal(health(c,'chest').attached,true);
 assert.equal(c.getSnapshot().lifeStates[0],'active');assert.equal(c.getSnapshot().health[0].trauma,DAMAGE.segmentHP);
 wait(c);assert.equal(hit(c,'chest'),false);assert.ok(hit(c,'abdomen',DAMAGE.segmentHP));assert.equal(c.getSnapshot().lifeStates[0],'active');
});

test('endurance is v1 trauma budget with a bounded anatomy-dependent capacity',()=>{
 const state=new DamageState(f.segmentIds),start=state.snapshot();
 assert.equal(start.endurance,24);assert.equal(start.maxEndurance,24);assert.equal(start.baseEndurance,24);assert.equal(start.lostSegments,0);
 state.apply('head',2,0);assert.equal(state.snapshot().endurance,21);
 state.apply('L.upperArm',99,0);
 const cut=state.snapshot();assert.equal(cut.lostSegments,3);
 assert.ok(Math.abs(cut.maxEndurance-24*(1-.4*3/17))<1e-9);
 assert.equal(cut.trauma,7);assert.ok(Math.abs(cut.endurance-(cut.maxEndurance-7))<1e-9);
 state.detach(['L.upperArm','L.lowerArm','L.hand']);assert.deepEqual(state.snapshot(),cut,'no duplicate loss');
 const diagnostic=new DamageState(f.segmentIds.filter(id=>!id.startsWith('L.')));
 assert.equal(diagnostic.snapshot().lostSegments,6);assert.equal(diagnostic.snapshot().trauma,0);
 assert.equal(diagnostic.snapshot().endurance,diagnostic.snapshot().maxEndurance);
 const exhausted=new DamageState(f.segmentIds);
 for(const id of ['L.upperArm','R.upperArm','L.upperLeg','R.upperLeg'])exhausted.apply(id,99,0);
 assert.equal(exhausted.snapshot().cause,null,'oil loss can still occur after loss of four limbs');
 assert.ok(exhausted.endurance>0);
 assert.equal(exhausted.apply('chest',2,0).cause,'trauma');
 assert.equal(exhausted.snapshot().endurance,0);
});
