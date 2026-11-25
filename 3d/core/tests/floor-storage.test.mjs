import test from 'node:test';
import assert from 'node:assert/strict';
import {floorScopeKey,loadFloorHistory,saveFloorHistory,clearFloorHistory} from '../../lab-next/floor-storage.js';
import {createFloorHistory} from '../dist/arena/floor-history.js';

test('P4 IDB floor scope isolates the session and arena, not just the scenario name',()=>{
 assert.equal(floorScopeKey('lab-preview','ward'),JSON.stringify(['lab-preview','ward']));
 assert.notEqual(floorScopeKey('foo:bar','baz'),floorScopeKey('foo','bar:baz'));
 assert.notEqual(floorScopeKey('lab-preview','ward'),floorScopeKey('lab-preview','ring'));
 assert.notEqual(floorScopeKey('lab-preview','ward'),floorScopeKey('other-session','ward'));
 for(const bad of ['', ' ', 'x'.repeat(129), null]){
  assert.throws(()=>floorScopeKey(bad,'ward'),/Invalid 3D floor/);
  assert.throws(()=>floorScopeKey('lab-preview',bad),/Invalid 3D floor/);
 }
});

test('P4 storage refuses wrong-arenas and corrupt snapshots before opening IndexedDB',async()=>{
 const snapshot=createFloorHistory('ward',[],[],[]);
 assert.throws(()=>saveFloorHistory('session','ring',snapshot,{indexedDB:null}),/Invalid floor/);
 assert.throws(()=>saveFloorHistory('session','ward',{...snapshot,schemaVersion:2},{indexedDB:null}),/Invalid floor/);
 await assert.rejects(loadFloorHistory('session','ward',{indexedDB:null}),/IndexedDB unavailable/);
 await assert.rejects(saveFloorHistory('session','ward',snapshot,{indexedDB:null}),/IndexedDB unavailable/);
 await assert.rejects(clearFloorHistory('session','ward',{indexedDB:null}),/IndexedDB unavailable/);
 // A failed transaction must leave the per-key queue usable.
 await assert.rejects(loadFloorHistory('session','ward',{indexedDB:null}),/IndexedDB unavailable/);
});
