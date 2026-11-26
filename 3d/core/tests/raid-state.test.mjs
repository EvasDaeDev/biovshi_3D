import test from 'node:test';
import assert from 'node:assert/strict';
import {RaidState,raidProfile,approachLane,withdrawalLane} from '../dist/combat/raid-state.js';
import {CombatTactics} from '../dist/combat/tactics.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const opponent={id:1,x:0,z:0,yaw:0,threatening:false,grounded:false};
const clear=()=>true;
const input=(tick,here,target=opponent,extra={})=>({tick,here,target,visible:target?[target]:[],strike:'idle',interrupted:false,ready:true,clear,...extra});
test('same match seed yields persistent individual risk, patience, series and safe distance',()=>{
 const a=raidProfile(7,0,'impulsive'),b=raidProfile(7,1,'hesitant');
 assert.equal(a.combo,2);assert.equal(b.combo,1);assert.ok(a.patience<b.patience&&a.safeDistance<b.safeDistance&&a.risk>b.risk);
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
test('one-attack patient observes, rushes, commits, withdraws during recovery and reassesses',()=>{
 const state=new RaidState(7,1,'hesitant'),far={x:0,z:2},near={x:0,z:.8};
 assert.equal(state.advance(input(0,far)).phase,'observe');
 assert.equal(state.advance(input(60,far)).phase,'rush');
 assert.equal(state.advance(input(70,near)).attack,true);
 state.committed(70,1);assert.equal(state.snapshot().attempts,1);
 assert.equal(state.advance(input(90,near,opponent,{strike:'thrust'})).phase,'attack');
 const out=state.advance(input(103,near,opponent,{strike:'recover'}));
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
