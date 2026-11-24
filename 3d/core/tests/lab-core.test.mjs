import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT,FixedClock} from '../dist/index.js';
const empty={commands:[]};
const command=(forward=1,turn=0,sprint=false)=>({commands:[{fighterId:0,forward,turn,sprint}]});
const run=(seed,hz=60)=>{
  const c=new LabSimulationCore(); c.initialize(createLabConfig(seed));
  const clock=new FixedClock();
  for(let i=0;i<hz*10;i++) clock.advance(1/hz,dt=>c.step(dt,command(1,.2)));
  return c.getSnapshot();
};
test('eight patients and 15 stable segment IDs each',()=>{
  const c=new LabSimulationCore(); c.initialize(createLabConfig(0));
  const s=c.getSnapshot();
  assert.deepEqual([...s.fighterIds],[0,1,2,3,4,5,6,7]);
  assert.ok(s.segmentIds.every(a=>a.length===15&&new Set(a).size===15));
  assert.ok(Math.abs(s.roots[2]-1.4)<1e-6);
});
test('seeded NPC trajectories independent of display frequency',()=>{
  const a=run(7); assert.equal(a.tick,600);
  assert.deepEqual(a.roots,run(7,120).roots);
  assert.deepEqual(a.roots,run(7,30).roots);
  assert.notDeepEqual(a.roots,run(8).roots);
});
test('positive yaw turns right; forward speed follows lab damping',()=>{
  const c=new LabSimulationCore(); c.initialize(createLabConfig(1));
  c.step(FIXED_DT,command());
  let s=c.getSnapshot();
  assert.ok(Math.abs(s.roots[2]-(1.4-.9*(1-Math.exp(-3*FIXED_DT))*FIXED_DT))<1e-6);
  c.initialize(createLabConfig(1));
  for(let i=0;i<60;i++) c.step(FIXED_DT,command(0,1));
  s=c.getSnapshot(); assert.ok(Math.abs(s.roots[3]-2.15)<1e-6);
  c.step(FIXED_DT,command()); assert.ok(c.getSnapshot().roots[0]>0);
});
test('reset and snapshots retain independent ownership',()=>{
  const c=new LabSimulationCore(); const config=createLabConfig(5);
  c.initialize(config); const initial=c.getSnapshot();
  for(let i=0;i<300;i++) c.step(FIXED_DT,empty);
  const first=c.getSnapshot(); first.roots.fill(999); first.fighterIds.fill(999);
  assert.notEqual(c.getSnapshot().roots[0],999);
  c.initialize(config); assert.deepEqual(c.getSnapshot(),initial);
  c.dispose(); assert.throws(()=>c.getSnapshot());
});
test('invalid commands are atomic and exact timestep required',()=>{
  const c=new LabSimulationCore(); c.initialize(createLabConfig(1));
  const s=c.getSnapshot();
  assert.throws(()=>c.step(1/30,empty));
  assert.throws(()=>c.step(FIXED_DT,{commands:[...command().commands,{fighterId:99,forward:1,turn:0,sprint:false}]}));
  assert.deepEqual(c.getSnapshot(),s);
});
test('room limits hold over extended simulation',()=>{
  const c=new LabSimulationCore(); c.initialize(createLabConfig(42));
  for(let i=0;i<3600;i++) c.step(FIXED_DT,command(1,0,true));
  const s=c.getSnapshot();
  for(let i=0;i<s.fighterIds.length;i++){
    assert.ok(Math.abs(s.roots[i*4])<=5.650001);
    assert.ok(Math.abs(s.roots[i*4+2])<=5.650001);
  }
});
