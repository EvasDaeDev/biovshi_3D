import {ARENA_WALL_HEIGHT,type NativeLocation} from './location-adapter.js';
import type {Vec3} from '../types.js';

export function createSquareLocation():NativeLocation{
 const halfSize=4.5,postRadius=.25,spawn=3.25;
 const boundary=[
  {x:-halfSize,z:-halfSize},{x:halfSize,z:-halfSize},
  {x:halfSize,z:halfSize},{x:-halfSize,z:halfSize}
 ];
 const column=Array.from({length:24},(_,i)=>{
  const angle=i*2*Math.PI/24;
  return {x:postRadius*Math.cos(angle),z:postRadius*Math.sin(angle)};
 });
 const spawnSlots:Vec3[]=[
  [spawn,0,spawn],[-spawn,0,-spawn],[-spawn,0,spawn],[spawn,0,-spawn],
  [0,0,spawn],[0,0,-spawn],[-spawn,0,0],[spawn,0,0]
 ];
 return {
  id:'square',name:'Квадрат · 9 × 9 м',capacity:8,width:9,depth:9,
  boundaryHeight:ARENA_WALL_HEIGHT,floorRevision:'9m-column50-v1',boundary,
  objects:[{kind:'wall',height:ARENA_WALL_HEIGHT,points:column,convexParts:[column]}],
  walls:[{minX:-postRadius,maxX:postRadius,minZ:-postRadius,maxZ:postRadius,height:ARENA_WALL_HEIGHT}],
  spawns:spawnSlots.slice(0,4),spawnSlots,
  patrol:spawnSlots.map(([x,,z])=>({x,z}))
 };
}
