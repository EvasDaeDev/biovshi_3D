import test from 'node:test';
import assert from 'node:assert/strict';
import {LabSimulationCore,createAuthoredCombatConfig,FIXED_DT} from '../dist/index.js';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';

const stationary=id=>({fighterId:id,forward:0,turn:0,sprint:false});
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const xz=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const setup=async(positions,yaw=0)=>{
  const {ring}=await buildLocationCatalog();
  const config=createAuthoredCombatConfig(7,ring,positions.length);
  const core=new LabSimulationCore();
  core.initialize({...config,perceptionCombat:false,fighters:config.fighters.map((f,i)=>({...f,origin:positions[i],yawRad:i===0?yaw:0}))});
  return core;
};
const step=(core,commands=[])=>{
  core.step(FIXED_DT,{commands});
  return core.getSnapshot();
};

test('a running patient plants its root and takes the short turn when its target changes',async()=>{
  const core=await setup([[0,0,0],[.53,0,2.15],[-2.35,0,1.1]],2.9);
  try{
    assert.equal(step(core,[stationary(1),stationary(2)]).tactics[0].targetId,1);
    let s;
    for(let i=0;i<18;i++){
      s=step(core,[{...stationary(0),forward:1,sprint:true},stationary(1),stationary(2)]);
    }
    const before=Array.from(s.roots.slice(0,4));
    assert.ok(xz(before,[0,0,0])>.10);
    assert.ok(core.incapacitate(1));

    let current=before,aligned=false;
    for(let i=0;i<53;i++){
      s=step(core,[stationary(2)]);
      const next=Array.from(s.roots.slice(0,4));
      const desired=Math.atan2(s.roots[8]-current[0],-(s.roots[10]-current[2]));
      const bearing=wrap(desired-current[3]);
      if(Math.abs(bearing)<=.30){aligned=true;break;}
      assert.equal(s.tactics[0].targetId,2);
      assert.ok(xz(before,next)<1e-4,'root drifted during retarget');
      const turn=wrap(next[3]-current[3]);
      assert.ok(turn>0&&turn<.15,'turn must cross the yaw seam by the short direction');
      current=next;
    }
    assert.ok(aligned,'must face the new target promptly');
    assert.ok(current[3]>Math.PI);
    for(let i=0;i<12;i++)s=step(core,[{...stationary(0),forward:1},stationary(2)]);
    assert.ok(xz(current,s.roots)>.035,'manual drive can immediately resume');
  }finally{core.dispose();}
});

test('only the winner raises both arms and jumps in place exactly three times',async()=>{
  const core=await setup([[-2,0,0],[2,0,0]]);
  try{
    assert.ok(core.incapacitate(1));
    const start=step(core),eventCount=core.drainEvents().filter(e=>e.type==='fight-ended').length;
    assert.deepEqual(start.fight,{ended:true,winnerId:0});
    assert.equal(eventCount,1);
    let jumps=0,airborne=false,peaks=0,squat=false;
    const part=(s,id)=>s.rigSegments[0].find(p=>p.id===id);
    const baseFoot=part(start,'L.foot').a[1],basePelvis=part(start,'pelvis').a[1];
    for(let i=0;i<260;i++){
      const s=step(core,[{...stationary(0),forward:1,jump:true}]);
      assert.deepEqual(s.fight,start.fight);
      assert.ok(xz(start.roots,s.roots)<1e-4,'celebration must not move along the ring floor');
      const height=part(s,'L.foot').a[1]-baseFoot,above=height>.08;
      if(!airborne&&above)jumps++;
      airborne=above;
      if(i<12&&part(s,'pelvis').a[1]<basePelvis-.025)squat=true;
      if(height>.19){
        for(const side of ['L','R'])assert.ok(part(s,side+'.hand').a[1]>part(s,'head').a[1],side+' hand must rise above the head at the apex');
        peaks|=1<<(jumps-1);
      }
      if(i>170)assert.ok(!above,'victory animation must not loop');
      assert.equal(core.drainEvents().some(e=>e.type==='fight-ended'),false);
    }
    assert.ok(squat,'winner needs a takeoff anticipation');
    assert.equal(jumps,3);
    assert.equal(peaks,0b111);
  }finally{core.dispose();}
});
