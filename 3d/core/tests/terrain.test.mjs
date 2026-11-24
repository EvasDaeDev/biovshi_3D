import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainHeight,moundDimensions} from '../dist/collision/terrain.js';
test('conical terrain height is continuous and overlaps use maximum not sum',()=>{
 const m={x:0,z:0,radius:.6,height:.3};
 assert.equal(terrainHeight(0,0,[m]),.3);assert.equal(terrainHeight(.3,0,[m]),.15);
 assert.equal(terrainHeight(.6,0,[m]),0);assert.equal(terrainHeight(0,0,[m,m]),.3);
 assert.equal(terrainHeight(0,0,[]),0);
});
test('mounds match lab dimension limits',()=>{
 assert.deepEqual(moundDimensions(100,-100,10,10),{x:6.25,z:-6.25,radius:.77,height:.30});
 assert.deepEqual(moundDimensions(0,0,0,.01),{x:0,z:0,radius:.30,height:.08});
});
