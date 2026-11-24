import type { WorldConfig } from './types.js';
import { LAB_SEGMENTS } from './rig/anatomy.js';
const starts = [[0,1.4],[-3,-3.3],[2.8,-3.4],[3.5,.8],[-3.7,.6],[-2.7,3.4],[2.4,3.4],[.5,-1.6]] as const;
export function createLabConfig(seed: number): WorldConfig {
  const segmentIds = LAB_SEGMENTS.map(s=>s.id);
  return {seed,fighters:starts.map(([x,z],id)=>({id,origin:[x,0,z],
    yawRad:id ? -(Math.PI+id*.42) : 0,segmentIds:[...segmentIds]}))};
}
