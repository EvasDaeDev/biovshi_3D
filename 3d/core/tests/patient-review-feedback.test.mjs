import test from 'node:test';
import assert from 'node:assert/strict';
import {GazePitch,REST_GAZE_PITCH} from '../dist/animation/gaze-pitch.js';
import {headFrame} from '../dist/rig/head-frame.js';
import {attackScore,targetPriority,shouldBackstep} from '../dist/combat/opportunity.js';
import {PatientGait} from '../dist/rig/gait.js';
import {compileAuthoredMotion} from '../dist/rig/authored-motion.js';
import {referencePose} from '../dist/rig/pose-editor.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
const dt=1/60,dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('gaze defaults below horizon, smoothly aims at lower capsule and relaxes',()=>{
 const g=new GazePitch();assert.equal(g.pitch,REST_GAZE_PITCH);
 const eye=[0,1.5,0],target=[0,.5,-1];let prior=g.pitch;
 for(let i=0;i<120;i++){g.advance(dt,eye,target);assert.ok(Math.abs(g.pitch-prior)<=2.8*dt+1e-9);prior=g.pitch;}
 assert.ok(Math.abs(g.pitch+Math.PI/4)<1e-6);
 const h=headFrame([{id:'head',a:eye,b:eye,radius:.15}],0,g.pitch);
 assert.ok(h.forward[1]<-.7);assert.ok(Math.abs(h.forward.reduce((n,v,i)=>n+v*h.up[i],0))<1e-8);
 for(let i=0;i<120;i++)g.advance(dt,eye,null);
 assert.ok(Math.abs(g.pitch-REST_GAZE_PITCH)<1e-6);
});
test('tactical decisions depend on visible opening, threat and reachable source, not attempt index',()=>{
 const idle={phase:'idle',source:null,targetId:null,resolved:false};
 const c={distance:.85,facing:0,grounded:false,opponent:idle,temperament:'balanced'};
 const arm={side:'L',id:'chest',contactId:'chest',aim:[0,1,0],distance:.45};
 const leg={...arm,contactId:'L.lowerLeg',distance:.7};
 assert.ok(attackScore('arm',arm,c)>attackScore('leg',leg,c));
 assert.ok(attackScore('leg',leg,{...c,grounded:true})>attackScore('arm',arm,{...c,grounded:true}));
 assert.ok(attackScore('arm',arm,{...c,lastKind:'arm',lastContact:'chest'})<attackScore('arm',arm,c));
 const threat={...c,opponent:{...idle,phase:'windup',source:'R.lowerArm'}};
 assert.equal(shouldBackstep(threat,false,false),true);assert.equal(shouldBackstep(threat,true,false),false);
 assert.equal(shouldBackstep(threat,false,true),false);
 const parts=LAB_SEGMENTS.map(p=>({id:p.id}));
 assert.ok(targetPriority(1,Math.PI,parts.filter(p=>!p.id.startsWith('R.')))<targetPriority(1,0,parts));
});
test('authored gait keeps alternating anchors and connected lengths through deceleration',()=>{
 const motion=compileAuthoredMotion({schemaVersion:1,stature:1.65,slots:{stance:referencePose('stance'),stalk:referencePose('stalk')}});
 const g=new PatientGait([0,0,0],0,true,motion);let z=0,old=g.footStates;
 for(let tick=0;tick<300;tick++){
  const speed=tick<180?.6:0;z-=speed*dt;g.advance([0,0,z],0,speed,dt);
  const feet=g.footStates,p=g.pose(0,[0,0,z],0,tick*dt);
  assert.ok(feet.filter(f=>f.moving).length<=1);
  for(let i=0;i<2;i++)if(!feet[i].moving&&!old[i].moving)assert.ok(dist(feet[i].point,old[i].point)<1e-9);
  for(const s of p)assert.ok(Math.abs(dist(s.a,s.b)-LAB_SEGMENTS.find(v=>v.id===s.id).nominalLength)<1e-7,s.id);
  old=feet;
 }
 assert.ok(g.stepCount>=3);assert.ok(old.every(f=>!f.moving));
});
