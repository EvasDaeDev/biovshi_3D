import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocationCatalog} from '../scripts/catalog-locations.mjs';
import {PolygonNavigation} from '../dist/index.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

test('P4 annulus 60-second survivors can pursue around the central obstacle without a fake route dead-end',async()=>{
 const {annulus}=await buildLocationCatalog();
 const nav=new PolygonNavigation(annulus),a={x:1.16927624,z:.93930858},b={x:1.07517731,z:-1.04552078};
 assert.equal(nav.clear(a,b,.65),false);
 assert.equal(nav.clear(b,b,.65),false,'physical .50 m clearance is narrower than routing .65 m');
 assert.equal(nav.clear(a,a,.49),true);
 const path=nav.plan(a,b);
 assert.ok(path.length>1,'a target standing legally near a wall must still have a useful route: '+JSON.stringify(path));
 const last=path.at(-1);
 assert.ok(distance(last,b)>.05&&distance(last,b)<.38,'approach point must stay near the real foe: '+JSON.stringify(path));
 assert.equal(nav.clear(last,last,.65),true,'the route must end at a navigable approach point');
 const first=nav.move(a,path[0],.50);
 assert.ok(distance(first,a)>.025,'the first clearance step must advance the physical root');
 assert.equal(nav.clear(first,first,.49),true,'the first step may not clip the real obstacle');
 for(let i=1;i<path.length;i++)
  assert.equal(nav.clear(path[i-1],path[i],.65),true,'graph link cuts inside the 65cm route clearance');
 // The tactical escape contract is deliberately more restrictive: a
 // non-navigable original target is not reported as fully reachable.
 assert.equal(nav.reachable(a,b),false);
 const backward=nav.plan(b,a);
 assert.ok(backward.length>1,'both survivors need a non-empty route');
 assert.ok(distance(backward.at(-1),a)<.38);
});

test('P4 original boundary also projects combat targets inward without crossing the edge',async()=>{
 const {ring}=await buildLocationCatalog();
 const nav=new PolygonNavigation(ring);
 const start={x:0,z:0},goal={x:1.48,z:0};
 assert.equal(nav.clear(goal,goal,.65),false);
 const path=nav.plan(start,goal);
 assert.ok(path.length>=1);
 assert.ok(distance(path.at(-1),goal)<.40,JSON.stringify(path));
 assert.equal(nav.clear(path.at(-1),path.at(-1),.65),true);
 assert.equal(nav.reachable(start,goal),false);
});

test('P4 route cannot turn a target inside the real obstacle into a valid arrival point',async()=>{
 const {annulus}=await buildLocationCatalog();
 const nav=new PolygonNavigation(annulus),start={x:0,z:2},goal={x:0,z:0};
 assert.deepEqual(nav.plan(start,goal),[start]);
 assert.equal(nav.reachable(start,goal),false);
});
