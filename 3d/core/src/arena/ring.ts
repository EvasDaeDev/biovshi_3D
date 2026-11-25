import type {NativeLocation} from './location-adapter.js';
import type {Vec3} from '../types.js';

export function createRingLocation():NativeLocation{
 const radius=2.5;
 const boundary=Array.from({length:64},(_,i)=>{
  const angle=i*2*Math.PI/64;
  return {x:radius*Math.cos(angle),z:radius*Math.sin(angle)};
 });
 const spawnSlots=Array.from({length:3},(_,i):Vec3=>{
  const angle=i*2*Math.PI/3;
  return [1.5*Math.sin(angle),0,1.5*Math.cos(angle)];
 });
 return {
  id:'ring',name:'Ринг · ⌀ 5 м',capacity:3,width:5,depth:5,
  shape:'circle',boundaryHeight:.30,floorRevision:'5m-v1',boundary,objects:[],walls:[],
  spawns:spawnSlots,spawnSlots,
  patrol:[{x:0,z:0},...spawnSlots.map(([x,,z])=>({x,z}))],
 };
}
