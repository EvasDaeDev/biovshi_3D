import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
import {reserveTarget} from '../dist/combat/reach-reserve.js';

const {ring}=await buildLocationCatalog();
function attack(kind,gap,removed=[],ticks=60){
 const config=createAuthoredCombatConfig(7,ring,2);
 const core=new LabSimulationCore();
 core.initialize({...config,fighters:[
  {...config.fighters[0],origin:[0,0,gap],yawRad:0,segmentIds:config.fighters[0].segmentIds.filter(id=>!removed.includes(id))},
  {...config.fighters[1],origin:[0,0,0],yawRad:Math.PI}
 ]});
 const events=[];
 try{
  for(let tick=0;tick<ticks;tick++){
   core.step(FIXED_DT,{commands:[
    {fighterId:0,forward:0,turn:0,sprint:false,attack:true,attackKind:kind},
    {fighterId:1,forward:0,turn:0,sprint:false}
   ]});
   events.push(...core.drainEvents());
  }
  return events;
 }finally{core.dispose();}
}

test('all four remaining arm and leg tips can cause damage in the live ring',()=>{
 const noRightArm=['R.upperArm','R.lowerArm','R.hand'];
 const cases=[
  ['arm','L.lowerArm',[...noRightArm,'L.hand']],
  ['arm','L.upperArm',[...noRightArm,'L.hand','L.lowerArm']],
  ['leg','L.lowerLeg',['L.foot']],
  ['leg','L.upperLeg',['L.foot','L.lowerLeg']]
 ];
 for(const [kind,source,removed] of cases){
  const events=attack(kind,.5,removed);
  assert.ok(events.some(e=>e.type==='strike-contact'&&e.attackerId===0&&e.sourceSegment===source),source);
  assert.ok(events.some(e=>e.type==='fighter-damaged'&&e.fighterId===1),source);
 }
});

test('ordinary head strike makes contact near, and stays idle from outside its trajectory',()=>{
 assert.ok(attack('head',.50).some(e=>e.type==='strike-contact'&&e.attackerId===0&&e.sourceSegment==='head'));
 assert.ok(!attack('head',1.25).some(e=>e.type==='combat-windup'&&e.fighterId===0));
});

test('the reserved target retains capsule geometry after moving a 92% gap to its full length',()=>{
 const pelvis=(z)=>({id:'pelvis',a:[-.17,1,z],b:[.17,1,z],radius:.135});
 const [reserved]=reserveTarget([pelvis(0)],[pelvis(-.92)]);
 assert.equal(reserved.radius,.135);
 assert.ok(Math.abs(reserved.a[2]+1)<1e-10);
 assert.ok(Math.abs(reserved.b[2]+1)<1e-10);
 assert.equal(reserved.a[1],1);
});
