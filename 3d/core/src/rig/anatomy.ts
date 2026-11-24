/** Lab 04.1 vocabulary and nominal capsule dimensions (metres).
 * Parent here means severing dependency, not transform hierarchy.
 */
export interface LabSegment { readonly id:string; readonly parent:string|null; readonly radius:number; readonly nominalLength:number; readonly protected:boolean }
const segment=(id:string,parent:string|null,radius:number,nominalLength:number,protectedSegment=false):LabSegment=>Object.freeze({id,parent,radius,nominalLength,protected:protectedSegment});
export const LAB_SEGMENTS:readonly LabSegment[]=Object.freeze([
  segment('torso',null,.235,.50,true),segment('neck',null,.082,.23),segment('head','neck',.19,0),
  ...['L','R'].flatMap(s=>[
    segment(s+'.upperLeg',null,.124,.49),segment(s+'.lowerLeg',s+'.upperLeg',.103,.50),segment(s+'.foot',s+'.lowerLeg',.13,0),
    segment(s+'.upperArm',null,.100,.36),segment(s+'.lowerArm',s+'.upperArm',.083,.32),segment(s+'.hand',s+'.lowerArm',.083,0)
  ])
]);
export function severingChain(id:string):readonly string[]{
  const root=LAB_SEGMENTS.find(s=>s.id===id);
  if(!root||root.protected)return [];
  const result=[id];
  for(let i=0;i<result.length;i++)for(const s of LAB_SEGMENTS)if(s.parent===result[i])result.push(s.id);
  return result;
}
