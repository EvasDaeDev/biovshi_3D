import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
import {manualInput} from '../../lab-next/manual-control.js';

const ring=(await buildLocationCatalog()).ring;
const config=createAuthoredCombatConfig(7,ring,2);
const command=(id,values={})=>({fighterId:id,forward:0,turn:0,sprint:false,...values});
const start=(gap,yaw=0,origins=[[0,0,gap],[0,0,0]])=>{
 const core=new LabSimulationCore();
 core.initialize({...config,fighters:config.fighters.map((f,i)=>({...f,origin:origins[i],yawRad:i?Math.PI:yaw}))});
 return core;
};
const step=(core,input)=>{
 core.step(FIXED_DT,{commands:[input,command(1)]});
 return core.getSnapshot();
};
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const unit=a=>a.map(v=>v/Math.hypot(...a));
const center=p=>p.a.map((v,i)=>(v+p.b[i])*.5);

test('walking and running neck inherits both chest lean and shoulder roll while turning',()=>{
 // Keep the entire sprint/turn sample away from the arena rail and the
 // stationary opponent; faster acceleration must not shorten the sample.
 const core=start(0,Math.PI/2,[[-2,0,-.7],[0,0,-3.3]]);
 try{
  let measured=0,lean=0,roll=0;
  for(let i=0;i<102;i++){
   const s=step(core,command(0,{forward:1,turn:i>40?.32:0,sprint:i<42}));
   if(i<24||Math.abs(s.roots[0])>2.9)continue;
   const part=id=>s.rigSegments[0].find(p=>p.id===id);
   const chest=part('chest'),neck=part('neck'),across=unit(sub(chest.b,chest.a));
   const thorax=unit(sub(center(chest),part('abdomen').b));
   const chestUp=unit(thorax.map((v,i)=>v-dot(thorax,across)*across[i]));
   assert.ok(dot(unit(sub(neck.b,neck.a)),chestUp)>.999999,'neck must share the chest frame');
   const mount=ring.patientPoses.slots.tPose.find(p=>p.id==='neck').offset[1];
   const expected=center(chest).map((v,i)=>v+chestUp[i]*mount);
   assert.ok(Math.hypot(...sub(neck.a,expected))<1e-8);
   lean=Math.max(lean,Math.hypot(chestUp[0],chestUp[2]));
   roll=Math.max(roll,Math.abs(across[1]));
   measured++;
  }
  assert.ok(measured>20&&lean>.10&&roll>.035,JSON.stringify({measured,lean,roll}));
 }finally{core.dispose();}
});

for(const sprint of [false,true]){
 test(`a single Space press while ${sprint?'sprinting':'walking'} produces a forward jump and landing`,()=>{
  // Start far from the opponent so collision correction cannot move the root.
  const core=start(0,Math.PI/2,[[-3,0,0],[0,0,3]]);
  try{
   let s,last;
   for(let i=0;i<47;i++){
    last=s;s=step(core,command(0,{forward:1,sprint}));
    if(i>=30&&s.roots[0]-last.roots[0]>.012&&(!sprint||s.footStates[0].every(f=>f.moving)))break;
   }
   assert.ok(s.roots[0]-last.roots[0]>.012,'must be moving before the jump');
   if(sprint)assert.ok(s.footStates[0].every(f=>f.moving),'exercise the jump request while both running feet are in swing');
   const origin=s.roots[0],phases=[],keys=new Set(sprint?['KeyW','ShiftLeft','Space']:['KeyW','Space']);
   let peak=0,firstPrepare=null,lastPrepare=0,firstFlight=null,endFlight=0;
   for(let i=0;i<100;i++){
    const manual=manualInput(s.fighterIds,s.lifeStates,'0',(...names)=>Number(names.some(k=>keys.has(k))));
    s=step(core,manual.commands[0]);
    keys.delete('Space');
    const phase=s.hopPhases[0];
    if(phase!==phases.at(-1))phases.push(phase);
    if(phase==='prepare'){firstPrepare??=s.roots[0];lastPrepare=s.roots[0];}
    if(phase==='flight')firstFlight??=s.roots[0];
    if(phase==='flight')endFlight=s.roots[0];
    peak=Math.max(peak,s.hopHeights[0]);
   }
   assert.deepEqual(phases.filter(p=>p!=='idle'),['prepare','flight','pause']);
   assert.equal(s.hopPhases[0],'idle');
   assert.ok(lastPrepare-firstPrepare>.012,'preparation must allow grounded movement');
   assert.ok(peak>.17&&endFlight-firstFlight>.55&&endFlight-origin>.55);
  }finally{core.dispose();}
 });
}

for(const [kind,key] of [['arm','KeyJ'],['head','KeyL'],['leg','KeyK']])for(const sprint of [false,true]){
 test(`${kind} strike can land while ${sprint?'approaching at a run':'walking'}`,()=>{
  const core=start(sprint?(kind==='head'?2.6:kind==='arm'?2.8:3.5):1.3);
  const press=sprint?(kind==='leg'?44:31):15;
  try{
   let s=core.getSnapshot(),windup,contact;
   for(let tick=0;tick<100&&!contact;tick++){
    const keys=new Set(['KeyW',...(sprint?['ShiftLeft']:[])]);
    // Tap kick once during the run. It should wait for support and still fire.
    if(sprint&&kind==='leg'?tick===press:tick>=press)keys.add(key);
    const manual=manualInput(s.fighterIds,s.lifeStates,'0',(...names)=>Number(names.some(k=>keys.has(k))));
    if(!sprint)manual.commands[0].forward=.68;
    const prior=s;s=step(core,manual.commands[0]);
    for(const event of core.drainEvents()){
     if(event.type==='combat-windup'&&event.fighterId===0&&!windup){
      assert.equal(event.strikeKind,kind);
      assert.ok((prior.roots[2]-s.roots[2])*60>.30,'must still be advancing during windup');
      if(kind==='leg')assert.ok(prior.footStates[0].every(f=>!f.moving));
      windup={tick,z:s.roots[2]};
     }
     if(event.type==='strike-contact'&&event.attackerId===0)contact={event,z:s.roots[2]};
    }
   }
   assert.ok(windup&&contact,'expected actual windup and contact');
   assert.equal(contact.event.strikeKind,kind);
   if(sprint&&kind==='leg')assert.ok(windup.tick>press&&windup.tick<=press+24);
   assert.ok(windup.z-contact.z>.025,'movement must continue into actual contact');
  }finally{core.dispose();}
 });
}

test('standing jump winds the arms back before swinging them through takeoff',()=>{
 const core=start(0,0,[[0,0,0],[2.5,0,1.5]]);
 try{
  const reach=s=>{
   const parts=s.rigSegments[0];
   return ['L','R'].reduce((total,side)=>total+parts.find(p=>p.id===side+'.hand').a[2]-parts.find(p=>p.id===side+'.upperArm').a[2],0)/2;
  };
  let preparation=-Infinity,flight=Infinity;
  for(let i=0;i<75;i++){
   const state=step(core,command(0,{jump:i===1}));
   if(state.hopPhases[0]==='prepare')preparation=Math.max(preparation,reach(state));
   if(state.hopPhases[0]==='flight')flight=Math.min(flight,reach(state));
  }
  assert.ok(Number.isFinite(preparation)&&Number.isFinite(flight));
  assert.ok(preparation-flight>.12,JSON.stringify({preparation,flight}));
 }finally{core.dispose();}
});
