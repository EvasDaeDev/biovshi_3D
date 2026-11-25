import type {NativeLocation} from './location-adapter.js';
import type {Vec3} from '../types.js';

export function createRingLocation():NativeLocation{
 const radius=3.5;
 const boundary=Array.from({length:64},(_,i)=>{
  const angle=i*2*Math.PI/64;
  return {x:radius*Math.cos(angle),z:radius*Math.sin(angle)};
 });
 const spawnSlots=Array.from({length:3},(_,i):Vec3=>{
  const angle=i*2*Math.PI/3;
  return [2.3*Math.sin(angle),0,2.3*Math.cos(angle)];
 });
 return {
  id:'ring',name:'Ринг · ⌀ 7 м',capacity:3,width:7,depth:7,
  shape:'circle',boundaryHeight:.30,floorRevision:'7m-v1',boundary,objects:[],walls:[],
  spawns:spawnSlots,spawnSlots,
  patrol:[{x:0,z:0},...spawnSlots.map(([x,,z])=>({x,z}))],
 };
}
