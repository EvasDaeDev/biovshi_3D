import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {rigCenterOfMass,capsuleMass} from '../dist/rig/support.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const f={...createLabConfig(7).fighters[0],origin:[0,0,0],yawRad:0},idle={commands:[]};
const center=p=>p.a.map((v,i)=>(v+p.b[i])*.5);
const get=(s,id)=>s.rigSegments[0].find(p=>p.id===id);
const make=(ids=f.segmentIds,yaw=0)=>{const c=new LabSimulationCore();c.initialize({seed:7,fighters:[{...f,yawRad:yaw,segmentIds:ids}]});return c;};
const run=(c,n,input=idle)=>{for(let i=0;i<n;i++)c.step(FIXED_DT,input);return c.getSnapshot();};
const without=(side)=>f.segmentIds.filter(id=>!id.startsWith(side+'.')||!/(Leg|foot)$/.test(id));
const d=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('COM uses capsule mass, removes missing limb mass, and agrees with support diagnostics',()=>{
 const c=make(),s=run(c,60),parts=s.rigSegments[0],com=rigCenterOfMass(parts),left=rigCenterOfMass(parts,new Set(without('R'))),right=rigCenterOfMass(parts,new Set(without('L')));
 assert.ok(left[0]<com[0]-.015&&right[0]>com[0]+.015);
 assert.ok(d(com,s.supports[0].centerOfMass)<1e-9);
 assert.ok(capsuleMass(.124,.49)>capsuleMass(.083,.32)*2);
});
test('one-leg balance leans upper body toward surviving foot without moving its world anchor, both sides and yaw',()=>{
 for(const yaw of [0,1.1])for(const side of ['L','R']){
  const sign=side==='L'?-1:1,c=make(without(side==='L'?'R':'L'),yaw),first=c.getSnapshot(),s=run(c,120);
  const hip=center(get(s,'pelvis')),chest=center(get(s,'chest')),head=center(get(s,'head')),foot=get(s,side+'.foot').a,com=s.supports[0].centerOfMass;
  const lateral=(a,b)=>sign*((a[0]-b[0])*Math.cos(yaw)+(a[2]-b[2])*Math.sin(yaw));
  assert.ok(lateral(head,hip)>.10&&lateral(chest,hip)>.055,JSON.stringify({side,yaw,hip,chest,head,foot,com}));
  assert.ok(d(foot,get(first,side+'.foot').a)<1e-8);
  assert.ok(Math.abs(lateral(foot,[0,0,0])-.18)<1e-8);
  assert.ok(Math.hypot(com[0]-foot[0],com[2]-foot[2])<.05,JSON.stringify({side,yaw,com,foot}));
  assert.ok(s.supports[0].margin>=-.01);
  for(const p of s.rigSegments[0])assert.ok(Math.abs(d(p.a,p.b)-LAB_SEGMENTS.find(v=>v.id===p.id).nominalLength)<1e-8,p.id);
  assert.ok(d(get(s,side+'.upperLeg').a,get(s,'pelvis')[side==='L'?'a':'b'])<1e-9);
 }
});
test('actual leg loss changes upper-body balance; supporting foot remains fixed on idle ground',()=>{
 const c=make(),a=run(c,60),foot=get(a,'L.foot').a;
 assert.ok(c.applyDamage({fighterId:0,segmentId:'R.upperLeg',amount:3}));
 const s=run(c,120),hip=center(get(s,'pelvis')),head=center(get(s,'head'));
 assert.equal(s.mobilityModes[0],'single-support');assert.ok(head[0]<hip[0]-.10);
 assert.ok(d(get(s,'L.foot').a,foot)<.025);
 assert.ok(s.supports[0].margin>=-.015);
});
test('removing a heavy arm on the opposite side changes the required lean',()=>{
 const ids=without('R'),a=run(make(ids),120),b=run(make(ids.filter(id=>!/^R\.(upperArm|lowerArm|hand)$/.test(id))),120);
 const lean=s=>center(get(s,'pelvis'))[0]-center(get(s,'head'))[0];
 assert.ok(lean(a)>lean(b)+.02,JSON.stringify({full:lean(a),missingArm:lean(b)}));
});
