import test from 'node:test';
import assert from 'node:assert/strict';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {LabSimulationCore,createAuthoredCombatConfig} from '../dist/index.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
import {POSE_DRAFT_KEY,roundPatientPoses} from '../../lab-next/pose-draft.js';
import {referencePose} from '../dist/rig/pose-editor.js';
const dt=1/60;
test('idle and guard lean forward, stagger feet and counter-pitch neck',()=>{
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:Object.fromEntries(['stance','stalk','aggressive'].map(k=>[k,referencePose(k)]))});
 const g=new PatientGait([0,0,0],0,true,motion);
 for(const guard of [false,true]){
  for(let i=0;i<240;i++){g.advance([0,0,0],0,0,dt);g.advanceExpression(dt,false,guard?'aggressive':'stance',guard);}
  const p=g.pose(0,[0,0,0],0,0),get=id=>p.find(v=>v.id===id),mid=v=>v.a.map((x,i)=>(x+v.b[i])/2),angle=(a,b)=>Math.atan2(a[2]-b[2],b[1]-a[1])*180/Math.PI;
  const ab=get('abdomen'),ch=mid(get('chest')),neck=get('neck'),f=g.footStates.map(x=>x.point);
  assert.ok(Math.abs(angle(ab.a,ab.b)-(guard?15:10))<1.5);
  assert.ok(Math.abs(angle(ab.b,ch)-10)<1.5);
  assert.ok(Math.abs(angle(neck.a,neck.b))<2);
  assert.ok(Math.abs(f[0][2]-f[1][2])>.08);
  assert.ok(Math.abs(f[0][0]-f[1][0])>(guard?.58:.44));
  for(const side of ['L','R']){const hand=get(side+'.hand'),upper=get(side+'.upperArm');assert.ok(hand.a[2]<upper.a[2]-.25);if(guard)assert.ok(hand.a[1]>upper.a[1]+.12);}
 }
});

test('a stored editor stance changes the actual ring torso and feet on the next round',async()=>{
 const {ring}=await buildLocationCatalog();
 const config=createAuthoredCombatConfig(7,ring,2),defaults=ring.patientPoses;
 const stance=defaults.slots.stance.map(part=>{
  if(part.id==='abdomen')return {...part,rotation:[(part.rotation?.[0]??0)+.14,...(part.rotation??[0,0,0]).slice(1)]};
  if(part.id==='L.foot')return {...part,offset:[-.08,0,-.06]};
  return part;
 });
 const storage={getItem(key){
  assert.equal(key,POSE_DRAFT_KEY);
  return JSON.stringify({schemaVersion:1,stature:1.65,slots:{stance}});
 }};
 const poses=roundPatientPoses(defaults,storage);
 assert.equal(poses.slots.aggressive,defaults.slots.aggressive);
 assert.equal(roundPatientPoses(defaults,{getItem:()=>'{broken'}),defaults);
 const core=new LabSimulationCore();
 const sample=patientPoses=>{
  core.initialize({...config,patientPoses});
  for(let tick=0;tick<90;tick++)core.step(dt,{commands:config.fighters.map(({id})=>({fighterId:id,forward:0,turn:0,sprint:false}))});
  const s=core.getSnapshot(),p=s.rigSegments[0].find(p=>p.id==='abdomen'),yaw=s.roots[3];
  const pitch=Math.atan2((p.b[0]-p.a[0])*Math.sin(yaw)-(p.b[2]-p.a[2])*Math.cos(yaw),p.b[1]-p.a[1]);
  const feet=s.footStates[0].map(p=>p.point);
  return {pitch,feet};
 };
 try{
  const stock=sample(defaults),edited=sample(poses);
  assert.ok(Math.abs(stock.pitch-edited.pitch)>.08,JSON.stringify({stock,edited}));
  assert.ok(Math.hypot(...stock.feet[0].map((v,i)=>v-edited.feet[0][i]))>.04);
  const restored=sample(roundPatientPoses(defaults,{getItem:()=>null}));
  assert.deepEqual(restored,stock);
 }finally{core.dispose();}
});

function torsoAngles(pose){
 const abdomen=pose.find(part=>part.id==='abdomen'),chest=pose.find(part=>part.id==='chest');
 const center=chest.a.map((x,i)=>(x+chest.b[i])/2);
 const pitch=(a,b)=>Math.atan2(a[2]-b[2],b[1]-a[1]);
 return {spine:pitch(abdomen.a,abdomen.b),thorax:pitch(abdomen.b,center)};
}
const rotated=(pose,id,pitch)=>pose.map(part=>part.id===id?
 {...part,rotation:[(part.rotation?.[0]??0)+pitch,part.rotation?.[1]??0,part.rotation?.[2]??0]}:part);

test('an isolated editor chest rotation changes thorax pitch during idle, running and injury',async()=>{
 const {ring}=await buildLocationCatalog(),defaults=ring.patientPoses;
 const draft=roundPatientPoses(defaults,{getItem:()=>JSON.stringify({
  schemaVersion:1,stature:1.65,slots:{stance:rotated(defaults.slots.stance,'chest',-.45)}
 })});
 function sample(document,speed,hurt){
  const gait=new PatientGait([0,0,0],0,true,compileAuthoredMotion(document));
  for(let i=0;i<60;i++){
   gait.advance([0,0,0],0,speed,dt);
   gait.advanceExpression(dt,hurt,speed?'stalk':'stance');
  }
  return torsoAngles(gait.pose(0,[0,0,0],0,1));
 }
 for(const [speed,hurt] of [[0,false],[1.2,false],[0,true]]){
  const stock=sample(defaults,speed,hurt),edited=sample(draft,speed,hurt);
  assert.ok(edited.thorax-stock.thorax>.25,JSON.stringify({speed,hurt,stock,edited}));
  assert.ok(Math.abs(stock.spine-edited.spine)<.03,JSON.stringify({stock,edited}));
 }
});
