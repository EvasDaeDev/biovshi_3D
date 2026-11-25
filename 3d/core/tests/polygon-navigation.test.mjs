import test from 'node:test';
import assert from 'node:assert/strict';
import {PolygonNavigation,ArenaNavigation,LabSimulationCore,createArenaCombatConfig,FIXED_DT} from '../dist/index.js';
import {buildLegacyLocationFixtures} from '../scripts/catalog-locations.mjs';

const diamond=[{x:-1,z:0},{x:0,z:-1},{x:1,z:0},{x:0,z:1}];
const box={minX:-1,maxX:1,minZ:-1,maxZ:1,height:2.8};
const synthetic={
 id:'test',name:'test',capacity:4,width:8,depth:8,
 boundary:[{x:-4,z:-4},{x:4,z:-4},{x:4,z:4},{x:-4,z:4}],
 objects:[{kind:'obstacle',points:diamond,convexParts:[diamond],height:2.8}],
 walls:[box],spawns:[],patrol:[]
};
const n=new PolygonNavigation(synthetic);
const length=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
test('polygon sweeps accept a real open diagonal corner rejected by rectangular proxy',()=>{
 const a={x:.86,z:.86},b={x:1.6,z:.86};
 assert.equal(new ArenaNavigation([box]).clear(a,b,.1),false,'AABB false positive');
 assert.equal(n.clear(a,b,.1),true,'convex geometry has real diagonal space');
 assert.deepEqual(n.move(a,b,.1),b,'safe corner passage is not forcibly stopped');
 assert.equal(n.clear({x:-2,z:0},{x:2,z:0},0),false,'solid obstacle remains opaque');
 assert.equal(n.sightClear([-2,1.8,0],[2,1.8,0]),false);
 assert.equal(n.sightClear([-2,3.1,0],[2,3.1,0]),true);
});
test('v1 visibility graph routes around true rounded convex boundaries',()=>{
 const from={x:-2,z:0},to={x:2,z:0},pad=.5,route=n.plan(from,to,pad);
 assert.ok(route.length>=2,JSON.stringify(route));
 assert.deepEqual(route.at(-1),to);
 let start=from;
 for(const waypoint of route){
  assert.ok(n.clear(start,waypoint,pad),JSON.stringify({start,waypoint,route}));
  start=waypoint;
 }
 assert.equal(n.reachable(from,to,pad),true);
 assert.equal(n.reachable(from,{x:0,z:0},pad),false);
 assert.equal(n.reachable(from,{x:3.9,z:3.9},pad),false,'boundary clearance');
});
test('movement at a diagonal face slides along it, but never cuts through solids or the authored perimeter',()=>{
 let start={x:-1.8,z:.3},end={x:1.5,z:.3};
 let moved=n.move(start,end,.3);
 assert.ok(length(start,moved)>0,JSON.stringify(moved));
 assert.ok(n.clear(moved,moved,.29),JSON.stringify(moved));
 assert.ok(length(start,moved)<=length(start,end)+1e-6);
 const outside=n.move({x:3.3,z:0},{x:4.8,z:0},.5);
 assert.ok(outside.x<=3.5001,'native perimeter, not P3 square 5.65 m');
 assert.equal(n.clear({x:3.6,z:0},{x:3.6,z:0},.5),false);
});
test('every source 2D spawn respects the true convex perimeter and obstacle clearance',async()=>{
 const catalog=await buildLegacyLocationFixtures();
 for(const map of Object.values(catalog)){
  const poly=new PolygonNavigation(map);
  for(const origin of map.spawns){
   const point={x:origin[0],z:origin[2]};
   assert.equal(poly.clear(point,point,.5),true,map.id+' '+JSON.stringify(point));
  }
  assert.equal(poly.clear({x:map.width/2+.1,z:0},{x:map.width/2+.1,z:0},.5),false);
 }
});
test('P4 live four-patient native combat uses polygon routes without leaving exact source arena',async()=>{
 const {ward,ring}=await buildLegacyLocationFixtures();
 for(const location of [ward,ring]){
  const base=createArenaCombatConfig(7,true,true),count=Math.min(4,location.capacity);
  const fighters=base.fighters.slice(0,count).map((f,i)=>({...f,origin:location.spawns[i]}));
  const c=new LabSimulationCore();
  c.initialize({...base,fighters,walls:location.walls,location});
  try{
   const poly=new PolygonNavigation(location);
   for(let tick=0;tick<240;tick++){
    c.step(FIXED_DT,{commands:[]});
    if(tick%30!==29)continue;
    const state=c.getSnapshot();
    assert.ok(Array.from(state.roots).every(Number.isFinite));
    for(let i=0;i<count;i++)if(state.lifeStates[i]==='active'){
     const p={x:state.roots[i*4],z:state.roots[i*4+2]};
     assert.equal(poly.clear(p,p,.42),true,location.id+' '+JSON.stringify(p));
    }
   }
  }finally{c.dispose();}
 }
});
