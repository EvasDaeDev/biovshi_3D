import test from 'node:test';
import assert from 'node:assert/strict';
import {EscapeState,ESCAPE,tacticalEscape,pincerThreats,pincerGoal,LabSimulationCore,createArenaCombatConfig,FIXED_DT} from '../dist/index.js';
const a={id:0,x:0,z:0,yaw:0};
const foe={id:1,x:0,z:-1,yaw:Math.PI,visible:true,armed:true,attacking:false};
test('v1 escape direction order stays inside arena and avoids occupied destinations',()=>{
 const p=tacticalEscape(a,foe,1,[]);assert.ok(p.x<0&&p.z>0);
 const q=tacticalEscape(a,foe,1,[p]);assert.notDeepEqual(p,q);
 const wall=tacticalEscape({...a,x:5.6,z:5.6},foe,1,[]);assert.ok(wall&&Math.abs(wall.x)<=5.65&&Math.abs(wall.z)<=5.65);
});
test('blocked movement accumulates 2.5 seconds, decays on progress, and starts one bounded relocation',()=>{
 const e=new EscapeState(7,0);
 for(let i=0;i<150;i++)e.observe(0,true,false,true);
 assert.equal(e.choose(150,a,foe,[foe],[foe],true),null);
 e.observe(.1,true,false,true);assert.equal(e.snapshot().stationaryTicks,148);
 for(let i=0;i<3;i++)e.observe(0,true,false,true);
 const p=e.choose(154,a,foe,[foe],[foe],true);assert.equal(p.mode,'relocate');assert.equal(p.until,394);
 for(let i=0;i<60;i++)e.observe(0,true,false,true);
 assert.equal(e.snapshot().stationaryTicks,0);
 assert.equal(e.choose(155,{...a,...p.goal},foe,[foe],[foe],true),null);
});
test('two visible attack-capable opponents trigger one pincer escape, not stale or unarmed threats',()=>{
 const opponents=[{...foe,x:-.9,z:-.65,yaw:Math.atan2(.9,-.65)},{...foe,id:2,x:.9,z:-.65,yaw:Math.atan2(-.9,-.65)}];
 const threats=pincerThreats(a,opponents);assert.equal(threats.length,2);
 assert.equal(pincerThreats(a,[opponents[0],{...opponents[1],visible:false}]).length,0);
 assert.equal(pincerThreats(a,[opponents[0],{...opponents[1],armed:false}]).length,0);
 const goal=pincerGoal(a,threats,1,opponents);assert.ok(goal.z>0);
 const e=new EscapeState(7,0),p=e.choose(0,a,opponents[0],opponents,opponents,true);
 assert.equal(p.mode,'pincer');assert.ok(p.until>=54&&p.until<=96);
 assert.equal(e.choose(1,a,opponents[0],[opponents[0]],opponents,true),null);
 assert.equal(e.choose(2,a,opponents[0],opponents,opponents,true),null);
});
test('escape-enabled arena remains autonomous with real strikes and finite positions',()=>{
 const c=new LabSimulationCore();c.initialize(createArenaCombatConfig(7,true));const hits=new Set();let count=0;
 for(let i=0;i<1800;i++){c.step(FIXED_DT,{commands:[]});for(const e of c.drainEvents())if(e.type==='fighter-damaged'){count++;hits.add(e.attackerId);}}
 const s=c.getSnapshot();assert.ok(count>=4&&hits.size>=2,JSON.stringify({count,roots:Array.from(s.roots),tactics:s.tactics,escapes:s.escapes}));
 assert.ok(Array.from(s.roots).every(Number.isFinite));assert.equal(s.fighterIds.length,8);
});
