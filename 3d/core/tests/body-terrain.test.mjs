import test from 'node:test';
import assert from 'node:assert/strict';
import {bodyTerrain} from '../dist/collision/body-terrain.js';
import {terrainHeight} from '../dist/collision/terrain.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
test('body cones follow actual surviving geometry, cap height and use shallow slopes',()=>{
 const p=[{id:'head',a:[1,.19,2],b:[1,.19,2],radius:.19},{id:'L.lowerLeg',a:[1,.1,0],b:[1,.1,.5],radius:.1}];
 const m=bodyTerrain(p);assert.equal(m.length,2);assert.equal(m[0].height,.30);assert.ok(Math.abs(m[1].height-.20)<1e-9);
 assert.ok(m.every(v=>v.radius>=1.8*v.height));assert.equal(terrainHeight(1,2,[...m,...m]),.30);
 assert.equal(bodyTerrain([]).length,0);
});
test('settled body is visible but no longer blocks locomotion through its capsules',()=>{
 const cfg=createLabConfig(7),f={...cfg.fighters[0],origin:[0,0,2],yawRad:0},g={...cfg.fighters[1],origin:[0,0,0],yawRad:0};
 const c=new LabSimulationCore();c.initialize({seed:7,fighters:[f,g],labDynamicBalance:true});
 c.incapacitate(1);
 const pose=c.getSnapshot().rigSegments[1],flat=pose.map(p=>({...p,a:[p.a[0],.20+p.a[2],-p.a[1]+1],b:[p.b[0],.20+p.b[2],-p.b[1]+1]}));
 c.setIncapacitatedPose(1,flat,true);const cones=bodyTerrain(flat);c.setTerrainMounds(cones);
 let lift=0,contacts=0;
 for(let i=0;i<240;i++){c.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:0,sprint:false}]});const s=c.getSnapshot();lift=Math.max(lift,s.roots[1]);contacts+=s.collisionStats.contacts;assert.equal(s.balanceStates[0],'standing');}
 const s=c.getSnapshot();assert.ok(s.roots[2]<-1);assert.ok(lift>.07&&lift<=.300001);assert.equal(contacts,0);assert.equal(s.rigSegments[1].length,17);assert.equal(s.bodyTerrainStates[1],true);
});
