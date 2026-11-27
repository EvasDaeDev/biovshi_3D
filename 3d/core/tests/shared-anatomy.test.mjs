import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {createCompound,compoundPose} from '../../lab-next/compound.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
import {createAuthoredCombatConfig,FIXED_DT,LabSimulationCore} from '../dist/index.js';
import {physicalCapsule,useSharedAnatomy} from '../dist/rig/shared-anatomy.js';
import {sweptContact} from '../dist/combat/swept-contact.js';

const size=p=>Math.hypot(...p.b.map((v,i)=>v-p.a[i]));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} should equal ${b}`);

test('published T-pose anatomy supplies all editor slots and live locomotion',async()=>{
 const {ring}=await buildLocationCatalog(),{slots}=ring.patientPoses;
 const reference=new Map(slots.tPose.map(part=>[part.id,part]));
 for(const [slot,parts] of Object.entries(slots)){
  const resolved=useSharedAnatomy(parts,slots.tPose);
  for(const [i,part] of resolved.entries()){
   assert.deepEqual(part.rotation,parts[i].rotation,slot);
   assert.deepEqual(part.offset,parts[i].offset,slot);
   const anatomical=reference.get(part.id);
   assert.equal(part.length,anatomical.length,slot);
   assert.deepEqual(part.collider,anatomical.collider,slot);
  }
 }
 const config=createAuthoredCombatConfig(1,ring),core=new LabSimulationCore();
 try{
  core.initialize({...config,combatEnabled:false,fighters:[{...config.fighters[0],origin:[0,0,0],yawRad:0}]});
  for(let i=0;i<=30;i++){
   const parts=core.getSnapshot().rigSegments[0];
   for(const part of parts){
    const ref=reference.get(part.id),capsule=physicalCapsule(part);
    close(size(part),ref.length);
    close(size(capsule),ref.collider?.length??ref.length);
    close(capsule.radius,ref.collider?.radius??ref.radius);
   }
   core.step(FIXED_DT,{commands:[{fighterId:config.fighters[0].id,forward:1,turn:0,sprint:true}]});
  }
 }finally{core.dispose();}
});

test('contacts use the physical radius and centred axis independently of the skeleton',()=>{
 const head={id:'head',a:[0,0,0],b:[0,0,0],radius:.154,collider:{radius:.135}};
 const probe={id:'probe',a:[.152,0,0],b:[.152,0,0],radius:.01};
 assert.equal(sweptContact(head,head,probe,probe),null);
 assert.equal(sweptContact({...head,collider:undefined},{...head,collider:undefined},probe,probe),0);
 const chest={id:'chest',a:[-.30,0,0],b:[.30,0,0],radius:.12,collider:{length:.235}};
 const capsule=physicalCapsule(chest);
 close(capsule.a[0],-.1175);
 close(capsule.b[0],.1175);
 assert.deepEqual(chest.b,[.30,0,0]);
});

test('Rapier handoff uses physical dimensions and retains rendered bone endpoints',async()=>{
 await RAPIER.init();
 const world=new RAPIER.World({x:0,y:-9.81,z:0});
 try{
  const chest={id:'chest',a:[-.30,1,0],b:[.30,1,0],radius:.12,collider:{length:.235,radius:.10}};
  const body=createCompound(RAPIER,world,[chest],{groups:0x00010001});
  const [shape]=body.colliders;
  assert.ok(Math.abs(shape.radius()-.10)<1e-6);
  assert.ok(Math.abs(shape.halfHeight()-.1175)<1e-6);
  const [rendered]=compoundPose(body);
  close(size(rendered),.60);
  assert.equal(rendered.radius,.12);
  assert.deepEqual(rendered.collider,chest.collider);
 }finally{world.free();}
});
