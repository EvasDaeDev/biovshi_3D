import type { WorldConfig } from './types.js';
import { LAB_SEGMENTS } from './rig/anatomy.js';
const starts = [[0,1.4],[-3,-3.3],[2.8,-3.4],[3.5,.8],[-3.7,.6],[-2.7,3.4],[2.4,3.4],[.5,-1.6]] as const;
export function createLabConfig(seed: number): WorldConfig {
  const segmentIds = LAB_SEGMENTS.map(s=>s.id);
  return {seed,fighters:starts.map(([x,z],id)=>({id,origin:[x,0,z],
    yawRad:id ? -(Math.PI+id*.42) : 0,segmentIds:[...segmentIds]}))};
}

/** Eight-patient native free-for-all, same arena and seeded traits. */
export function createArenaCombatConfig(seed:number):WorldConfig{
 const base=createLabConfig(seed);
 return {...base,combatEnabled:true,expandedStrikes:true,tacticalCombat:true,
  fighters:base.fighters.map(f=>({...f,profile:f.id%3===0?{movement:4,critical:2,turning:3,temperament:'impulsive'}:f.id%3===1?{movement:2,critical:4,turning:3,temperament:'hesitant'}:{movement:3,critical:3,turning:3,temperament:'balanced'}}))};
}
