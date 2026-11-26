import test from 'node:test';
import assert from 'node:assert/strict';
import {strikeLocomotion,kickTravelLimit} from '../dist/combat/strike-locomotion.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {referencePose} from '../dist/rig/pose-editor.js';
const command={fighterId:0,forward:.8,turn:-.4,sprint:true,jump:true,attack:true,attackKind:'arm'};
const p={kind:'arm',side:'L',targetId:1,aim:[0,1,-.5],yaw:0,start:0};
test('attack modifies movement, never erases forward/backward or turn intent',()=>{
 for(const kind of ['arm','head','leg'])for(const phase of ['windup','thrust','recover']){
  const c=strikeLocomotion(command,{...p,kind},phase);
  assert.ok(c.forward>0&&c.forward<=command.forward);
  assert.ok(c.turn<0&&Math.abs(c.turn)<=Math.abs(command.turn));
  assert.equal(c.jump,false);assert.equal(c.attack,true);
  assert.equal(c.sprint,kind!=='leg');
  assert.ok(strikeLocomotion({...command,forward:-1},{...p,kind},phase).forward<0);
 }
 assert.deepEqual(strikeLocomotion(command,p,'idle'),command);
});
test('kick movement keeps its supporting foot inside the bounded envelope',()=>{
 const plant=[0,0,0];
 assert.ok(Math.abs(kickTravelLimit([0,0,0],plant,0,.2)-.2)<1e-9);
 assert.ok(Math.abs(kickTravelLimit([0,0,-.30],plant,0,.2)-.08)<1e-9);
 assert.equal(kickTravelLimit([0,0,-.5],plant,0,.2),0);
 assert.equal(kickTravelLimit([0,0,-.5],plant,0,-.2),-.2);
 assert.equal(kickTravelLimit([0,0,0],plant,0,0),0);
});
test('authored manual punch can continue moving and turning during recovery',()=>{
 const slots=Object.fromEntries(['stance','stalk','punch','kick','headbutt'].map(k=>[k,referencePose(k)]));
 const cfg=createLabConfig(7),core=new LabSimulationCore();
 core.initialize({seed:7,patientScale:.81,patientPoses:{schemaVersion:1,stature:1.65,slots},combatEnabled:true,expandedStrikes:true,
  fighters:[{...cfg.fighters[0],origin:[0,0,.78],yawRad:0},{...cfg.fighters[1],origin:[0,0,0],yawRad:Math.PI}]});
 try{
  let started=false,recovery=null, moved=false, turned=false;
  for(let i=0;i<150;i++){
   const before=core.getSnapshot(),phase=before.strikes[0].phase;
   const backward=phase==='recover';
   core.step(FIXED_DT,{commands:[{fighterId:0,forward:backward?-.65:.25,turn:backward?.2:0,sprint:false,attack:true,attackKind:'arm'},{fighterId:1,forward:0,turn:0,sprint:false,attack:false}]});
   const s=core.getSnapshot();started||=s.strikes[0].phase!=='idle';
   if(s.strikes[0].phase==='recover'){
    recovery??=Array.from(s.roots.slice(0,4));
    moved||=s.roots[2]-recovery[2]>.02;
    turned||=Math.abs(s.roots[3]-recovery[3])>.015;
   }else if(recovery)break;
  }
  assert.ok(started,'real preview must start a strike');
  assert.ok(moved&&turned,'recovery must permit commanded motion');
 }finally{core.dispose();}
});
