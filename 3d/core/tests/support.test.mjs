import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSupport} from '../dist/rig/support.js';
import {balanceStandingPose} from '../dist/rig/balance.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const flat=()=>0,ball=(id,x,y,z,r)=>({id,a:[x,y,z],b:[x,y,z],radius:r});
test('support hull encloses a centered mass and detects loss of support',()=>{
 const feet=[ball('L.foot',-.2,.13,0,.13),ball('R.foot',.2,.13,0,.13)];
 const center=ball('chest',0,1,0,.25),stable=analyzeSupport([...feet,center],flat);
 assert.equal(stable.contacts.length,2);assert.ok(stable.margin>0);assert.deepEqual(stable.correction,[0,0]);
 const single=analyzeSupport([feet[0],center],flat);assert.equal(single.contacts.length,1);assert.ok(single.margin<0&&single.correction[0]<0);
 const air=analyzeSupport([center],flat);assert.equal(air.margin,null);assert.equal(air.contacts.length,0);
 assert.equal(analyzeSupport([],flat).centerOfMass,null);
});
test('terrain sampling reports actual contact, clearance and excludes absent parts',()=>{
 const slope=(x,z)=>x>0?.2:0;
 const p=[ball('head',.3,.39,0,.19),ball('foot',-.3,.13,0,.13),ball('hand',-.3,.5,0,.083)];
 const s=analyzeSupport(p,slope);assert.deepEqual(s.contacts.map(c=>c.segmentId),['head','foot']);
 assert.ok(Math.abs(s.contacts[0].clearance)<1e-9);
 assert.equal(analyzeSupport(p.slice(1),slope).contacts.length,1);
 assert.equal(analyzeSupport(p,slope,new Set(['foot'])).contacts.length,1);
});
test('standing and airborne snapshots report geometry without mutating simulation',()=>{
 const f=createLabConfig(7).fighters[0],c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});
 const a=c.getSnapshot(),s=a.supports[0];
 assert.ok(s.contacts.some(p=>p.segmentId==='L.foot')&&s.contacts.some(p=>p.segmentId==='R.foot'));
 assert.ok(s.contacts.every(p=>p.clearance>=-1e-6));
 s.contacts[0].point[0]=999;assert.notEqual(c.getSnapshot().supports[0].contacts[0].point[0],999);
 c.initialize({seed:7,fighters:[{...f,segmentIds:f.segmentIds.filter(s=>!/^R\.(upperLeg|lowerLeg|foot)$/.test(s))}]});
 let airborne=false;
 for(let i=0;i<90;i++){
  c.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:0,sprint:false}]});
  const t=c.getSnapshot();if(t.hopHeights[0]>.06){assert.equal(t.supports[0].contacts.length,0);airborne=true;}
 }
 assert.ok(airborne);
});
test('bounded weight transfer keeps planted ankle and nominal leg lengths',()=>{
 const f=createLabConfig(7).fighters[0],c=new LabSimulationCore();c.initialize({seed:7,fighters:[f]});
 const pose=c.getSnapshot().rigSegments[0],before=analyzeSupport(pose,flat,new Set(['L.foot']));
 const afterPose=balanceStandingPose(pose,f.segmentIds,['L.foot'],flat),after=analyzeSupport(afterPose,flat,new Set(['L.foot']));
 assert.ok(after.margin>=before.margin-1e-8);
 const get=(p,id)=>p.find(v=>v.id===id),a=get(pose,'L.foot'),b=get(afterPose,'L.foot');
 assert.ok(Math.hypot(...a.a.map((v,i)=>v-b.a[i]))<1e-8);
 for(const [id,len] of [['L.upperLeg',.49],['L.lowerLeg',.50]]){
  const p=get(afterPose,id);assert.ok(Math.abs(Math.hypot(...p.a.map((v,i)=>v-p.b[i]))-len)<1e-8);
 }
});
