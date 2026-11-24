import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainHeight,moundDimensions,capsuleVerticalHalfExtent} from '../dist/collision/terrain.js';
const upright={x:0,y:0,z:0,w:1},flat={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};
const tilted={x:0,y:0,z:Math.sin(Math.PI/6),w:Math.cos(Math.PI/6)};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('conical terrain height is continuous and overlaps use maximum not sum',()=>{
 const m={x:0,z:0,radius:.6,height:.3};
 assert.equal(terrainHeight(0,0,[m]),.3);assert.equal(terrainHeight(.3,0,[m]),.15);
 assert.equal(terrainHeight(.6,0,[m]),0);assert.equal(terrainHeight(0,0,[m,m]),.3);
 assert.equal(terrainHeight(0,0,[]),0);
});
test('mound height measures settled capsule top and caps at 30 cm',()=>{
 assert.deepEqual(moundDimensions(100,-100,10,10,15,upright),{x:6.25,z:-6.25,radius:.77,height:.30});
 const horizontal=moundDimensions(0,0,.49,.083,.083,flat);
 near(horizontal.height,.166);near(horizontal.radius,.5011);
 near(moundDimensions(0,0,.36,.10,.10,flat).height,.20);
 near(moundDimensions(0,0,.50,.10,.10,flat).height,.20);
 near(moundDimensions(0,0,.36,.10,.19,tilted).height,.30);
 near(moundDimensions(0,0,.10,.05,.08,tilted).height,.155);
 near(moundDimensions(0,0,0,.05,.05,upright).height,.10);
 near(moundDimensions(0,0,0,.05,.05,flat).height,.10);
 near(moundDimensions(0,0,0,.19,.19,upright).height,.30);
 near(moundDimensions(0,0,0,.05,.14,upright).height,.19);
 near(moundDimensions(0,0,0,.01,.01,upright).height,.02);
});
test('vertical capsule extent handles actual orientation',()=>{
 near(capsuleVerticalHalfExtent(.4,.1,flat),.1);
 near(capsuleVerticalHalfExtent(.4,.1,upright),.3);
 near(capsuleVerticalHalfExtent(.4,.1,tilted),.2);
});
