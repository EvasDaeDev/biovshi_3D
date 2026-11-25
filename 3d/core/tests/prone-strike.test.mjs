import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT,punchPose,firstStrikeContact} from '../dist/index.js';
import {chooseProneStrike} from '../dist/combat/prone-choice.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const base=createLabConfig(7),ids=base.fighters[0].segmentIds.filter(s=>!/\.(upperLeg|lowerLeg|foot)$/.test(s)),flat=()=>0;
const f={...base.fighters[0],origin:[0,0,0],yawRad:0,segmentIds:ids};
const idle={commands:[{fighterId:0,forward:0,turn:0,sprint:false}]};
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const get=(parts,id)=>parts.find(p=>p.id===id);
function pronePose(segmentIds=ids){
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,segmentIds}]});
 for(let i=0;i<60;i++)c.step(FIXED_DT,idle);
 assert.equal(c.getSnapshot().postures[0],'prone');return c.getSnapshot().rigSegments[0];
}
test('prone arm and head strikes keep torso and other supports fixed, bone lengths and floor clearance',()=>{
 const pose=pronePose();
 for(const kind of ['arm','head']){
  const source=kind==='arm'?'L.lowerArm':'head',origin=get(pose,kind==='arm'?'L.upperArm':'neck').a;
  const aim=[origin[0],kind==='arm'?.30:.38,origin[2]-(kind==='arm'?.55:.35)];
  const p={kind,prone:true,side:'L',targetId:1,aim,start:0,yaw:0};
  let movement=0;
  for(let t=0;t<48;t++){
   const parts=punchPose(pose,p,t,flat);
   for(const id of ['pelvis','abdomen','chest','R.upperArm','R.lowerArm','R.hand'])assert.deepEqual(get(parts,id),get(pose,id));
   for(const q of parts){assert.ok(Math.abs(dist(q.a,q.b)-LAB_SEGMENTS.find(v=>v.id===q.id).nominalLength)<1e-8,q.id);assert.ok(Math.min(q.a[1],q.b[1])-q.radius>=-1e-8,q.id);}
   movement=Math.max(movement,dist(get(parts,source).b,get(pose,source).b));
  }
  assert.ok(movement>.06,kind);
 }
});
test('ground strike preview uses real contact and cannot use a missing forearm',()=>{
 const pose=pronePose(),u=get(pose,'L.upperArm').a;
 const aim=[u[0],.30,u[2]-.56],p={kind:'arm',prone:true,side:'L',targetId:1,aim,start:0,yaw:0};
 const end=punchPose(pose,p,31,flat),hand=get(end,'L.hand'),v={id:'L.lowerLeg',a:hand.a,b:hand.a,radius:.10};
 assert.equal(firstStrikeContact(pose,end,[v],[v],'L','arm'),v.id);
 assert.ok(chooseProneStrike(pose,ids,[v],0,()=>true,'arm',flat,0));
 const noArms=ids.filter(s=>!/\.(upperArm|lowerArm|hand)$/.test(s));
 assert.equal(chooseProneStrike(pronePose(noArms),noArms,[v],0,()=>true,'arm',flat,0),null);
});
test('two legless active patients can attack from ground; no kicks or passive damage',()=>{
 const fighters=[{...f,origin:[0,0,1.05]},{...base.fighters[1],origin:[0,0,-1.05],yawRad:Math.PI,segmentIds:ids}];
 const c=new LabSimulationCore();c.initialize({seed:7,fighters,combatEnabled:true,expandedStrikes:true});
 const events=[];
 for(let i=0;i<1200;i++){c.step(FIXED_DT,{commands:[]});events.push(...c.drainEvents());}
 const contacts=events.filter(e=>e.type==='strike-contact');
 assert.ok(contacts.some(e=>e.proneStrike),JSON.stringify({windups:events.filter(e=>e.type==='combat-windup').length,roots:Array.from(c.getSnapshot().roots),hits:c.getSnapshot().damageStats.hits}));
 assert.ok(events.some(e=>e.type==='fighter-damaged'));assert.ok(!contacts.some(e=>e.strikeKind==='leg'));assert.ok(!events.some(e=>e.type==='lab-hit'));
});
