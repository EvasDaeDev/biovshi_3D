import assert from 'node:assert/strict';

/** P3 anatomical-conservation invariant shared with P4 long-running combat.
 * Every original segment remains visible exactly once: either attached
 * to a living/settled patient or as an independently rendered detached mesh.
 * Static terrain cones are deliberately NOT counted as visual anatomy. */
export const segmentKey=(fighterId,segmentId)=>fighterId+':'+segmentId;

export function assertVisibleAnatomy(expected,snapshot,detachedGeometry,detachedKeys){
 const actual=new Set();
 const register=key=>{
  assert.ok(expected.has(key),'Unexpected visual anatomy: '+key);
  assert.ok(!actual.has(key),'Duplicate visual anatomy: '+key);
  actual.add(key);
 };
 for(let i=0;i<snapshot.fighterIds.length;i++)
  for(const p of snapshot.rigSegments[i])register(segmentKey(snapshot.fighterIds[i],p.id));
 for(const p of detachedGeometry){
  const key=segmentKey(p.fighterId,p.segmentId);
  assert.ok(detachedKeys.has(key),'Rendered detached part without severing event: '+key);
  assert.ok([p.length,p.radius,...Object.values(p.position),...Object.values(p.rotation)].every(Number.isFinite),
   'Nonfinite detached anatomy: '+key);
  register(key);
 }
 assert.equal(actual.size,expected.size,'Visible anatomy disappeared');
 assert.equal(detachedGeometry.length,detachedKeys.size,'Detached segments are missing/doubled');
 return actual.size;
}
