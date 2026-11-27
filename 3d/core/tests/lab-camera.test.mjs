import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LabCamera} from '../../lab-next/lab-camera.js';
import {CAMERA_CLEARANCE} from '../../lab-next/arena-camera-layout.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';

const catalog=await buildLocationCatalog();
function setup(arena,aspect=16/9){
 const camera=new THREE.PerspectiveCamera(65,aspect,.05,60);
 const controller=new LabCamera(THREE,camera,{value:'corner-1'},{value:'0'});
 controller.setArena(arena);
 return {camera,controller};
}
const fighter=(x,z)=>[{a:[x,.2,z],b:[x,1.58,z],radius:.12}];

test('every arena has four distinct unobstructed mounts 3 m above the floor',()=>{
 for(const arena of Object.values(catalog)){
  const {camera,controller}=setup(arena),mounts=new Set();
  assert.equal(arena.boundaryHeight,3.1);
  for(let i=1;i<=4;i++){
   controller.select('corner-'+i);
   const {x,y,z}=camera.position;
   assert.equal(y,3);
   assert.ok(controller.navigation.clear({x,z},{x,z},CAMERA_CLEARANCE),arena.id);
   mounts.add([x,z].join());
  }
  assert.equal(mounts.size,4,arena.id);
 }
});

test('a corner frames the group in portrait and landscape and follows motion smoothly',()=>{
 for(const aspect of [.56,16/9]){
  const {camera,controller}=setup(catalog.ring,aspect);
  const group=[fighter(-2,1),fighter(1,-2),fighter(2,0)];
  controller.track(group,1/60);
  camera.updateMatrixWorld();
  for(const part of group.flat())for(const p of [part.a,part.b]){
   const projected=new THREE.Vector3(...p).project(camera);
   assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1);
  }
  const before=camera.quaternion.clone(),mount=camera.position.clone();
  const moved=[fighter(-1,-2),fighter(-2,0)];
  controller.track(moved,1/60);
  const first=before.angleTo(camera.quaternion);
  for(let i=0;i<100;i++)controller.track(moved,1/60);
  assert.ok(first>0&&first<before.angleTo(camera.quaternion)/4);
  assert.deepEqual(camera.position.toArray(),mount.toArray());
 }
});

test('free camera uses a contained horizontal path and yields to manual control',()=>{
 const {camera,controller}=setup(catalog.ward);
 assert.equal(controller.select('free'),false);
 controller.allowFree(true);
 assert.equal(controller.select('free'),true);
 const mount=camera.position.clone();
 controller.look(50,20);
 for(let i=0;i<300;i++){
  controller.move(1,1,1/60);
  const {x,z}=camera.position;
  assert.ok(controller.navigation.clear({x,z},{x,z},CAMERA_CLEARANCE-1e-5));
 }
 assert.ok(camera.position.distanceTo(mount)>.3);
 assert.equal(camera.position.y,3);
 controller.allowFree(false);
 assert.equal(controller.mode,'corner-1');
});

test('corners smoothly reframe around active patients and hold when nobody remains',()=>{
 const {camera,controller}=setup(catalog.ring);
 const {camera:reference,controller:activeOnly}=setup(catalog.ring);
 const snapshot={rigSegments:[fighter(-2,1),fighter(2,-1)],lifeStates:['active','active']};
 const step=(cam,state)=>cam.update(state,state,1,new Map(),.05,1/60);
 for(let i=1;i<=4;i++){
  controller.select('corner-'+i);
  activeOnly.select('corner-'+i);
  step(controller,snapshot);
  step(activeOnly,snapshot);
  const before=camera.quaternion.clone(),fov=camera.fov;
  const after={...snapshot,lifeStates:['incapacitated','active']};
  const survivor={rigSegments:[snapshot.rigSegments[1]],lifeStates:['active']};
  step(controller,after);
  const firstTurn=before.angleTo(camera.quaternion);
  assert.ok(firstTurn>0);
  assert.ok(Math.abs(camera.fov-fov)<5);
  for(let frame=0;frame<100;frame++){
   step(controller,{...after,rigSegments:[fighter(-3,frame%2?2:-2),snapshot.rigSegments[1]]});
   step(activeOnly,survivor);
  }
  step(activeOnly,survivor);
  assert.ok(firstTurn<before.angleTo(camera.quaternion)/4);
  assert.ok(camera.quaternion.angleTo(reference.quaternion)<1e-7);
  assert.equal(camera.fov,reference.fov);
  const last=camera.quaternion.toArray(),lastFov=camera.fov;
  step(controller,{...after,lifeStates:['incapacitated','incapacitated']});
  assert.deepEqual(camera.quaternion.toArray(),last);
  assert.equal(camera.fov,lastFov);
 }
});
