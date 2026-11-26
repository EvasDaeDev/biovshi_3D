import test from 'node:test';
import assert from 'node:assert/strict';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
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
