import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
import {PolygonNavigation,ArenaNavigation,RouteState,PatientPerception,FIXED_DT} from '../dist/index.js';

const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
test('P4 original maze 1.3 m corridor remains passable for a 0.5 m root',async()=>{
 const {maze}=await buildLocationCatalog();
 const nav=new PolygonNavigation(maze);
 assert.equal(nav.routePad,.55);
 assert.equal(new ArenaNavigation().routePad,.65,'P3 legacy route clearance must not change');
 const left={x:-2.5,z:.15},right={x:-.5,z:.15};
 assert.equal(nav.clear(left,right,.65),false,'old 65cm route blocks the gate');
 assert.equal(nav.clear(left,right,nav.routePad),true,'55cm route permits the real 1.3m gate');
 const route=new RouteState();
 assert.deepEqual(route.waypoint(nav,left,right,1),right);
 const moved=nav.move(left,{x:left.x+.5,z:left.z},.5);
 assert.ok(gap(moved,left)>.35,'root must be able to advance into the real gate');
 assert.equal(nav.clear(moved,moved,.49),true);
});
test('P4 reuses only reachable original authored patrol points and renews goals',()=>{
 const p=new PatientPerception(19,1),here={x:-3,z:0};
 const legacy=[{x:1,z:-1},{x:-2,z:.4},{x:2,z:1}];
 const allowed=pt=>pt.x<0;
 assert.deepEqual(p.patrol(1,here,legacy,allowed),legacy[1]);
 assert.deepEqual(p.patrol(2,here,legacy,allowed),legacy[1]);
 // A newly blocked goal must be invalidated immediately, not walked into.
 assert.deepEqual(p.patrol(3,here,legacy,pt=>pt.x>0),legacy.find(pt=>pt.x>0)||here);
});
test('P4 authored patrol chooses genuine reachable points in the 2D maze',async()=>{
 const {maze}=await buildLocationCatalog(),nav=new PolygonNavigation(maze),p=new PatientPerception(19,1);
 const start={x:-3.93,z:-.63249},valid=point=>nav.reachable(start,point,nav.routePad);
 const chosen=p.patrol(3600,start,maze.patrol,valid);
 assert.ok(maze.patrol.some(pt=>gap(pt,chosen)<1e-9),'search must reuse an original patrol point');
 assert.ok(valid(chosen),'search target must be physically reachable');
 assert.equal(nav.routePad,.55);
});
