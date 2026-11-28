import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LabCamera} from '../../lab-next/lab-camera.js';
import {CAMERA_CLEARANCE,CAMERA_FIXTURE_CLEARANCE,ringCameraRadii} from '../../lab-next/arena-camera-layout.js';
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
 const {camera,controller}=setup(catalog.square);
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
 const step=(cam,state)=>cam.update(state,state,1,new Map(),1/60);
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

test('GoPro keeps its chosen horizontal angle after resize and switching camera modes',()=>{
 const {camera,controller}=setup(catalog.square);
 const horizontal=()=>2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect)*180/Math.PI;
 controller.select('gopro');
 assert.ok(Math.abs(horizontal()-105)<1e-9);
 for(const angle of [90,105,120]){
  controller.setHeadAngle(angle);
  for(const aspect of [16/9,1,9/16]){
   controller.resize(aspect);
   assert.ok(Math.abs(horizontal()-angle)<1e-9);
  }
 }
 controller.select('corner-1');
 assert.equal(camera.fov,65);
 controller.select('gopro');
 assert.ok(Math.abs(horizontal()-120)<1e-9);
});

test('authored ring mounts are forward of the entire camera fixture, not inside the housing',()=>{
 const root=new THREE.Group(),fixture=new THREE.Group();
 root.add(fixture);
 fixture.rotation.y=Math.PI/4;
 fixture.position.y=3;
 const dirs=[[1,1],[-1,1],[-1,-1],[1,-1]];
 // Deliberately use nonmatching Blender indices and varied fixture depths.
 const expected=[];
 for(let i=0;i<4;i++){
  const [sx,sz]=dirs[i],dir=new THREE.Vector3(sx,0,sz).normalize();
  const depth=.3+i*.06,center=dir.clone().multiplyScalar(4.05);
  const housing=new THREE.Mesh(new THREE.BoxGeometry(.24,.24,depth));
  housing.name='camera_0'+(4-i)+'_housing';
  housing.position.copy(center).applyAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/4);
  housing.rotation.y=Math.atan2(sx,sz)-Math.PI/4;
  fixture.add(housing);
  const hood=new THREE.Mesh(new THREE.BoxGeometry(.22,.08,.08));
  hood.name='camera_0'+(4-i)+'_hood';
  hood.position.copy(dir.clone().multiplyScalar(4.05-depth/2-.02)).applyAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/4);
  hood.rotation.y=housing.rotation.y;fixture.add(hood);
  expected.push(4.05-depth/2-.06-CAMERA_FIXTURE_CLEARANCE);
 }
 // Non-camera geometry must not change the mount calculation.
 const floor=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));floor.name='arena_floor';root.add(floor);
 const radii=ringCameraRadii(root),{camera,controller}=setup(catalog.ring);
 controller.setArena(catalog.ring,radii);
 for(let i=0;i<4;i++){
  assert.ok(Math.abs(radii[i]-expected[i])<1e-6);
  controller.select('corner-'+(i+1));
  assert.equal(camera.position.y,3);
  assert.ok(Math.hypot(camera.position.x,camera.position.z)<=radii[i]+1e-9);
  assert.ok(controller.navigation.clear(camera.position,camera.position,CAMERA_CLEARANCE));
 }
 controller.setArena(catalog.square);
 controller.select('corner-1');
 const native=setup(catalog.square).camera.position;
 assert.deepEqual(camera.position.toArray(),native.toArray());
 assert.deepEqual(ringCameraRadii(new THREE.Group()),[null,null,null,null]);
});

test('third-person camera follows behind the patient and shortens against walls',()=>{
 const {camera,controller}=setup(catalog.square);
 const state={fighterIds:[0],roots:[0,0,2,0],headFrames:[{center:[0,1.6,2],forward:[0,0,-1]}]};
 const update=()=>controller.update(state,state,1,new Map(),1/60);
 controller.select('third-person');
 update();
 assert.equal(controller.patientInput.disabled,false);
 assert.ok(camera.position.z>3.9&&camera.position.z<=4.34);
 assert.ok(camera.position.x>0&&camera.position.y>1.5);
 const close=camera.position.clone();
 state.roots[2]=.8;
 state.headFrames[0].center[2]=.8;
 update();
 assert.ok(camera.position.distanceTo(close)<.45);
 for(let i=0;i<90;i++)update();
 assert.ok(Math.abs(camera.position.z-3.95)<.08);
 controller.look(250,30);
 const before=camera.position.clone();
 for(let i=0;i<60;i++)update();
 assert.ok(camera.position.distanceTo(before)>.8);
 assert.ok(controller.navigation.clear({x:0,z:.8},camera.position,.155));
});
