import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {gradeHeight,validateGradeSurface,lowHill,LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
import {DebrisWorld} from '../../lab-next/debris.js';
const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const segmentFoot=segments=>segments.find(p=>p.id==='L.foot');
test('P4 low hill is continuous and uses the same nonflat barycentric heights for all callers',()=>{
 const triangles=lowHill();
 assert.equal(triangles.length,4);
 near(gradeHeight(0,0,triangles),.22);
 near(gradeHeight(0,.4,triangles),.11);
 near(gradeHeight(.4,0,triangles),.11);
 near(gradeHeight(.8,0,triangles),0);
 near(gradeHeight(2,0,triangles),0);
 near(gradeHeight(0,0,[]),0);
 assert.deepEqual(validateGradeSurface(triangles),triangles);
 const copy=validateGradeSurface(triangles);
 copy[0][0][0]=99;
 assert.equal(triangles[0][0][0],-.8,'terrain ownership is copied');
});
test('P4 never accepts discontinuous high walls, cliffs or bad coordinates as walkable grades',()=>{
 const good=lowHill();
 for(const invalid of [
  [[[0,0,0],[0,0,0],[0,.2,1]]],
  [[[0,0,0],[.02,.6,0],[0,0,.02]]],
  [[[0,0,0],[.5,.7,0],[0,0,.5]]],
  [[[0,0,0],[.5,0,0],[0,0,Infinity]]],
  [[[0,0,0],[8,0,0],[0,.1,1]]],
  new Array(129).fill(good[0]),
 ]){
  assert.throws(()=>validateGradeSurface(invalid),/Invalid/);
 }
});
test('P4 graded root and physical support feet rise smoothly over the shallow hill',()=>{
 const cfg=createLabConfig(7),fighter={...cfg.fighters[0],origin:[0,0,1.5],yawRad:0};
 const core=new LabSimulationCore();
 core.initialize({...cfg,fighters:[fighter],gradedSurface:lowHill(),labDynamicBalance:false});
 try{
  let maximum=0;
  for(let i=0;i<210;i++){
   core.step(FIXED_DT,{commands:[{fighterId:fighter.id,forward:1,turn:0,sprint:false}]});
   const snapshot=core.getSnapshot();
   const rootHeight=snapshot.roots[1];
   maximum=Math.max(maximum,rootHeight);
   const foot=segmentFoot(snapshot.rigSegments[0]);
   assert.ok(foot&&foot.a.every(Number.isFinite));
   const support=snapshot.footStates[0][0].point;
   const ground=gradeHeight(support[0],support[2],lowHill());
   assert.ok(support[1]>=ground-.06,JSON.stringify({support,ground}));
  }
  assert.ok(maximum>.11&&maximum<.34,'root must follow real graded ground without teleporting');
 }finally{core.dispose();}
});
test('P4 one-leg and crawling anatomy still use the graded floor height',()=>{
 const cfg=createLabConfig(7),grades=lowHill();
 const keepOne=cfg.fighters[0].segmentIds.filter(id=>!id.startsWith('R.upperLeg')&&!id.startsWith('R.lowerLeg')&&!id.startsWith('R.foot'));
 const onlyArms=cfg.fighters[1].segmentIds.filter(id=>!id.endsWith('.upperLeg')&&!id.endsWith('.lowerLeg')&&!id.endsWith('.foot'));
 const fighters=[{...cfg.fighters[0],origin:[-.17,0,0],segmentIds:keepOne},
  {...cfg.fighters[1],origin:[.17,0,0],segmentIds:onlyArms}];
 const c=new LabSimulationCore();
 c.initialize({...cfg,fighters,gradedSurface:grades,labDynamicBalance:false});
 try{
  for(let i=0;i<160;i++)c.step(FIXED_DT,{commands:[{fighterId:fighters[0].id,forward:0,turn:0,sprint:false},{fighterId:fighters[1].id,forward:0,turn:0,sprint:false}]});
  const s=c.getSnapshot();
  assert.deepEqual(s.mobilityModes,['single-support','arm-crawl']);
  assert.ok(s.rigSegments.flat().every(p=>p.a.every(Number.isFinite)&&p.b.every(Number.isFinite)));
  assert.ok(s.roots[1]>.10&&s.roots[5]>.10,'both supported and prone patients sit above the real hill');
  assert.ok(s.supports.every(Boolean));
 }finally{c.dispose();}
});
test('P4 Rapier hill geometry is backed by four real fixed hulls and resets cleanly',async()=>{
 await RAPIER.init();
 const debris=new DebrisWorld(RAPIER),grades=lowHill();
 try{
  debris.reset([],null,'lab',null,grades);
  assert.equal(debris.world.colliders.len(),9,'five old floor/walls plus four graded hulls');
  // A free ball falling on the hill must hit physics, not pass through a mesh.
  const R=RAPIER;
  const rb=debris.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(.10,1.05,.10).setLinearDamping(1.4));
  debris.world.createCollider(R.ColliderDesc.ball(.10).setFriction(1),rb);
  let sawHill=false;
  for(let i=0;i<240;i++){
   debris.step(FIXED_DT);
   const t=rb.translation();
   if(t.y>.12&&t.y<.65&&Math.hypot(t.x,t.z)<.6)sawHill=true;
   assert.ok(Number.isFinite(t.y));
  }
  assert.ok(sawHill,'dynamic body must encounter the inclined collider');
  debris.reset();
  assert.equal(debris.world.colliders.len(),5);
  assert.equal(debris.grades.length,0);
 }finally{debris.dispose();}
});
