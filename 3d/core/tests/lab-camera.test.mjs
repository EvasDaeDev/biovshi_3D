import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LabCamera} from '../../lab-next/lab-camera.js';

test('follow camera rotates toward the selected patient without leaving the close camera position',()=>{
 const camera=new THREE.PerspectiveCamera(65,16/9,.05,60);
 const mode={value:'close'},patient={value:'2'},fov={value:'90'};
 const controller=new LabCamera(THREE,camera,mode,patient,fov);
 controller.setArena({shape:'circle',width:9,depth:9});
 const position=camera.position.clone(),initial=camera.quaternion.clone();
 const target=new THREE.Vector3(-2,1,0);
 const meshes=new Map([['2:chest',{visible:true,position:target}]]);
 const state={fighterIds:[2],roots:[-2,0,0,0]};
 const goal=camera.clone();goal.lookAt(target);

 mode.value='follow';mode.onchange();
 controller.update(state,state,1,meshes,0,1/60);
 assert.equal(patient.disabled,false);
 assert.deepEqual(camera.position.toArray(),position.toArray());
 assert.ok(camera.quaternion.angleTo(initial)>0);
 assert.ok(camera.quaternion.angleTo(goal.quaternion)>0.01);

 for(let frame=0;frame<60;frame++)controller.update(state,state,1,meshes,0,1/60);
 assert.deepEqual(camera.position.toArray(),position.toArray());
 assert.ok(camera.quaternion.angleTo(goal.quaternion)<.01);
});

test('external cameras stay behind the perimeter and below its top',()=>{
 const camera=new THREE.PerspectiveCamera(65,16/9,.05,60);
 const mode={value:'close'};
 const controller=new LabCamera(THREE,camera,mode,{value:'0'},{value:'90'});
 for(const arena of [{width:9,depth:9,shape:'circle',boundaryHeight:.3},{width:11.18,depth:5.59}]){
  controller.setArena(arena);
  const closeDistance=Math.hypot(camera.position.x,camera.position.z);
  assert.ok(closeDistance>9);
  assert.ok(camera.position.y<= (arena.boundaryHeight??2.8));
  mode.value='overview';mode.onchange();
  assert.ok(Math.hypot(camera.position.x,camera.position.z)>closeDistance);
  assert.ok(camera.position.y<= (arena.boundaryHeight??2.8));
  controller.resize(.56);
  camera.updateMatrixWorld();
  const border=arena.shape==='circle'?
   Array.from({length:16},(_,i)=>[4.5*Math.cos(i*Math.PI/8),4.5*Math.sin(i*Math.PI/8)]):
   [-1,1].flatMap(i=>[-1,1].map(j=>[i*arena.width/2,j*arena.depth/2]));
  for(const [x,z] of border){
   const point=new THREE.Vector3(x,0,z).project(camera);
   assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1);
  }
  controller.resize(16/9);
  mode.value='close';mode.onchange();
 }
});
