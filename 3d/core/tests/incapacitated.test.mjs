import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {resolveCollisions} from '../dist/collision/resolve.js';
const f={...createLabConfig(7).fighters[0],origin:[0,0,0]};
const command={commands:[{fighterId:0,forward:1,turn:1,sprint:true}]};
const d=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('terminal handoff is idempotent, retains anatomy, freezes controls and owns pose data',()=>{
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});
 assert.equal(c.incapacitate(0),true);assert.equal(c.incapacitate(0),false);
 const [event]=c.drainEvents();assert.equal(event.type,'fighter-incapacitated');assert.equal(event.bodyPose.length,17);
 const before=c.getSnapshot();event.bodyPose[0].a[0]=999;
 for(let i=0;i<90;i++)c.step(FIXED_DT,command);
 const after=c.getSnapshot();assert.deepEqual(after.roots,before.roots);assert.deepEqual(after.rigSegments,before.rigSegments);
 assert.deepEqual(after.lifeStates,['incapacitated']);assert.equal(after.damageStats.detached,0);
 const shifted=after.rigSegments[0].map(p=>({...p,a:p.a.map((v,i)=>v+(i===0?1:0)),b:p.b.map((v,i)=>v+(i===0?1:0))}));
 c.setIncapacitatedPose(0,shifted);shifted[0].a[0]=999;assert.notEqual(c.getSnapshot().rigSegments[0][0].a[0],999);
 assert.throws(()=>c.setIncapacitatedPose(0,[]));c.initialize({seed:7,fighters:[f]});assert.deepEqual(c.getSnapshot().lifeStates,['active']);
});
test('real Rapier ragdoll articulates, preserves bone lengths and becomes static anatomy over walkable cones',async()=>{
 await RAPIER.init();const world=new DebrisWorld(RAPIER),c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});
 try{
  c.incapacitate(0);const [e]=c.drainEvents();world.accept(e);world.accept(e);
  const initial=world.bodySnapshot()[0],start=initial.parts;
  assert.equal(initial.dynamicBodies,15);assert.equal(initial.joints,14);
  const get=(parts,id)=>parts.find(p=>p.id===id);
  let bent=false,maxGap=0;
  for(let i=0;i<900;i++){world.step(FIXED_DT);for(const b of world.bodySnapshot()){
   c.setIncapacitatedPose(b.fighterId,b.parts,b.settled);
   for(const side of ['L','R'])for(const [u,l] of [['upperArm','lowerArm'],['upperLeg','lowerLeg']]){
    const before=d(get(start,side+'.'+u).a,get(start,side+'.'+l).b),after=d(get(b.parts,side+'.'+u).a,get(b.parts,side+'.'+l).b);
    if(!b.settled&&Math.abs(before-after)>.08)bent=true;
    maxGap=Math.max(maxGap,d(get(b.parts,side+'.'+u).b,get(b.parts,side+'.'+l).a));
   }
  }}
  assert.ok(bent,'a ragdoll must change relative limb geometry before settling');assert.ok(maxGap<.15,'joint gap '+maxGap);
  const s=c.getSnapshot(),end=s.rigSegments[0];
  assert.equal(world.bodySnapshot().length,1);assert.equal(end.length,17);assert.equal(world.snapshot().length,0);const cones=world.moundSnapshot();assert.ok(cones.length>0&&cones.length<=4);assert.ok(cones.every(m=>m.source==='body'&&m.height<=.30));assert.equal(s.bodyTerrainStates[0],true);assert.equal(world.bodySnapshot()[0].settled,true);
  assert.ok(end.find(p=>p.id==='head').a[1]<.8);
  for(let i=0;i<end.length;i++){assert.equal(start[i].id,end[i].id);assert.equal(start[i].radius,end[i].radius);assert.ok(Math.abs(d(start[i].a,start[i].b)-d(end[i].a,end[i].b))<1e-6);}
  assert.equal(world.bodySnapshot()[0].dynamicBodies,0);assert.equal(world.bodySnapshot()[0].joints,0);
  for(let i=0;i<120;i++)world.step(FIXED_DT);assert.deepEqual(world.bodySnapshot()[0].parts,end);
  world.reset();assert.equal(world.bodySnapshot().length,0);assert.equal(world.moundSnapshot().length,0);
 }finally{world.dispose();}
});
test('living collision correction does not displace a physics-owned actor',()=>{
 const a={id:0,x:0,y:0,z:0},b={id:1,x:.2,y:0,z:0,fixed:true};
 const pose=a=>[{id:'chest',a:[a.x,1,0],b:[a.x,1.3,0],radius:.235}];
 resolveCollisions([a,b],pose);assert.ok(a.x<0);assert.equal(b.x,.2);
});
