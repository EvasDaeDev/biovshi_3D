import test from 'node:test';
import assert from 'node:assert/strict';
import {mobilityFor} from '../dist/rig/mobility.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const cfg=createLabConfig(7).fighters[0];
const run=(segments,sprint)=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...cfg,segmentIds:segments}]});
 for(let i=0;i<120;i++)c.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:0,sprint}]});
 return c.getSnapshot();};
test('mobility is derived from complete support chains, not arms',()=>{
 assert.equal(mobilityFor(cfg.segmentIds).mode,'biped');
 assert.equal(mobilityFor(cfg.segmentIds.filter(s=>s!=='R.hand')).mode,'biped');
 const one=mobilityFor(cfg.segmentIds.filter(s=>s!=='R.foot'));assert.equal(one.mode,'single-support');assert.equal(one.canSprint,false);assert.deepEqual(one.support,[true,false]);
 assert.equal(mobilityFor(cfg.segmentIds.filter(s=>!s.endsWith('foot'))).mode,'unsupported');
});
test('single support limits movement and disables sprint; unsupported stops translation',()=>{
 const one=cfg.segmentIds.filter(s=>!s.startsWith('R.')||!/(Leg|foot)$/.test(s));
 const a=run(one,true),b=run(one,false),full=run(cfg.segmentIds,false),none=run(cfg.segmentIds.filter(s=>!/(Leg|foot)$/.test(s)),true);
 assert.equal(a.mobilityModes[0],'single-support');assert.deepEqual(a,b);
 assert.ok(a.roots[2]<cfg.origin[2]&&a.roots[2]>full.roots[2]);
 assert.equal(none.mobilityModes[0],'unsupported');assert.ok(Math.abs(none.roots[2]-cfg.origin[2])<1e-6);
 assert.ok(a.rigSegments[0].every(p=>[...p.a,...p.b].every(Number.isFinite)));
});
test('counter-rotation preserves girdle lengths and exact limb attachments',()=>{
 const s=run(cfg.segmentIds,true),p=Object.fromEntries(s.rigSegments[0].map(p=>[p.id,p]));
 const axis=p=>p.b.map((v,i)=>v-p.a[i]),h=axis(p.pelvis),c=axis(p.chest);
 assert.ok(Math.abs(Math.hypot(...h)-.34)<1e-8);assert.ok(Math.abs(Math.hypot(...c)-.68)<1e-8);
 assert.ok(h[2]*c[2]<0,'opposing axial twist');
 assert.deepEqual(p.pelvis.a,p['L.upperLeg'].a);assert.deepEqual(p.chest.b,p['R.upperArm'].a);
});
