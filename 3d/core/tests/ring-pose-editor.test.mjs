import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocationCatalog,buildLegacyLocationFixtures} from '../scripts/catalog-locations.mjs';
import {LabSimulationCore,PolygonNavigation,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {buildEditedPose,readPoseDocument,referencePose} from '../dist/rig/pose-editor.js';

test('the active catalog restores the original arenas alongside the 9 m ring and protects its perimeter in movement',async()=>{
 const catalog=await buildLocationCatalog();
 assert.deepEqual(Object.keys(catalog),['ring','ward','annulus','sluice','zigzag','columns','maze','throat']);
 const {ring}=catalog;
 assert.equal(ring.shape,'circle');
 assert.equal(ring.capacity,8);
 assert.equal(ring.width,9);
 assert.equal(ring.depth,9);
 assert.equal(ring.floorRevision,'9m-v1');
 assert.ok(ring.boundary.every(({x,z})=>Math.abs(Math.hypot(x,z)-4.5)<1e-12));
 assert.ok(ring.spawnSlots.every(([x,,z])=>Math.abs(Math.hypot(x,z)-2.95)<1e-12));
 const nav=new PolygonNavigation(ring);
 assert.equal(nav.clear({x:0,z:0},{x:4.8,z:0},.50),false);
 for(let count=2;count<=8;count++){
  const fighters=createAuthoredCombatConfig(1,ring,count).fighters;
  assert.equal(fighters.length,count);
  for(let i=0;i<count;i++){
   const [x,,z]=fighters[i].origin,[nx,,nz]=fighters[(i+1)%count].origin;
   assert.ok(nav.clear({x,z},{x,z},.50));
   assert.ok(Math.abs(Math.hypot(x-nx,z-nz)-2*2.95*Math.sin(Math.PI/count))<1e-9);
  }
 }
 const config=createAuthoredCombatConfig(1,ring);
 const core=new LabSimulationCore();
 try{
  const fighter={...config.fighters[0],origin:[0,0,-1.5],yawRad:0};
  core.initialize({...config,fighters:[fighter],combatEnabled:false});
  const pose=core.getSnapshot().rigSegments[0];
  const height=Math.max(...pose.map(p=>Math.max(p.a[1],p.b[1])+p.radius))-
   Math.min(...pose.map(p=>Math.min(p.a[1],p.b[1])-p.radius));
  assert.equal(ring.patientPoses.stature,1.65);
  assert.ok(height>1.45&&height<1.75,'posed patient keeps human-scale proportions');
  for(let i=0;i<220;i++)core.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:0,sprint:true}]});
  const [x,,z]=core.getSnapshot().roots;
  assert.ok(Math.hypot(x,z)>3.75);
  assert.ok(Math.hypot(x,z)<4.02);
 }finally{core.dispose();}
});

test('pose files restore adjusted anatomy and connected bones and reject invalid inputs',()=>{
 const parts=referencePose(),arm=parts.find(p=>p.id==='L.upperArm');
 const source={schemaVersion:1,stature:1.65,slots:{punch:parts.map(p=>p===arm?{...arm,length:.48,radius:.16}:p)}};
 const document=readPoseDocument(JSON.parse(JSON.stringify(source)));
 const edited=buildEditedPose(document.slots.punch);
 const upper=edited.find(p=>p.id==='L.upperArm'),lower=edited.find(p=>p.id==='L.lowerArm');
 assert.equal(upper.radius,.16);
 assert.ok(Math.abs(Math.hypot(...upper.b.map((v,i)=>v-upper.a[i]))-.48)<1e-12);
 assert.deepEqual(upper.b,lower.a);
 const removed=document.slots.punch.map(p=>p.id==='L.upperArm'?{...p,enabled:false}:p);
 assert.equal(buildEditedPose(removed).length,14);
 assert.throws(()=>readPoseDocument({schemaVersion:2,slots:{}}),RangeError);
 assert.throws(()=>readPoseDocument({schemaVersion:1,slots:{punch:parts.slice(1)}}),RangeError);
});

test('published legacy arena outlines and obstacles have 25% more area',async()=>{
 const published=await buildLocationCatalog(),legacy=await buildLegacyLocationFixtures();
 const area=points=>Math.abs(points.reduce((sum,p,i)=>{
  const next=points[(i+1)%points.length];
  return sum+p.x*next.z-p.z*next.x;
 },0))/2;
 for(const [id,original] of Object.entries(legacy)){
  if(id==='ring')continue;
  const arena=published[id],nav=new PolygonNavigation(arena);
  assert.equal(arena.capacity,original.capacity);
  assert.ok(Math.abs(area(arena.boundary)/area(original.boundary)-1.25)<1e-10,id);
  const freeArea=location=>area(location.boundary)-location.objects.reduce((sum,object)=>sum+area(object.points),0);
  assert.ok(Math.abs(freeArea(arena)/freeArea(original)-1.25)<1e-10,id);
  for(const [i,[x,y,z]] of arena.spawnSlots.entries()){
   assert.deepEqual([x,y,z],original.spawnSlots[i].map((n,axis)=>axis===1?n:n*Math.sqrt(1.25)));
   assert.ok(nav.clear({x,z},{x,z},.5),id);
  }
 }
});
