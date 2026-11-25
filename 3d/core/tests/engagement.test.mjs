import test from 'node:test';
import assert from 'node:assert/strict';
import {pursuitForward,CLOSE_STANDOFF} from '../dist/combat/engagement.js';
import {LabSimulationCore,createLabConfig} from '../dist/index.js';

test('close-quarters pursuit stops for real strike opportunities, not failed geometry',()=>{
 assert.equal(CLOSE_STANDOFF,.46);
 assert.equal(pursuitForward(.4,0,.92),0,'preserve comfortable range until the preview is checked');
 assert.equal(pursuitForward(.4,0,.92,false),0);
 assert.equal(pursuitForward(.4,0,.92,true),.92,'failed strike geometry resumes approach');
 assert.equal(pursuitForward(.65,0,.92),.92,'distant pursuit unchanged');
 assert.equal(pursuitForward(.4,Math.PI/2,.92,true)<1e-14,true,'turn before approaching');
 assert.equal(pursuitForward(.4,Math.PI,.92,true),0,'no blind backward drift');
 assert.equal(pursuitForward(.4,0,.82,true),.82,'patient pursuit trait retained');
});

test('autonomous armless biped tries to close a sub-standoff gap when no arm strike exists',()=>{
 const base=createLabConfig(7);
 const withoutArms=base.fighters[0].segmentIds.filter(id=>!['L.upperArm','L.lowerArm','L.hand','R.upperArm','R.lowerArm','R.hand'].includes(id));
 const fighters=[
  {...base.fighters[0],origin:[0,0,.2],yawRad:0,segmentIds:withoutArms},
  {...base.fighters[1],origin:[0,0,-.2],yawRad:Math.PI},
 ];
 const c=new LabSimulationCore();
 try{
  c.initialize({seed:7,fighters,combatEnabled:true,tacticalCombat:true});
  // Exercise the command planner directly, rather than requiring physical
  // collision solvers to let two already-touching torsos overlap.
  const commands=new Map();
  c.planCombat(commands);
  assert.ok(commands.get(0).forward>0,'previous .46m cutoff left this patient idle');
  assert.equal(commands.get(0).turn,0);
  assert.equal(c.getSnapshot().strikes[0].phase,'idle','no imaginary strike');
  const manual={fighterId:0,forward:0,turn:0,sprint:false};
  const manualCommands=new Map([[0,manual]]);
  c.planCombat(manualCommands);
  assert.strictEqual(manualCommands.get(0),manual,'manual input must never be overridden');
 }finally{c.dispose();}
});
