import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLocation,convexParts,locationBoundary,locationSpawnSlots} from '../../../src/game/location-geometry.js';
import {applyLocationTerrain} from './location-terrain.mjs';
import {createRingLocation} from '../dist/arena/ring.js';
import {adaptLegacyLocation} from '../dist/arena/location-adapter.js';

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

export async function buildLocationCatalog(){
 const result={ring:createRingLocation()};
 const terrain=JSON.parse(await readFile(resolve(root,'3d/locations/terrain.json'),'utf8'));
 return applyLocationTerrain(result,terrain);
}
