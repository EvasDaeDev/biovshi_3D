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
