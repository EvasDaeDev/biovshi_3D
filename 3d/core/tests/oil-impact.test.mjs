import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT,OIL,ImpactState,DAMAGE} from '../dist/index.js';
const f=createLabConfig(7).fighters[0],idle={commands:[]};
const make=()=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});return c;};
const cut=(c,id)=>assert.ok(c.applyDamage({fighterId:0,segmentId:id,amount:DAMAGE.segmentHP}));
const run=(c,n)=>{for(let i=0;i<n;i++)c.step(FIXED_DT,idle);};
test('oil emission is deterministic, follows attached stump and removes obsolete wounds',()=>{
 const a=make(),b=make();for(const c of [a,b]){cut(c,'L.foot');run(c,43);assert.equal(c.getSnapshot().oilMarks.length,1);assert.deepEqual(c.getSnapshot().oil[0].wounds,['L.foot']);cut(c,'L.upperLeg');run(c,85);}
 const s=a.getSnapshot();assert.deepEqual(s.oilMarks,b.getSnapshot().oilMarks);assert.deepEqual(s.oil[0].wounds,['L.upperLeg']);
 assert.equal(s.oil[0].failureTick,null);assert.ok(s.oilMarks.length>=3);assert.ok(s.oilMarks.every(p=>p.point.every(Number.isFinite)));
 s.oilMarks[0].point[0]=999;assert.notEqual(a.getSnapshot().oilMarks[0].point[0],999);
 a.incapacitate(0);const n=a.getSnapshot().oilMarks.length;run(a,90);assert.equal(a.getSnapshot().oilMarks.length,n);assert.equal(a.getSnapshot().oil[0].wounds.length,0);
});
test('no working limbs starts v1 oil-loss deadline, but pre-damaged diagnostic does not fail',()=>{
 const c=make();for(const id of ['L.upperLeg','R.upperLeg','L.upperArm','R.upperArm'])cut(c,id);
 run(c,1);const deadline=c.getSnapshot().oil[0].failureTick;assert.ok(deadline>=601&&deadline<=901);
 assert.equal(c.getSnapshot().oil[0].remainingTicks,deadline-1);
 assert.equal(c.getSnapshot().oil[0].failureStartTick,1);
 run(c,deadline-2);assert.equal(c.getSnapshot().oil[0].remainingTicks,1);assert.equal(c.getSnapshot().lifeStates[0],'active');run(c,1);
 assert.equal(c.getSnapshot().health[0].cause,'oil-loss');assert.ok(c.drainEvents().some(e=>e.type==='fighter-incapacitated'&&e.cause==='oil-loss'));
 const d=new LabSimulationCore();d.initialize({seed:7,fighters:[{...f,segmentIds:f.segmentIds.filter(s=>!s.includes('.'))}]});run(d,1000);assert.equal(d.getSnapshot().lifeStates[0],'active');assert.equal(d.getSnapshot().oilMarks.length,0);
});
test('impact strength and duration reflect v1 timing; damage recoils away from attacker',()=>{
 const a=new ImpactState(),b=new ImpactState();a.hit('head',1,0);b.hit('L.hand',1,0);assert.equal(a.slow,.18);assert.ok(a.advance(FIXED_DT)[0]>b.advance(FIXED_DT)[0]);for(let i=0;i<31;i++)a.advance(FIXED_DT);assert.equal(a.active,false);assert.equal(a.slow,1);
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,origin:[0,0,0],yawRad:0},{...f,id:1,origin:[0,0,-3],yawRad:0}]});
 assert.ok(c.applyDamage({fighterId:0,segmentId:'head',amount:1,attackerId:1}));
 const input={commands:[0,1].map(fighterId=>({fighterId,forward:0,turn:0,sprint:false}))};
 for(let i=0;i<32;i++)c.step(FIXED_DT,input);
 const s=c.getSnapshot();assert.ok(s.roots[2]>.02);assert.equal(s.impacts[0].active,false);assert.equal(s.health[0].trauma,1.5);
});

test('destroyed chest starts the delayed knockout with intact limbs and no open wounds',()=>{
 const c=new LabSimulationCore(),cfg=createLabConfig(7),fighter=cfg.fighters[0];
 c.initialize({...cfg,fighters:[fighter]});
 try{
  c.applyDamage({fighterId:fighter.id,segmentId:'abdomen',amount:3});
  run(c,1);
  assert.equal(c.getSnapshot().oil[0].failureTick,null);
  c.applyDamage({fighterId:fighter.id,segmentId:'chest',amount:4});
  run(c,1);
  const s=c.getSnapshot(),deadline=s.oil[0].failureTick;
  assert.ok(Number.isInteger(deadline)&&deadline-s.tick>=600&&deadline-s.tick<=900);
  assert.deepEqual(s.oil[0].wounds,[]);
  assert.equal(s.oil[0].failureStartTick,s.tick);
  assert.equal(s.health[0].segments.find(p=>p.id==='chest').attached,true);
  assert.equal(s.mobilityModes[0],'biped');
  run(c,deadline-s.tick-1);
  assert.equal(c.getSnapshot().lifeStates[0],'active');
  assert.equal(c.getSnapshot().oil[0].failureTick,deadline);
  assert.equal(c.getSnapshot().oil[0].failureStartTick,s.tick);
  run(c,1);
  assert.equal(c.getSnapshot().health[0].cause,'torso-failure');
  assert.equal(c.getSnapshot().oil[0].failureStartTick,null);
  assert.equal(c.drainEvents().filter(e=>e.type==='fighter-incapacitated'&&e.cause==='torso-failure').length,1);
 }finally{c.dispose();}
});
