import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatTactics,patientTraits,LabSimulationCore,createArenaCombatConfig,FIXED_DT} from '../dist/index.js';
const hesitant=patientTraits({movement:2,critical:4,turning:3,temperament:'hesitant'});
test('target commitment survives small distance changes and immediately drops eliminated target',()=>{
 const t=new CombatTactics(7,0);
 assert.equal(t.choose(0,[{id:1,distance:1},{id:2,distance:1.1}]),1);
 const until=t.snapshot().commitmentUntil;assert.ok(until>=78&&until<=120);
 assert.equal(t.choose(10,[{id:1,distance:1.2},{id:2,distance:1}]),1);
 assert.equal(t.choose(until,[{id:1,distance:1.2},{id:2,distance:1}]),2);
 assert.equal(t.choose(until+1,[{id:1,distance:1.2}]),1);
 assert.equal(t.choose(until+2,[]),null);
});
test('new attacker is noticed after delay, does not interrupt a committed strike',()=>{
 const t=new CombatTactics(7,0),opponents=[{id:1,distance:1},{id:2,distance:1.2}];
 t.choose(0,opponents);t.hit(2,5,true,hesitant);t.hit(2,10,false,hesitant);
 assert.equal(t.choose(22,opponents),1);
 assert.equal(t.choose(23,opponents,1),1);
 assert.equal(t.choose(24,opponents),2);
 assert.equal(t.retreating(24),true);assert.equal(t.retreating(50),false);
 t.hit(1,51,true,hesitant);assert.equal(t.retreating(52),false);
});
test('native eight-patient arena produces real damage and multiple targets deterministically',()=>{
 const run=()=>{
  const c=new LabSimulationCore();c.initialize(createArenaCombatConfig(7));const events=[];
  for(let i=0;i<1800;i++){c.step(FIXED_DT,{commands:[]});events.push(...c.drainEvents());}
  const s=c.getSnapshot(),hits=events.filter(e=>e.type==='fighter-damaged');
  assert.ok(hits.length>=4,JSON.stringify({hits:hits.length,roots:Array.from(s.roots),tactics:s.tactics}));
  assert.ok(new Set(hits.map(e=>e.attackerId)).size>=2);
  assert.ok(events.filter(e=>e.type==='combat-target').every(e=>e.fighterId!==e.targetId));
  assert.ok(!events.some(e=>e.type==='lab-hit'));
  assert.ok(Array.from(s.roots).every(Number.isFinite));return events;
 };assert.deepEqual(run(),run());
});
test('arena retains identity and declares last surviving patient exactly once',()=>{
 const c=new LabSimulationCore(),cfg=createArenaCombatConfig(7);c.initialize(cfg);
 for(const f of cfg.fighters.slice(1))c.incapacitate(f.id);
 c.step(FIXED_DT,{commands:[]});assert.deepEqual(c.getSnapshot().fight,{ended:true,winnerId:0});
 const first=c.drainEvents();assert.equal(first.filter(e=>e.type==='fight-ended').length,1);
 for(let i=0;i<60;i++)c.step(FIXED_DT,{commands:[]});assert.ok(!c.drainEvents().some(e=>e.type==='fight-ended'));
 assert.equal(c.getSnapshot().fighterIds.length,8);
});
