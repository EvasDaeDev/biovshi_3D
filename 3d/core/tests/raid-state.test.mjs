import test from 'node:test';
import assert from 'node:assert/strict';
import {RaidState,raidProfile,approachLane,withdrawalLane,continueSeries,seriesRisk} from '../dist/combat/raid-state.js';
import {CombatTactics} from '../dist/combat/tactics.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const opponent={id:1,x:0,z:0,yaw:0,threatening:false,grounded:false};
const clear=()=>true;
const input=(tick,here,target=opponent,extra={})=>({tick,here,target,visible:target?[target]:[],strike:'idle',interrupted:false,ready:true,clear,...extra});
test('same match seed yields persistent individual risk, patience, series and safe distance',()=>{
 const a=raidProfile(7,0,'impulsive'),b=raidProfile(7,1,'hesitant');
 assert.ok(a.drive>=.85&&a.drive<=1.15&&b.drive>=.85&&b.drive<=1.15);assert.ok(a.patience<b.patience&&a.safeDistance<b.safeDistance&&a.risk>b.risk);
 assert.deepEqual(a,raidProfile(7,0,'impulsive'));assert.notDeepEqual(raidProfile(7,0,'balanced'),raidProfile(7,1,'balanced'));
});
test('approach and retreat avoid occupied lanes and maximize safety from multiple threats',()=>{
 const profile=raidProfile(7,1,'hesitant'),here={x:0,z:-2.3};
 const flank=approachLane(here,opponent,[opponent],profile,1,clear);
 assert.ok(flank&&Math.abs(flank.x)>.4);
 assert.equal(approachLane(here,opponent,[opponent],profile,1,()=>false),null);
 const threats=[opponent,{x:.7,z:-.7}],start={x:0,z:-.9};
 const exit=withdrawalLane(start,threats,profile,clear);
 assert.ok(exit&&Math.min(...threats.map(t=>dist(exit,t)))>Math.min(...threats.map(t=>dist(start,t)))+.2);
 assert.equal(withdrawalLane(start,threats,profile,()=>false),null);
});
test('cautious patient can break off after a single attempt when a counterattack threatens',()=>{
 const state=new RaidState(7,1,'hesitant'),far={x:0,z:2},near={x:0,z:.8};
 assert.equal(state.advance(input(0,far)).phase,'observe');
 assert.equal(state.advance(input(60,far)).phase,'rush');
 assert.equal(state.advance(input(70,near)).attack,true);
 state.committed(70,1);assert.equal(state.snapshot().attempts,1);
 assert.equal(state.advance(input(90,near,opponent,{strike:'thrust'})).phase,'attack');
 const counter={...opponent,threatening:true};
 const out=state.advance(input(103,near,counter,{strike:'recover',ready:false}));
 assert.equal(out.phase,'withdraw');assert.equal(out.attack,false);assert.ok(out.goal);
 assert.equal(state.advance(input(135,{x:0,z:2.6},null)).phase,'reassess');
 assert.equal(state.lockedTarget(),undefined);
 const t=new CombatTactics(7,1);
 assert.equal(t.choose(0,[{id:1,distance:1}]),1);
 assert.equal(t.choose(1,[{id:1,distance:1},{id:2,distance:1,priority:.3}],undefined,[1,2],true),2);
});
test('multiple nearby opponents trigger withdrawal instead of another attack',()=>{
 const state=new RaidState(7,0,'impulsive'),here={x:0,z:.8},other={...opponent,id:2,x:.8,z:.8};
 const out=state.advance(input(0,here,opponent,{visible:[opponent,other]}));
 assert.equal(out.phase,'withdraw');assert.equal(out.attack,false);
});

test('heat raises willingness to accept counterattacks without altering hit authority',()=>{
 const p=raidProfile(7,1,'hesitant'),counter={...opponent,threatening:true};
 assert.ok(seriesRisk(p,.9)>seriesRisk(p,.1));
 assert.equal(continueSeries(p,1,.14,false,counter,0,0),false);
 assert.equal(continueSeries(p,3,.84,true,counter,0,0),true);
 assert.equal(continueSeries(p,5,1,true,{...opponent,grounded:true},1,.16),false);
});
test('series varies with visible opportunities and stable per-commit decisions; heat clears on reassessment',()=>{
 const lengths=new Set(),near={x:0,z:.8};
 for(let id=0;id<16;id++){
  const state=new RaidState(7,id,id%2?'hesitant':'impulsive');
  const target={...opponent,yaw:Math.PI,grounded:id%3===0,recovering:id%4===0};
  assert.equal(state.advance(input(0,near,target)).phase,'observe');
  assert.equal(state.advance(input(60,near,target)).phase,'rush');
  let attempts=0,previous=0,tick=70;
  for(let n=1;n<=5;n++,tick+=68){
   state.committed(tick,1);attempts=n;
   if(id%3!==1)state.damagedTarget(1);
   const h=state.snapshot();
   assert.ok(h.rush>=previous&&h.rush<=1);previous=h.rush;
   assert.equal(h.attempts,n);assert.equal(h.hits,id%3!==1?n:0);
   state.damagedTarget(99);assert.equal(state.snapshot().hits,h.hits);
   const next=state.advance(input(tick+33,near,target,{strike:'recover',ready:false}));
   if(next.phase==='withdraw')break;
   assert.equal(next.phase,'attack');
   assert.equal(state.advance(input(tick+65,near,target)).attack,true);
  }
  lengths.add(attempts);
  assert.ok(attempts>=3&&attempts<=5,JSON.stringify({id,attempts,profile:state.profile}));
  assert.equal(state.snapshot().phase,'withdraw');
  state.advance(input(tick+65,{x:0,z:3},null));
  assert.equal(state.snapshot().rush,0);assert.equal(state.snapshot().attempts,0);
 }
 assert.ok(lengths.size>=2,JSON.stringify([...lengths]));
});
test('crowd and actual interruption still break a heated series',()=>{
 const state=new RaidState(7,0,'impulsive'),near={x:0,z:.8};
 assert.equal(state.advance(input(0,near)).phase,'observe');
 assert.equal(state.advance(input(60,near)).phase,'rush');
 state.committed(70,1);state.damagedTarget(1);
 assert.equal(state.snapshot().phase,'attack');assert.equal(state.snapshot().hits,1);
 assert.ok(state.snapshot().rush>0);
 assert.equal(state.advance(input(75,near,opponent,{strike:'windup',interrupted:true})).phase,'withdraw');
});

test('selected close opponent is not a third-party danger before acquisition',()=>{
 const near={x:0,z:.8};
 const state=new RaidState(7,1,'hesitant');
 assert.equal(state.advance(input(0,near)).phase,'observe');
 assert.equal(state.snapshot().targetId,1);
 assert.equal(state.advance(input(60,near)).phase,'rush');
 // A real counterattack remains a reason for a cautious patient to abort.
 const danger={...opponent,threatening:true};
 const cautious=new RaidState(7,1,'hesitant');
 assert.equal(cautious.advance(input(0,near,danger)).phase,'withdraw');
 // A genuine second nearby patient is still a crowd.
 const other={...opponent,id:2,x:.8,z:.8};
 const crowded=new RaidState(7,0,'impulsive');
 assert.equal(crowded.advance(input(0,near,opponent,{visible:[opponent,other]})).phase,'withdraw');
});
