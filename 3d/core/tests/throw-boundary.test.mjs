import test from 'node:test';
import assert from 'node:assert/strict';
import {createRingLocation} from '../dist/arena/ring.js';
import {createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {PolygonNavigation} from '../dist/arena/polygon-navigation.js';
import {LimbFlight} from '../dist/combat/limb-throw.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';

const ring=createRingLocation(),nav=new PolygonNavigation(ring);
const inside=parts=>parts.every(p=>[p.a,p.b].every(q=>nav.clear({x:q[0],z:q[2]},{x:q[0],z:q[2]},p.radius-1e-4)));
const parts=[{id:'L.upperArm',a:[3.2,1.7,0],b:[3.5,1.7,0],radius:.1},{id:'L.lowerArm',a:[3.5,1.7,0],b:[3.8,1.7,0],radius:.08},{id:'L.hand',a:[3.8,1.7,0],b:[3.8,1.7,0],radius:.08}];
test('missed throw stops at full capsule clearance and keeps all segments',()=>{
 const f=new LimbFlight(1,0,1,parts,[14,2,0],false);
 let out;
 for(let i=0;i<100;i++){
  out=f.advance([], (a,b,pad=0)=>nav.clear({x:a[0],z:a[2]},{x:b[0],z:b[2]},pad),()=>0);
  assert.ok(inside(out.parts));
  if(out.ended)break;
 }
 assert.ok(out.ended);assert.equal(out.hit,null);assert.equal(out.velocity[0],0);assert.equal(out.velocity[2],0);assert.equal(out.parts.length,3);
});
test('Rapier throw handoff stays inside low ring even with outward velocity and settles',async()=>{
 await RAPIER.init();const world=new DebrisWorld(RAPIER);world.reset([],null,'ring',ring);
 try{
  world.accept({type:'segment-detached',fighterId:0,tick:0,flightId:1,detachedParts:parts});
  world.accept({type:'limb-flight-ended',fighterId:0,tick:1,flightId:1,flightParts:parts,flightVelocity:[30,3,0]});
  for(let i=0;i<1100;i++){world.step(FIXED_DT);const b=world.branchSnapshot();assert.equal(b.length,1);assert.ok(inside(b[0].parts));}
  assert.ok(world.branchSnapshot()[0].settled);assert.equal(world.branchSnapshot()[0].parts.length,3);
 }finally{world.dispose();}
});
test('ring spawns face away from the center',()=>{
 for(let n=2;n<=8;n++){
  const fs=createAuthoredCombatConfig(7,ring,n).fighters;
  for(let i=0;i<n;i++){
   const f=fs[i],[dx,,dz]=f.origin;
   assert.ok((Math.sin(f.yawRad)*dx-Math.cos(f.yawRad)*dz)/Math.hypot(dx,dz)>.99999);
  }
 }
});
