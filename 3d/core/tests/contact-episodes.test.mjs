import test from 'node:test';
import assert from 'node:assert/strict';
import {ContactEpisodes} from '../dist/collision/contact-episodes.js';
const contact={fighterId:0,segmentId:'R.upperArm',otherId:1};
test('continuous and duplicate contacts count only once',()=>{
 const e=new ContactEpisodes(),hits=[];
 for(let t=1;t<200;t++)e.advance(t,[contact,contact],()=>true,h=>hits.push(h));
 assert.equal(hits.length,1);
});
test('release and cooldown gate three episodes and cascade',()=>{
 const e=new ContactEpisodes(),hits=[],chains=[];
 for(const t of [1,9,27,53,79])e.advance(t,[contact],()=>true,(h,c)=>{hits.push(h.count);chains.push(c);});
 assert.deepEqual(hits,[1,2,3,4]);assert.deepEqual(chains[2],['R.upperArm','R.lowerArm','R.hand']);
});
test('torso, inactive parts and reset',()=>{
 const e=new ContactEpisodes(),hits=[];
 e.advance(1,[{...contact,segmentId:'torso'},contact],()=>false,h=>hits.push(h));
 assert.equal(hits.length,0);
 e.advance(2,[contact],()=>true,h=>hits.push(h.count));e.reset();
 e.advance(3,[contact],()=>true,h=>hits.push(h.count));assert.deepEqual(hits,[1,1]);
});
