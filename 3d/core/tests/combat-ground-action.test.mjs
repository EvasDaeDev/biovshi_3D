import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT,DAMAGE} from '../dist/index.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';

const {ring}=await buildLocationCatalog();
const base=createAuthoredCombatConfig(7,ring,2);
const commands=(overrides={})=>({commands:[
 {fighterId:0,forward:0,turn:0,sprint:false,...overrides},
 {fighterId:1,forward:0,turn:0,sprint:false}
]});
function setupFall(opponentOrigin,missing=[]){
 const core=new LabSimulationCore();
 core.initialize({...base,fighters:[
  {...base.fighters[0],origin:[0,0,0],yawRad:0,segmentIds:base.fighters[0].segmentIds.filter(id=>!missing.includes(id))},
  {...base.fighters[1],origin:opponentOrigin,yawRad:0}
 ]});
 assert.ok(core.applyDamage({fighterId:0,attackerId:1,segmentId:'chest',amount:DAMAGE.criticalDamage}));
 core.step(FIXED_DT,commands());
 assert.ok(core.applyDamage({fighterId:0,attackerId:1,segmentId:'abdomen',amount:DAMAGE.criticalDamage}));
 assert.equal(core.getSnapshot().balanceStates[0],'falling');
 return core;
}

for(const phase of ['falling','down'])test(`a patient can land one counter while ${phase} and recover`,()=>{
 const core=setupFall(phase==='falling'?[-.9/Math.SQRT2,0,-.9/Math.SQRT2]:[.9,0,0]);
 try{
  const observed=[];
  for(let i=0;i<130;i++){
   const balance=core.getSnapshot().balanceStates[0];
   core.step(FIXED_DT,commands({attack:balance===phase}));
   for(const event of core.drainEvents())observed.push({balance,event});
  }
  const attempts=observed.filter(({event})=>event.type==='combat-windup'&&event.fighterId===0);
  assert.equal(attempts.length,1);
  assert.equal(attempts[0].event.proneStrike,true);
  assert.equal(attempts[0].balance,phase);
  const hits=observed.filter(({event})=>event.type==='strike-contact'&&event.attackerId===0);
  assert.equal(hits.length,1);
  assert.equal(hits[0].balance,phase);
  assert.ok(observed.some(({event})=>event.type==='fighter-damaged'&&event.fighterId===1&&event.tick===hits[0].event.tick));
  assert.ok(observed.some(({event})=>event.type==='fighter-braced'&&event.fighterId===0));
  assert.ok(observed.some(({event})=>event.type==='fighter-recovered'&&event.fighterId===0));
 }finally{core.dispose();}
});

test('a downed patient can crawl sideways before getting up',()=>{
 const still=setupFall([1.5,0,0]),moving=setupFall([1.5,0,0]);
 try{
  let downTicks=0,plantedSteps=0;
  for(let i=0;i<130;i++){
   const before=moving.getSnapshot(),down=before.balanceStates[0]==='down';
   still.step(FIXED_DT,commands());
   moving.step(FIXED_DT,commands(down?{turn:-1}:{}));
   if(!down)continue;
   downTicks++;
   const after=moving.getSnapshot();
   if(Math.abs(after.roots[0]-before.roots[0])<.001)continue;
   const anchors=after.crawlAnchors[0].filter(a=>a.valid);
   assert.ok(anchors.length,'commanded travel requires a reachable floor anchor');
   for(const anchor of anchors){
    const prior=before.crawlAnchors[0].find(a=>a.segmentId===anchor.segmentId&&a.valid);
    if(prior)assert.deepEqual(anchor.point,prior.point,'planted endpoint stays fixed in world space');
   }
   plantedSteps++;
  }
  assert.ok(downTicks>5&&plantedSteps>5);
  const a=still.getSnapshot(),b=moving.getSnapshot();
  assert.equal(b.balanceStates[0],'standing');
  assert.ok(b.roots[0]<a.roots[0]-.08,'crawling should move the patient away from the opponent');
  assert.ok(Math.abs(b.roots[3]-a.roots[3])<.05,'sideways crawl should preserve heading');
  assert.deepEqual(a.segmentIds[0],b.segmentIds[0]);
 }finally{still.dispose();moving.dispose();}
});

test('the AI backs away from a nearby threat while down',()=>{
 const still=setupFall([0,0,-1.5]),automatic=setupFall([0,0,-1.5]);
 try{
  for(let i=0;i<130;i++){
   const down=automatic.getSnapshot().balanceStates[0]==='down';
   still.step(FIXED_DT,commands());
   automatic.step(FIXED_DT,down?{commands:commands().commands.slice(1)}:commands());
  }
  assert.ok(automatic.getSnapshot().roots[2]>still.getSnapshot().roots[2]+.08);
  assert.equal(automatic.getSnapshot().balanceStates[0],'standing');
 }finally{still.dispose();automatic.dispose();}
});

test('a forearm stump can pull a patient along the floor',()=>{
 const missing=['L.hand','R.upperArm','R.lowerArm','R.hand'];
 const core=setupFall([1.5,0,0],missing);
 try{
  let moved=false;
  for(let i=0;i<130;i++){
   const before=core.getSnapshot(),down=before.balanceStates[0]==='down';
   core.step(FIXED_DT,commands(down?{turn:-1}:{}));
   const after=core.getSnapshot();
   if(down&&after.roots[0]<before.roots[0]-.001){
    assert.deepEqual(after.crawlAnchors[0].filter(a=>a.valid).map(a=>a.segmentId),['L.lowerArm']);
    moved=true;
   }
  }
  assert.ok(moved,'the remaining forearm should support at least one pull');
  assert.equal(core.getSnapshot().balanceStates[0],'standing');
 }finally{core.dispose();}
});

test('ground input cannot slide a body with no forearm support',()=>{
 const missing=['L.lowerArm','L.hand','R.lowerArm','R.hand'];
 const still=setupFall([1.5,0,0],missing),moving=setupFall([1.5,0,0],missing);
 try{
  for(let i=0;i<130;i++){
   const down=moving.getSnapshot().balanceStates[0]==='down';
   still.step(FIXED_DT,commands());
   moving.step(FIXED_DT,commands(down?{turn:-1}:{}));
   assert.deepEqual(moving.getSnapshot().roots,still.getSnapshot().roots);
  }
 }finally{still.dispose();moving.dispose();}
});

for(const missing of [[],['L.hand','R.upperArm','R.lowerArm','R.hand']])test(`backward crawl keeps the elbow path continuous with ${missing.length?'one forearm':'both hands'}`,()=>{
 const core=setupFall([1.5,0,0],missing);
 try{
  let before=core.getSnapshot(),peak=0;
  for(let i=0;i<90;i++){
   const down=before.balanceStates[0]==='down';
   core.step(FIXED_DT,commands(down?{forward:-1}:{}));
   const after=core.getSnapshot();
   if(down&&after.balanceStates[0]==='down')for(const part of before.rigSegments[0].filter(p=>p.id.endsWith('.upperArm'))){
    const end=after.rigSegments[0].find(p=>p.id===part.id).b;
    peak=Math.max(peak,Math.hypot(...end.map((value,axis)=>value-part.b[axis])));
   }
   before=after;
  }
  assert.ok(peak>.01&&peak<.12,`elbow moved ${peak} m in one tick`);
 }finally{core.dispose();}
});
