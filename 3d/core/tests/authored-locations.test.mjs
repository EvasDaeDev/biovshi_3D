import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {buildLegacyLocationFixtures} from './legacy-location-fixtures.mjs';
import {ArenaNavigation,LabSimulationCore,createArenaCombatConfig,FIXED_DT} from '../dist/index.js';
import {DebrisWorld} from '../../lab-next/debris.js';
const ids=['ward','ring','annulus','sluice','zigzag','columns','maze','throat'];
let catalog;
const get=async()=>catalog??=await buildLegacyLocationFixtures();

test('P4 compiles all eight real 2D-authored locations with valid metric polygons and v1 spawns',async()=>{
 const maps=await get();
 assert.deepEqual(Object.keys(maps),ids,'keep the original active location order');
 for(const [id,map] of Object.entries(maps)){
  assert.equal(map.id,id);
  assert.ok(map.width>=3&&map.width<=11);
  assert.ok(map.depth>=3&&map.depth<=11);
  assert.ok(map.boundary.length>=4);
  assert.ok(map.spawns.length>=4,'existing 2D startup generator supplies four safe spawns');
  assert.ok(map.walls.length>=4);
  const n=new ArenaNavigation(map.walls);
  for(const origin of map.spawns){
   assert.equal(origin[1],0);
   assert.ok(origin.every(Number.isFinite));
   assert.equal(n.clear({x:origin[0],z:origin[2]},{x:origin[0],z:origin[2]}),true,id+' has a spawn inside a proxy collider');
  }
  for(const obj of map.objects){
   assert.ok(['wall','obstacle'].includes(obj.kind));
   assert.equal(obj.height,2.8);
   assert.ok(obj.points.length>=3&&obj.convexParts.length>0);
   assert.ok(obj.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
  }
 }
 assert.equal(maps.ward.width,7);
 assert.equal(maps.ward.depth,7);
 assert.equal(maps.ward.objects.length,5,'central octagon and four obstacles originate in ward.json');
 assert.equal(maps.ward.objects[0].points.length,8);
 assert.equal(maps.ring.width,4);
 assert.equal(maps.ring.objects.length,0);
 assert.equal(maps.annulus.boundary.length,16);
 assert.equal(maps.annulus.objects[0].points.length,64);
 assert.equal(maps.maze.width,10);
 assert.equal(maps.maze.depth,5);
 assert.ok(maps.throat.objects.length>=2);
});

test('P4 native navigation and a four-patient tactical scene work with original ward geometry',async()=>{
 const {ward}=await get(),nav=new ArenaNavigation(ward.walls);
 assert.equal(nav.clear({x:0,z:0},{x:0,z:0},0),false,'real center octagon has a solid proxy');
 const c=new LabSimulationCore(),base=createArenaCombatConfig(7,true,true);
 const fighters=base.fighters.slice(0,4).map((f,i)=>({...f,origin:ward.spawns[i]}));
 c.initialize({...base,fighters,walls:ward.walls});
 try{
  for(let i=0;i<120;i++)c.step(FIXED_DT,{commands:[]});
  const state=c.getSnapshot();
  assert.ok(Array.from(state.roots).every(Number.isFinite));
  assert.equal(state.fighterIds.length,4);
  assert.ok(state.routes.every(r=>r.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z))));
  for(let i=0;i<4;i++){
   const x=state.roots[i*4],z=state.roots[i*4+2];
   assert.ok(x>=-3.5&&x<=3.5&&z>=-3.5&&z<=3.5,'fighter left source arena bounds');
  }
 }finally{c.dispose();}
});

test('P4 Rapier builds exact convex polygon obstacles and authored perimeter, not navigation slabs',async()=>{
 const {ward,ring,annulus}=await get();
 await RAPIER.init();
 const debris=new DebrisWorld(RAPIER);
 try{
  for(const map of [ward,ring,annulus]){
   debris.reset(map.walls,null,map.id,map);
   const count=5+map.boundary.length+map.objects.reduce((sum,o)=>sum+o.convexParts.length,0);
   assert.equal(debris.world.colliders.len(),count,'unexpected Rapier collider count for '+map.id);
   assert.equal(debris.bodySnapshot().length,0);
   for(let i=0;i<30;i++)debris.step(FIXED_DT);
  }
  debris.reset();
  assert.equal(debris.world.colliders.len(),5,'legacy empty diagnostic room unchanged');
 }finally{debris.dispose();}
});
