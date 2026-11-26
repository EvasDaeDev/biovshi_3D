import test from 'node:test';
import assert from 'node:assert/strict';
import {KnockdownMotion} from '../dist/animation/knockdown-motion.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
import {mobilityFor} from '../dist/rig/mobility.js';
import {FIXED_DT} from '../dist/fixed-clock.js';
const ids=LAB_SEGMENTS.map(p=>p.id),mobility=mobilityFor(ids),ground=()=>0,dt=FIXED_DT;
const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk')}});
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const gap=(a,b)=>Math.max(...a.flatMap((p,i)=>['a','b'].map(k=>dist(p[k],b[i][k]))));
test('knockdown captures owned pose and interpolates original foot anchors',()=>{
 const p={id:'head',a:[1,2,3],b:[1,2,3],radius:.1};
 const k=new KnockdownMotion([1,0,3],[p],[[1,0,3],[2,0,3]]);
 p.a[0]=99;
 assert.deepEqual(k.source([2,0,3])[0].a,[2,2,3]);
 assert.deepEqual(k.foot(0,[2,0,3],0),[1,0,3]);
 assert.deepEqual(k.foot(0,[2,0,3],1),[2,0,3]);
 assert.ok(k.foot(0,[2,0,3],.01)[0]<1.01);
});
test('walking onset is retained and temporary fall/rise keeps nominal anatomy',()=>{
 const g=new PatientGait([0,0,0],0,true,motion);
 let root=[0,0,0];
 for(let i=0;i<40;i++){root=[0,0,-i*.01];g.advance(root,0,.6,dt);}
 const start=g.pose(0,root,0,.67),feet=g.footStates;
 g.beginKnockdown(root,start);
 assert.deepEqual(g.pose(0,root,0,.67),start);
 g.advance(root,0,0,dt,ground,mobility,ids,0);
 assert.deepEqual(g.footStates.map(f=>f.point),feet.map(f=>f.point));
 assert.deepEqual(g.pose(0,root,0,.67),start);
 for(let i=1;i<=39;i++){
  g.advance(root,0,0,dt,ground,mobility,ids,i/39);
  const p=g.pose(0,root,0,.67+i*dt);
  for(const part of p)assert.ok(Math.abs(dist(part.a,part.b)-LAB_SEGMENTS.find(s=>s.id===part.id).nominalLength)<1e-7,part.id);
  if(i===1)assert.ok(gap(start,p)<.08);
 }
 const down=g.pose(0,root,0,1.32);
 g.advance(root,0,0,dt,ground,mobility,ids,.9999);
 const rising=g.pose(0,root,0,1.32+dt);
 assert.ok(gap(down,rising)<.015);
 for(let i=50;i>=1;i--)g.advance(root,0,0,dt,ground,mobility,ids,i/51);
 const almost=g.pose(0,root,0,2.17);
 g.advance(root,0,0,dt,ground,mobility,ids,0);
 assert.equal(g.hasKnockdownMotion,false);assert.equal(g.posture,'upright');
 assert.ok(gap(almost,g.pose(0,root,0,2.17+dt))<.08);
});
