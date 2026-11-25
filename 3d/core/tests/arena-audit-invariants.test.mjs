import test from 'node:test';
import assert from 'node:assert/strict';
import {assertVisibleAnatomy,segmentKey} from '../scripts/arena-audit-invariants.mjs';

const original=new Set([segmentKey(0,'head'),segmentKey(0,'L.hand'),segmentKey(1,'chest')]);
const snapshot=()=>{
 return {fighterIds:[0,1],rigSegments:[[{id:'head'}],[{id:'chest'}]]};
};
const severed=()=>({
 fighterId:0,segmentId:'L.hand',length:.1,radius:.06,
 position:{x:0,y:.1,z:0},rotation:{x:0,y:0,z:0,w:1}
});

test('P4 long audit conserves anatomy across living/settled rigs and detached parts',()=>{
 assert.equal(assertVisibleAnatomy(original,snapshot(),[severed()],new Set(['0:L.hand'])),3);
});

test('P4 long audit fails on missing detached meshes rather than treating cones as anatomy',()=>{
 assert.throws(()=>assertVisibleAnatomy(original,snapshot(),[],new Set(['0:L.hand'])),
  /Visible anatomy disappeared/);
 assert.throws(()=>assertVisibleAnatomy(original,snapshot(),[severed()],new Set()),
  /without severing event/);
});

test('P4 long audit fails on duplicate or invented anatomy even when counts look plausible',()=>{
 const double=snapshot();double.rigSegments[0].push({id:'L.hand'});
 assert.throws(()=>assertVisibleAnatomy(original,double,[severed()],new Set(['0:L.hand'])),
  /Duplicate visual anatomy/);
 const invented={...severed(),segmentId:'invented'};
 assert.throws(()=>assertVisibleAnatomy(original,snapshot(),[invented],new Set(['0:invented'])),
  /Unexpected visual anatomy/);
 assert.throws(()=>assertVisibleAnatomy(original,snapshot(),[{...severed(),position:{x:NaN,y:.1,z:0}}],new Set(['0:L.hand'])),
  /Nonfinite detached anatomy/);
});
