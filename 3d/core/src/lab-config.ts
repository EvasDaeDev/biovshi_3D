import {PATIENT_SCALE} from './rig/patient-scale.js';
import type { WorldConfig } from './types.js';
import type { NativeLocation } from './arena/location-adapter.js';
import { LAB_SEGMENTS } from './rig/anatomy.js';
const starts = [[0,1.4],[-3,-3.3],[2.8,-3.4],[3.5,.8],[-3.7,.6],[-2.7,3.4],[2.4,3.4],[.5,-1.6]] as const;
export function createLabConfig(seed: number): WorldConfig {
  const segmentIds = LAB_SEGMENTS.map(s=>s.id);
  return {seed,fighters:starts.map(([x,z],id)=>({id,origin:[x,0,z],
    yawRad:id ? -(Math.PI+id*.42) : 0,segmentIds:[...segmentIds]}))};
}

/** Eight-patient native free-for-all, same arena and seeded traits. */
export function createArenaCombatConfig(seed:number,escapeCombat=false,perceptionCombat=false):WorldConfig{
 const base=createLabConfig(seed);
 return {...base,combatEnabled:true,expandedStrikes:true,tacticalCombat:true,escapeCombat,perceptionCombat,
  fighters:base.fighters.map(f=>({...f,profile:f.id%3===0?{movement:4,critical:2,turning:3,temperament:'impulsive'}:f.id%3===1?{movement:2,critical:4,turning:3,temperament:'hesitant'}:{movement:3,critical:3,turning:3,temperament:'balanced'}}))};
}

/** Diagnostic obstacle scenario; product locations will supply wall geometry. */
export function createNavigationCombatConfig(seed:number):WorldConfig{
 return {...createArenaCombatConfig(seed,true,true),walls:[{minX:-.28,maxX:.28,minZ:-.65,maxZ:.65,height:2.8}]};
}

/** Reuses P3 profiles/anatomy and the *original* v1 safe spawn slots.
 * A tenth patient is a new ID sharing a profile template, not a new fighting
 * AI or invented skeletal prototype. No 8-fighter cap leaks into authored maps. */
export function createAuthoredCombatConfig(seed:number,location:NativeLocation,participants=location.capacity):WorldConfig{
 if(!Number.isInteger(participants)||participants<2||participants>location.capacity||
  participants>10||location.spawnSlots.length<participants)
  throw new RangeError('Unsupported authored arena occupancy');
 const base=createArenaCombatConfig(seed,true,true);
 const fighters=location.spawnSlots.slice(0,participants).map((origin,id)=>{
  const exemplar=base.fighters[id%base.fighters.length]!;
  return {...exemplar,id,origin,
   yawRad:Math.atan2(-origin[0],origin[2])};
 });
 return {...base,location,walls:location.walls,fighters,
  ...(location.shape==='circle'?{patientScale:PATIENT_SCALE}:{}),
  ...(location.terrain?{gradedSurface:location.terrain.triangles}:{})};
}
