import test from 'node:test';
import assert from 'node:assert/strict';
import {PatientPerception,VISION,notices,LabSimulationCore,createArenaCombatConfig,FIXED_DT} from '../dist/index.js';
const body=(id,x,z,yaw=0,head=true)=>({id,x,z,yaw,parts:[{id:'chest',a:[x-.34,1.5,z],b:[x+.34,1.5,z],radius:.16},...(head?[{id:'head',a:[x,1.85,z],b:[x,1.85,z],radius:.19}]:[])]});
test('v1 visibility: forward sector, nearby circle, headless touch and blocked rays',()=>{
 const a=body(0,0,0);
 assert.ok(notices(a,body(1,0,-4),0));assert.ok(!notices(a,body(1,0,4),0));
 assert.ok(notices(a,body(1,0,1),0));assert.ok(!notices(a,body(1,0,-10),0));
 assert.ok(!notices(a,body(1,0,-4),0,()=>false));
 assert.ok(notices(body(0,0,0,0,false),body(1,.4,0),0));
 assert.ok(!notices(body(0,0,0,0,false),body(1,0,-2),0));
 assert.ok(notices(a,body(1,4,-.5),Math.PI/3));
});
test('gaze tracking and scanning respect source angular speeds and neck limit',()=>{
 const p=new PatientPerception(7,0);
 p.advanceLook(0,{x:0,z:0},{x:5,z:0});
 assert.ok(Math.abs(p.snapshot(0).look-VISION.trackSpeed*FIXED_DT)<1e-12);
 for(let i=0;i<300;i++)p.advanceLook(0,{x:0,z:0},{x:5,z:0});
 assert.ok(Math.abs(p.snapshot(0).look-VISION.limit)<1e-9);
 for(let i=0;i<1200;i++){const before=p.snapshot(0).look;p.advanceLook(0,{x:0,z:0},null);const after=p.snapshot(0).look;assert.ok(Math.abs(after)<=VISION.limit+1e-9);assert.ok(Math.abs(after-before)<=VISION.scanSpeed*FIXED_DT+1e-9);}
});
test('last seen position is copied, expires at 2.4 seconds and clears on arrival or elimination',()=>{
 const p=new PatientPerception(7,0),foe={x:3,z:-4},here={x:0,z:0};
 p.remember(1,foe,10);foe.x=5;
 assert.deepEqual(p.recalled(153,here,[1]).point,{x:3,z:-4});assert.equal(p.recalled(154,here,[1]),null);
 p.remember(1,foe,200);assert.equal(p.recalled(201,foe,[1]),null);
 p.remember(1,foe,210);assert.equal(p.recalled(211,here,[]),null);
 const a=p.patrol(220,here),b=p.patrol(221,here);assert.deepEqual(a,b);assert.ok(Math.abs(a.x)<=5.65&&Math.abs(a.z)<=5.65);
});
test('perception-enabled arena searches, discovers opponents and deals real damage',()=>{
 const c=new LabSimulationCore();c.initialize(createArenaCombatConfig(7,true,true));
 let searching=false,seen=false,hits=0;const attackers=new Set();
 for(let i=0;i<1800;i++){
  c.step(FIXED_DT,{commands:[]});for(const e of c.drainEvents())if(e.type==='fighter-damaged'){hits++;attackers.add(e.attackerId);}
  if(i%15===0){const s=c.getSnapshot();searching||=s.tactics.some(t=>t.mode==='search');seen||=s.perception.some(p=>p.visibleIds.length>0);}
 }
 const s=c.getSnapshot();assert.ok(searching&&seen&&hits>=4&&attackers.size>=2,JSON.stringify({searching,seen,hits,attackers:[...attackers],tactics:s.tactics,perception:s.perception}));
 assert.ok(s.perception.every(p=>Math.abs(p.look)<=VISION.limit+1e-9));
});
