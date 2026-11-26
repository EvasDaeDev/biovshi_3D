import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,punchPose,firstStrikeContact,FIXED_DT} from '../dist/index.js';
import {chooseExtra} from '../dist/combat/extra-choice.js';
const cfg=createLabConfig(7),ids=cfg.fighters[0].segmentIds,flat=()=>0;
const f={...cfg.fighters[0],origin:[0,0,0],yawRad:0};
const idle={commands:[{fighterId:0,forward:0,turn:0,sprint:false}]};
test('a standing patient can select low head, chest and arm capsules for a real kick',()=>{
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});
 try{
  const pose=c.getSnapshot().rigSegments[0];
  const p={kind:'leg',side:'L',targetId:1,aim:[-.22,.22,-.47],yaw:0,start:0};
  const struck=punchPose(pose,p,31,flat),foot=struck.find(v=>v.id==='L.foot');
  for(const id of ['head','chest','L.lowerArm']){
   const v={id,a:[...foot.a],b:[...foot.a],radius:.14};
   assert.equal(chooseExtra(pose,ids,[v],0,()=>true,'leg',flat),null);
   const choice=chooseExtra(pose,ids,[v],0,()=>true,'leg',flat,undefined,true);
   assert.ok(choice,id);
   const kick={...p,side:choice.side,aim:choice.aim};
   let previous=punchPose(pose,kick,19,flat),contact=null;
   for(const age of [23,27,31]){const next=punchPose(pose,kick,age,flat);contact??=firstStrikeContact(previous,next,[v],[v],choice.side,'leg');previous=next;}
   assert.equal(contact,id);
  }
  const far={id:'head',a:[0,.2,-4],b:[0,.2,-4],radius:.14};
  assert.equal(chooseExtra(pose,ids,[far],0,()=>true,'leg',flat,undefined,true),null);
  assert.equal(chooseExtra(pose,ids.filter(id=>!id.endsWith('.foot')),[{id:'head',a:foot.a,b:foot.a,radius:.14}],0,()=>true,'leg',flat,undefined,true),null);
 }finally{c.dispose();}
});
test('standing versus legless fixture produces real damage to the prone patient',()=>{
 const c=new LabSimulationCore(),legless=ids.filter(id=>!/\.(upperLeg|lowerLeg|foot)$/.test(id));
 // Legless patient faces the standing patient; it retains its real collision anatomy.
 c.initialize({seed:7,combatEnabled:true,expandedStrikes:true,fighters:[{...f,origin:[0,0,1.25]},{...cfg.fighters[1],origin:[0,0,-.05],yawRad:Math.PI,segmentIds:legless}]});
 try{
  const events=[];
  for(let i=0;i<900;i++){c.step(FIXED_DT,{commands:[{fighterId:1,forward:0,turn:0,sprint:false,attack:false}]});events.push(...c.drainEvents());}
  assert.ok(events.some(e=>e.type==='strike-contact'&&e.fighterId===1&&e.attackerId===0&&e.strikeKind==='leg'),JSON.stringify({hits:c.getSnapshot().damageStats.hits,windups:events.filter(e=>e.type==='combat-windup'),roots:Array.from(c.getSnapshot().roots)}));
  assert.ok(events.some(e=>e.type==='fighter-damaged'&&e.fighterId===1&&e.attackerId===0));
  assert.ok(!events.some(e=>e.type==='lab-hit'));
 }finally{c.dispose();}
});
