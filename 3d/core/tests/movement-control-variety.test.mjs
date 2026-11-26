import test from 'node:test';
import assert from 'node:assert/strict';
import {FightVariety} from '../dist/combat/fight-variety.js';
import {HORROR_MOVEMENT,HORROR_CRAWL_TIMING,CRAWL_TIMING,bipedStep,horrorBipedStep} from '../dist/rig/movement-timing.js';
import {manualInput,capturesTextInput} from '../../lab-next/manual-control.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {referencePose} from '../dist/rig/pose-editor.js';
const dt=FIXED_DT;
test('attempt memory reduces repetition without consuming RNG during previews; lateral lane is conditional',()=>{
 const v=new FightVariety(7,1),copy=new FightVariety(7,1),a={side:'L',contactId:'chest',distance:.4,aim:[0,0,0],id:'chest'},b={...a,side:'R',contactId:'head',id:'head'};
 const first=v.adjustment('arm',a);assert.equal(first,v.adjustment('arm',a));assert.equal(first,copy.adjustment('arm',a));
 for(let i=0;i<3;i++)v.committed('arm',a);
 assert.ok(v.adjustment('arm',a)<v.adjustment('head',b));
 const c={distance:1.1,facing:0,grounded:false,temperament:'balanced',opponent:{phase:'idle',targetId:null,source:null,resolved:false}};
 const here={x:1.1,z:0},target={x:0,z:0};
 const p=v.reposition(10,2,here,target,c,false,false,()=>true);
 assert.ok(p&&Math.abs(p.z)>.3);assert.equal(v.reposition(11,2,here,target,c,true,false,()=>true),null);
 assert.equal(v.reposition(12,2,here,target,c,false,false,()=>false),null);
});
test('manual control selects actual fighter id and never commands other AI patients',()=>{
 const ids=new Uint32Array([2,7,9]),states=['active','active','incapacitated'],keys=new Set(['KeyW','KeyK']),has=(...codes)=>Number(codes.some(k=>keys.has(k)));
 assert.deepEqual(manualInput(ids,states,'7',has).commands,[{fighterId:7,forward:1,turn:0,sprint:false,jump:false,attack:true,attackKind:'leg'}]);
 assert.deepEqual(manualInput(ids,states,'',has).commands,[]);assert.deepEqual(manualInput(ids,states,'9',has).commands,[]);
});
test('authored travel profile increases pace and reach; one leg stops hopping at release',()=>{
 assert.ok(HORROR_MOVEMENT.walkSpeed>.9&&HORROR_MOVEMENT.sprintSpeed>1.9);
 assert.ok(HORROR_CRAWL_TIMING.reach>CRAWL_TIMING.reach&&HORROR_CRAWL_TIMING.swing<CRAWL_TIMING.swing);
 assert.ok(horrorBipedStep(1.5).lead>bipedStep(.9).lead);
 const f=createLabConfig(7).fighters[0],removed=new Set(['R.upperLeg','R.lowerLeg','R.foot']);
 const ids=f.segmentIds.filter(s=>!removed.has(s));
 assert.equal(f.segmentIds.length-ids.length,3);
 const core=new LabSimulationCore();core.initialize({seed:7,patientScale:.81,patientPoses:{schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk')}},fighters:[{...f,segmentIds:ids}]});
 const initial=core.getSnapshot();
 assert.equal(initial.mobilityModes[0],'single-support');
 assert.ok(initial.rigSegments[0].some(p=>p.id==='L.foot'));
 assert.ok(initial.rigSegments[0].every(p=>!removed.has(p.id)));
 const step=forward=>{core.step(dt,{commands:[{fighterId:f.id,forward,turn:0,sprint:false}]});return core.getSnapshot();};
 let flight=false;for(let i=0;i<90;i++){const s=step(1);flight=flight||s.hopPhases[0]==='flight';}
 // Keep advancing even after a flight was observed.
 for(let i=0;i<60;i++)step(1);
 assert.ok(flight);
 for(let i=0;i<45;i++)step(0);
 const stopped=core.getSnapshot();assert.equal(stopped.hopPhases[0],'idle');
 for(let i=0;i<60;i++){const s=step(0);assert.equal(s.hopPhases[0],'idle');assert.equal(s.roots[2],stopped.roots[2]);}
 core.dispose();
});

test('debug checkbox focus never captures motion keys; editing seed or text does',()=>{
 for(const type of ['checkbox','radio','button','range'])assert.equal(capturesTextInput({tagName:'INPUT',type}),false,type);
 for(const type of ['number','text','search','password'])assert.equal(capturesTextInput({tagName:'INPUT',type}),true,type);
 assert.equal(capturesTextInput({tagName:'TEXTAREA'}),true);
 assert.equal(capturesTextInput({tagName:'DIV',isContentEditable:true}),true);
 assert.equal(capturesTextInput({tagName:'BODY'}),false);
 assert.equal(capturesTextInput(null),false);
});
