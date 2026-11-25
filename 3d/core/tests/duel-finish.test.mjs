import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../node_modules/@dimforge/rapier3d-compat/rapier.es.js';
import {DebrisWorld} from '../../lab-next/debris.js';
import {LabSimulationCore,createLabConfig,FIXED_DT} from '../dist/index.js';
const base=createLabConfig(7);
const fighters=[{...base.fighters[0],origin:[0,0,1.2],yawRad:0},{...base.fighters[1],origin:[0,0,-1.2],yawRad:Math.PI}];
test('published duel configuration is not terminated by three torso hits each',()=>{
 const c=new LabSimulationCore();c.initialize({seed:7,fighters,combatEnabled:true});
 let hits=0,atSix=null,windups=0,lastHitTick=0;const targets=new Set();
 for(let i=0;i<1800;i++){
  c.step(FIXED_DT,{commands:[]});
  for(const e of c.drainEvents()){if(e.type==='combat-windup')windups++;if(e.type==='fighter-damaged'){hits++;lastHitTick=i;targets.add(e.segmentId);}}
  if(hits>=6&&!atSix)atSix=c.getSnapshot();
 }
 const final=c.getSnapshot();assert.ok(hits>=6,JSON.stringify({hits,windups,lastHitTick,roots:Array.from(final.roots),targets:[...targets],health:final.health,strikes:final.strikes,feet:final.footStates,collision:final.collisionStats}));assert.ok(atSix.lifeStates.includes('active'));assert.ok(targets.size>=2,JSON.stringify([...targets]));
});
test('two nearby simultaneous casualties topple away from one another and become cones',async()=>{
 await RAPIER.init();const w=new DebrisWorld(RAPIER),c=new LabSimulationCore();
 c.initialize({seed:7,fighters:[{...fighters[0],origin:[0,0,.29]},{...fighters[1],origin:[0,0,-.29]}],combatEnabled:true});
 try{
  c.incapacitate(0,'trauma',1);c.incapacitate(1,'trauma',0);
  const events=c.drainEvents();assert.equal(events.length,2);assert.ok(events[0].fallDirection[2]>0&&events[1].fallDirection[2]<0);
  for(const e of events)w.accept(e);
  for(let i=0;i<900;i++){c.setTerrainMounds(w.moundSnapshot());c.step(FIXED_DT,{commands:[]});for(const e of c.drainEvents())w.accept(e);w.step(FIXED_DT);for(const b of w.bodySnapshot())c.setIncapacitatedPose(b.fighterId,b.parts,b.settled);}
  const s=c.getSnapshot();assert.deepEqual(s.fight,{ended:true,winnerId:null});assert.deepEqual(s.bodyTerrainStates,[true,true]);assert.equal(w.bodySnapshot().length,2);
  assert.ok(w.moundSnapshot().length>=2&&w.moundSnapshot().length<=8);
  for(const parts of s.rigSegments){const p=parts.find(p=>p.id==='pelvis'),q=parts.find(p=>p.id==='chest'),v=q.a.map((x,i)=>(x+q.b[i]-p.a[i]-p.b[i])*.5);assert.ok(Math.abs(v[1])<Math.hypot(...v)*.45);}
 }finally{w.dispose();}
});
