import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyLocationTerrain} from './location-terrain.mjs';
import {readPoseDocument} from '../dist/rig/pose-editor.js';
import {createSquareLocation} from '../dist/arena/square.js';
import {createRingLocation} from '../dist/arena/ring.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export async function buildLocationCatalog(){
 const patientPoses=readPoseDocument(JSON.parse(await readFile(resolve(root,'3d/lab-next/patient-poses.json'),'utf8')));
 const result={ring:{...createRingLocation(),patientPoses},square:{...createSquareLocation(),patientPoses}};
 const terrain=JSON.parse(await readFile(resolve(root,'3d/locations/terrain.json'),'utf8'));
 return applyLocationTerrain(result,terrain);
}
