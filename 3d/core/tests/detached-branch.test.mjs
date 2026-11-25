import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const f=createLabConfig(7).fighters[0],make=()=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});return c;};
const cut=(c,id)=>{assert.ok(c.applyDamage({fighterId:0,segmentId:id,amount:3}));return c.drainEvents().find(e=>e.type==='segment-detached');};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('one cut captures an intact leg in original world pose, root first',()=>{
 const c=make(),before=c.getSnapshot().rigSegments[0],e=cut(c,'L.upperLeg');
 assert.deepEqual(e.detachedParts.map(p=>p.id),['L.upperLeg','L.lowerLeg','L.foot']);
 assert.deepEqual(e.detachedParts,before.filter(p=>p.id.startsWith('L.')&&/(Leg|foot)$/.test(p.id)));
 assert.equal(c.getSnapshot().damageStats.detached,3);assert.equal(c.getSnapshot().mobilityModes[0],'single-support');
 assert.ok(e.detachedParts.every(p=>!c.getSnapshot().segmentIds[0].includes(p.id)));
});
test('a previous cut is never resurrected or duplicated by a later parent cut',()=>{
 const c=make(),foot=cut(c,'R.foot'),leg=cut(c,'R.upperLeg');
 assert.deepEqual(foot.detachedParts.map(p=>p.id),['R.foot']);
 assert.deepEqual(leg.detachedParts.map(p=>p.id),['R.upperLeg','R.lowerLeg']);
 assert.equal(c.getSnapshot().damageStats.detached,3);
});
test('real Rapier keeps a severed leg connected throughout flight and settled terrain conversion',async()=>{
 await RAPIER.init();const c=make(),w=new DebrisWorld(RAPIER);
 try{
  const e=cut(c,'L.upperLeg');w.accept(e);const initial=w.branchSnapshot()[0].parts;
  assert.equal(w.branchSnapshot().length,1);assert.equal(w.snapshot().length,3);
  const invariant=parts=>{for(let i=0;i<parts.length;i++)for(let j=0;j<parts.length;j++)for(const a of ['a','b'])for(const b of ['a','b'])assert.ok(Math.abs(distance(initial[i][a],initial[j][b])-distance(parts[i][a],parts[j][b]))<1e-6);};
  for(let i=0;i<900;i++){w.step(FIXED_DT);if(i%15===0)invariant(w.branchSnapshot()[0].parts);}
  const settled=w.branchSnapshot()[0];assert.ok(settled.settled);invariant(settled.parts);
  assert.equal(w.snapshot().length,3);assert.ok(w.snapshot().every(p=>p.settled&&p.branchId===settled.id));
  const cones=w.moundSnapshot();assert.ok(cones.length>=1&&cones.length<=2);assert.ok(cones.every(m=>m.source==='branch'&&m.height<=.30));
  const count=cones.length;for(let i=0;i<120;i++)w.step(FIXED_DT);assert.equal(w.moundSnapshot().length,count);
  settled.parts[0].a[0]=999;assert.notEqual(w.branchSnapshot()[0].parts[0].a[0],999);
  w.reset();assert.equal(w.branchSnapshot().length,0);assert.equal(w.snapshot().length,0);assert.equal(w.moundSnapshot().length,0);
 }finally{w.dispose();}
});
