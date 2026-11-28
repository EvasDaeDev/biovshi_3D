import test from 'node:test';
import assert from 'node:assert/strict';
import {combatSoundCues,combatSoundLoops} from '../../lab-next/combat-sound-cues.js';

const pose=[
 {id:'chest',a:[0,1,1],b:[1,1,1]},
 {id:'head',a:[.5,1.6,1],b:[.5,1.6,1]},
];
const state={fighterIds:[0,2],rigSegments:[pose,pose],roots:[0,0,0,0,1,0,0,0],
 fight:{ended:false,winnerId:null},strikes:[{phase:'thrust',resolved:false},{phase:'windup',pounce:true}],
 hopPhases:['idle','prepare'],postures:['prone','upright'],oil:[{failureTick:100},{failureTick:null}],lifeStates:['active','active']};

test('combat sounds use impact positions, delayed injured voices and transition cues',()=>{
 const point=[.3,1.2,.9];
 const after={...state,strikes:[{phase:'recover',resolved:false,source:'chest'},{phase:'windup',pounce:true}],hopPhases:['idle','flight']};
 const cues=combatSoundCues(state,after,[
  {type:'fighter-damaged',fighterId:2,attackerId:0,segmentId:'chest',critical:true},
  {type:'strike-contact',fighterId:2,segmentId:'chest',point},
  {type:'segment-detached',fighterId:2,segmentId:'chest',detachedParts:[pose[0]]},
 ],()=>0);
 assert.deepEqual(cues.map(e=>e.key),['crit','womanPain1','detach1','miss1','pounce']);
 assert.deepEqual(cues[0].point,point);
 assert.equal(cues[1].delay,.1);
 assert.deepEqual(cues[1].point,pose[1].a);
 const ended={...state,fight:{ended:true,winnerId:0}};
 assert.deepEqual(combatSoundCues(state,ended,[{type:'fighter-incapacitated',fighterId:2}]).map(e=>e.key),['death','victory']);
 assert.deepEqual(combatSoundCues(ended,ended,[]),[]);
});

test('ground movement and countdown loops stop at fight end',()=>{
 const moving={...state,roots:[.1,0,0,0,1,0,0,0]};
 assert.deepEqual(combatSoundLoops(state,moving).map(loop=>loop.key),['crawl','drag']);
 assert.deepEqual(combatSoundLoops(state,state).map(loop=>loop.key),['crawl']);
 assert.deepEqual(combatSoundLoops(state,{...moving,fight:{ended:true}}),[]);
});
