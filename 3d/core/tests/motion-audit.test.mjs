import test from 'node:test';
import assert from 'node:assert/strict';
import {motionSample,MotionReport} from '../scripts/motion-audit-metrics.mjs';
import {auditMotion} from '../scripts/audit-motion.mjs';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
const snapshot=(tick,x,yaw,endpoint=[1,0,0],life='active')=>{
 const transform=p=>[x+Math.cos(yaw)*p[0]-Math.sin(yaw)*p[2],p[1],Math.sin(yaw)*p[0]+Math.cos(yaw)*p[2]];
 return {tick,roots:[x,0,0,yaw],fighterIds:[0],lifeStates:[life],rigSegments:[[{id:'arm',radius:.1,a:transform([0,0,0]),b:transform(endpoint)}]]};
};
test('root-local audit ignores rigid translation and rotation but detects articulated angle',()=>{
 const a=snapshot(0,0,0),b=snapshot(1,2,Math.PI/2);
 const m=motionSample(a,b);
 assert.ok(m.peaks.world.value>1);assert.ok(m.peaks.local.value<1e-10);assert.ok(m.peaks.angle.value<1e-7);
 const c=snapshot(2,2,Math.PI/2,[0,1,0]);
 const n=motionSample(b,c,a);
 assert.ok(Math.abs(n.peaks.angle.value-90)<1e-8);assert.ok(n.peaks.deltaChange.value>1.4);
 assert.equal(n.accelerationCompared,1);
});
test('ownership transitions, nonconsecutive ticks and phase filtering remain explicit',()=>{
 const a=snapshot(0,0,0),b=snapshot(1,10,0,[1,0,0],'incapacitated');
 const n=motionSample(a,b);assert.equal(n.compared,0);assert.equal(n.excluded,1);
 assert.equal(motionSample(a,b,null,[3]).excluded,0);
 assert.throws(()=>motionSample(a,snapshot(3,0,0)));
 const r=new MotionReport();r.add('fall',n);assert.equal(r.report().fall.metrics.local.p95,null);
});
test('real authored motion audit covers deterministic review, damage and native combat',async()=>{
 const {ring}=await buildLocationCatalog(),results=auditMotion(ring);
 assert.deepEqual(results.map(r=>r.scenario),['locomotion','combat','damage','knockdown']);
 const [walk,fight,damage,fall]=results;
 for(const phase of ['idle','walk','brake','turn','burst','settle'])assert.ok(walk.motion[phase]?.compared>0,phase);
 assert.equal(walk.events['fighter-damaged']??0,0);
 assert.ok(fight.events['combat-windup']>0);assert.ok(fight.events['strike-contact']>0);
 assert.ok(damage.events['fighter-damaged']>=2);
 assert.ok(fall.events['fighter-knocked-down']>0);assert.ok(fall.events['fighter-recovered']>0);
 for(const r of results)for(const g of Object.values(r.motion))for(const m of Object.values(g.metrics))assert.ok(m.p95===null||Number.isFinite(m.p95));
});
