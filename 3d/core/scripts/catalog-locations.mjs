import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLocation,convexParts,locationBoundary,locationSpawnSlots} from '../../../src/game/location-geometry.js';
import {applyLocationTerrain} from './location-terrain.mjs';
import {readPoseDocument} from '../dist/rig/pose-editor.js';
import {createRingLocation} from '../dist/arena/ring.js';
import {adaptLegacyLocation,ARENA_WALL_HEIGHT} from '../dist/arena/location-adapter.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
/** Keep the original geometry available for regression tests. The published
 * catalog is assembled separately from native 3D location data. */
export async function buildLegacyLocationFixtures(){
 const manifest=JSON.parse(await readFile(resolve(root,'public/locations/active.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.active))throw Error('Invalid location manifest');
 const result=Object.create(null);
 for(const id of manifest.active){
  if(typeof id!=='string'||!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id))throw Error('Invalid location ID');
  const raw=JSON.parse(await readFile(resolve(root,'public/locations',id+'.json'),'utf8'));
  const {location,spawns,patrol}=parseLocation(raw,{id,spawnMargin:60});
  const parts=location.objects.map(o=>convexParts(o.points));
  result[id]=adaptLegacyLocation({location,boundary:locationBoundary(location),parts,spawns,spawnSlots:locationSpawnSlots(location,60),patrol});
 }
 return result;
}

// An area gain of 25% scales each horizontal coordinate by √1.25.
const LEGACY_ARENA_SCALE=Math.sqrt(1.25);
const metres=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
function expandLegacyArena(location){
 const scale=LEGACY_ARENA_SCALE;
 const point=({x,z})=>({x:x*scale,z:z*scale});
 const spawn=([x,y,z])=>[x*scale,y,z*scale];
 const width=location.width*scale,depth=location.depth*scale;
 const title=location.id==='maze'?'Лабиринт':location.name.split(' · ')[0];
 return {...location,width,depth,name:title+' · '+metres.format(width)+' × '+metres.format(depth)+' м',
  floorRevision:'area125-v1',boundaryHeight:ARENA_WALL_HEIGHT,
  boundary:location.boundary.map(point),patrol:location.patrol.map(point),
  spawns:location.spawns.map(spawn),spawnSlots:location.spawnSlots.map(spawn),
  objects:location.objects.map(object=>({...object,height:object.kind==='wall'?ARENA_WALL_HEIGHT:object.height,points:object.points.map(point),
   convexParts:object.convexParts.map(part=>part.map(point))})),
  walls:location.walls.map(wall=>({...wall,minX:wall.minX*scale,maxX:wall.maxX*scale,minZ:wall.minZ*scale,maxZ:wall.maxZ*scale}))
 };
}

export async function buildLocationCatalog(){
 const patientPoses=readPoseDocument(JSON.parse(await readFile(resolve(root,'3d/lab-next/patient-poses.json'),'utf8')));
 const fixtures=await buildLegacyLocationFixtures();
 const result={ring:{...createRingLocation(),patientPoses}};
 for(const [id,location] of Object.entries(fixtures))if(id!=='ring')result[id]=expandLegacyArena(location);
 const terrain=JSON.parse(await readFile(resolve(root,'3d/locations/terrain.json'),'utf8'));
 return applyLocationTerrain(result,terrain);
}
