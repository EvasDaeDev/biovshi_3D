import * as T from 'three';
import {createLabConfig,LabSimulationCore} from '../core/dist/index.js';
import {headCameraPosition} from '../core/dist/rig/head-frame.js';
import {PATIENT_SCALE} from '../core/dist/rig/patient-scale.js';
import {CameraEffects} from './camera-effects.js';
import {headVerticalFov} from './lab-camera.js';
import {segmentShadow} from './gopro-shadow.js';
import {patientSegmentFrame} from './patient-frame.js';
import {createSegmentVisual} from './segment-visual.js';
import {applySceneLighting,createSceneLighting} from './scene-lighting.js';

export function createLightingPreview(renderer,slots,model,portrait){
 const scene=new T.Scene();
 scene.background=new T.Color(0x09100e);
 const lights=createSceneLighting(T,renderer,scene);
 const config=createLabConfig(7),core=new LabSimulationCore();
 core.initialize({...config,patientScale:PATIENT_SCALE,patientPoses:{schemaVersion:1,pivotVersion:2,stature:1.65,slots},
  fighters:config.fighters.map((fighter,i)=>({...fighter,origin:[0,0,-2*i],yawRad:i?Math.PI:0}))});
 const state=core.getSnapshot();
 core.dispose();
 const palette=new T.MeshStandardMaterial({color:0xa58c83}),parts=state.rigSegments[1];
 const basis=new T.Matrix4(),vector=values=>new T.Vector3(...values);
 for(const part of parts){
  const frame=patientSegmentFrame(part,parts,Math.PI,state.headFrames[1]);
  const mesh=model?model.create(part.id,part.radius,frame.length,palette,portrait):
   createSegmentVisual(part.id,part.radius,frame.length,palette,portrait);
  mesh.position.set(...frame.center);
  mesh.quaternion.setFromRotationMatrix(basis.makeBasis(vector(frame.x),vector(frame.y),vector(frame.z)));
  scene.add(segmentShadow(mesh));
 }
 const floor=new T.Mesh(new T.PlaneGeometry(12,12),new T.MeshStandardMaterial({color:0x26362e,roughness:1}));
 floor.rotation.x=-Math.PI/2;floor.position.z=-2;floor.receiveShadow=true;
 const wall=new T.Mesh(new T.BoxGeometry(8,3.1,.18),new T.MeshStandardMaterial({color:0x62685e,roughness:1}));
 wall.position.set(0,1.55,-5.09);
 wall.receiveShadow=true;
 scene.add(floor,wall);
 const camera=new T.PerspectiveCamera(65,1,.015,60);
 camera.position.set(...headCameraPosition(state.headFrames[0]));
 const forward=new T.Vector3(0,Math.sin(-.14),-Math.cos(-.14));
 camera.lookAt(new T.Vector3().copy(camera.position).add(forward));
 lights.flashlight.position.copy(camera.position).addScaledVector(forward,.20);
 lights.flashlight.target.position.copy(lights.flashlight.position).addScaledVector(forward,4);
 const effects=new CameraEffects(T,renderer);
 return (aspect,settings,post)=>{
  camera.aspect=aspect;camera.fov=headVerticalFov(105,aspect);camera.updateProjectionMatrix();
  applySceneLighting(lights,settings,'gopro',true);
  effects.draw(scene,camera,post,0,'gopro');
 };
}
