import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';

test('ring AI can land a punch and a kick while retaining striking distance',async()=>{
 const {ring}=await buildLocationCatalog();
 const core=new LabSimulationCore();
 core.initialize(createAuthoredCombatConfig(7,ring,2));
 try{
  const starts=new Map(),contacts={arm:[],leg:[]};
  for(let tick=0;tick<1200;tick++){
   core.step(FIXED_DT,{commands:[]});
   const events=core.drainEvents();
   if(!events.some(e=>e.type==='combat-windup'||e.type==='strike-contact'))continue;
   const {roots}=core.getSnapshot();
   const distance=(a,b)=>Math.hypot(roots[a*4]-roots[b*4],roots[a*4+2]-roots[b*4+2]);
   for(const e of events){
    if(e.type==='combat-windup')starts.set(e.fighterId,distance(e.fighterId,e.targetId));
    if(e.type==='strike-contact'&&e.strikeKind in contacts){
     const gap=distance(e.attackerId,e.fighterId),start=starts.get(e.attackerId);
     contacts[e.strikeKind].push({gap,closing:start-gap});
     assert.ok(e.sourceSegment.endsWith(e.strikeKind==='arm'?'.hand':'.foot'));
    }
   }
  }
  assert.ok(contacts.arm.some(c=>c.gap>.82&&c.closing<.24),JSON.stringify(contacts));
  assert.ok(contacts.leg.some(c=>c.gap>.95&&c.closing<.28),JSON.stringify(contacts));
 }finally{core.dispose();}
});

test('an imported arena keeps the same reach-based fight spacing as the ring',async()=>{
 const {ring,ward}=await buildLocationCatalog();
 const core=new LabSimulationCore();
 const config=createAuthoredCombatConfig(19,ward,2);
 core.initialize({...config,patientPoses:ring.patientPoses});
 try{
  let distantPunch=false,distantKick=false;
  for(let tick=0;tick<1800&&!(distantPunch&&distantKick);tick++){
   core.step(FIXED_DT,{commands:[]});
   const contacts=core.drainEvents().filter(event=>event.type==='strike-contact');
   if(!contacts.length)continue;
   const {roots}=core.getSnapshot();
   for(const {strikeKind,attackerId,fighterId} of contacts){
    const gap=Math.hypot(roots[attackerId*4]-roots[fighterId*4],roots[attackerId*4+2]-roots[fighterId*4+2]);
    if(strikeKind==='arm'&&gap>.9)distantPunch=true;
    if(strikeKind==='leg'&&gap>.8)distantKick=true;
   }
  }
  assert.ok(distantPunch,'punch must connect before the roots close to point-blank range');
  assert.ok(distantKick,'kick must connect before the roots close to point-blank range');
 }finally{core.dispose();}
});
