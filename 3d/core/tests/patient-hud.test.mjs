import test from 'node:test';
import assert from 'node:assert/strict';
import {BODY_MAP,segmentPresentation,patientPresentation} from '../../lab-next/patient-hud.js';
import {LAB_SEGMENTS} from '../dist/rig/anatomy.js';
test('HUD covers exactly the native anatomy and uses green-yellow-red-grey health',()=>{
 assert.deepEqual(BODY_MAP.map(v=>v[0]).sort(),LAB_SEGMENTS.map(v=>v.id).sort());
 const part=(hp,attached=true)=>({hp,maxHp:4,attached});
 assert.equal(segmentPresentation(part(4)).fill,'hsl(120 76% 49%)');
 assert.equal(segmentPresentation(part(2)).fill,'hsl(60 76% 49%)');
 assert.equal(segmentPresentation(part(1)).fill,'hsl(30 76% 49%)');
 for(const p of [part(0),part(4,false),undefined])assert.equal(segmentPresentation(p).fill,'#69736f');
 assert.equal(segmentPresentation(part(0)).detail,'разрушен (на месте)');
});
test('HUD uses actual endurance capacity and fixed-clock bleed timer, never post-round countdown',()=>{
 const health={endurance:8,maxEndurance:18,baseEndurance:24,lostSegments:8};
 const p=patientPresentation(health,{wounds:['L.hand'],remainingTicks:601},'active',{ended:false},0);
 assert.equal(p.capacity,.75);assert.equal(p.remaining,1/3);assert.equal(p.critical,true);assert.equal(p.bleeding,'Отказ через 11 с');
 const end=patientPresentation(health,{wounds:['L.hand'],remainingTicks:1},'active',{ended:true,winnerId:0},0);
 assert.equal(end.state,'Победитель');assert.equal(end.critical,false);assert.equal(end.bleeding,'Остановлено');
});
