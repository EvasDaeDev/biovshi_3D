/** Lab Next anatomy and nominal capsule dimensions (metres).
 * Parent here means severing dependency, not transform hierarchy.
 */
export interface LabSegment { readonly id:string; readonly parent:string|null; readonly radius:number; readonly nominalLength:number; readonly protected:boolean }
const segment=(id:string,parent:string|null,radius:number,nominalLength:number,protectedSegment=false):LabSegment=>Object.freeze({id,parent,radius,nominalLength,protected:protectedSegment});
export const LAB_SEGMENTS:readonly LabSegment[]=Object.freeze([
  segment('pelvis',null,.135,.34,true),segment('abdomen','pelvis',.135,.31,true),segment('chest','abdomen',.16,.68,true),segment('neck','chest',.082,.23),segment('head','neck',.19,0),
  ...['L','R'].flatMap(s=>[
    segment(s+'.upperLeg','pelvis',.124,.49),segment(s+'.lowerLeg',s+'.upperLeg',.103,.50),segment(s+'.foot',s+'.lowerLeg',.13,0),
    segment(s+'.upperArm','chest',.100,.36),segment(s+'.lowerArm',s+'.upperArm',.083,.32),segment(s+'.hand',s+'.lowerArm',.083,0)
  ])
]);
export function severingChain(id:string):readonly string[]{
  const root=LAB_SEGMENTS.find(s=>s.id===id);
  if(!root||root.protected)return [];
  const result=[id];
  for(let i=0;i<result.length;i++)for(const s of LAB_SEGMENTS)if(s.parent===result[i])result.push(s.id);
  return result;
}

export const TORSO_SEGMENT_IDS = ['pelvis','abdomen','chest'] as const;
const protectedIds = new Set(LAB_SEGMENTS.filter(s=>s.protected).map(s=>s.id));
export function isProtectedSegment(id:string):boolean{return id==='torso'||protectedIds.has(id);}
/** Accept old Lab config IDs, emit only v2 segment IDs. */
export function expandLegacyTorso(ids:readonly string[]):string[]{return [...new Set(ids.flatMap(id=>id==='torso'?[...TORSO_SEGMENT_IDS]:[id]))];}
