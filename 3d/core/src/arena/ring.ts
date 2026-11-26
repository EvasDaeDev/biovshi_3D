import type {NativeLocation} from './location-adapter.js';
import type {Vec3} from '../types.js';

export function createRingLocation():NativeLocation{
 const radius=4.5;
 const boundary=Array.from({length:64},(_,i)=>{
  const angle=i*2*Math.PI/64;
  return {x:radius*Math.cos(angle),z:radius*Math.sin(angle)};
 });
 const spawnSlots=ringSpawnSlots(8);
 return {
  id:'ring',name:'Ринг · ⌀ 9 м',capacity:8,width:9,depth:9,
  shape:'circle',boundaryHeight:.30,floorRevision:'9m-v1',boundary,objects:[],walls:[],
  spawns:spawnSlots,spawnSlots,
  patrol:[{x:0,z:0},...spawnSlots.map(([x,,z])=>({x,z}))],
 };
}

export function ringSpawnSlots(count:number):Vec3[]{
 return Array.from({length:count},(_,i)=>{
  const angle=i*2*Math.PI/count;
  return [2.95*Math.sin(angle),0,2.95*Math.cos(angle)];
 });
}
