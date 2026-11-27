import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
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
  assert.ok(Math.abs(height-1.65)<.04,'authored stance preserves patient scale');
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
