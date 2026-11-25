import test from 'node:test';
import assert from 'node:assert/strict';
import {ArenaNavigation,rectHit,sightClear,RouteState,LabSimulationCore,createLabConfig,createNavigationCombatConfig,FIXED_DT} from '../dist/index.js';
const w={minX:-.25,maxX:.25,minZ:-.9,maxZ:.9,height:2.8};
const a={x:-2,z:0},b={x:2,z:0};
test('v1 visibility graph routes around inflated corners, chooses direct open path and exits padding',()=>{
 const n=new ArenaNavigation([w]),route=n.plan(a,b);
 assert.ok(route.length>=3,JSON.stringify(route));
 let previous=a;for(const p of route){assert.equal(rectHit(previous,p,w,.65),null);previous=p;}
 assert.deepEqual(route.at(-1),b);
 assert.deepEqual(n.plan({x:-2,z:3},{x:2,z:3}),[{x:2,z:3}]);
 const escaped=n.plan({x:-.70,z:0},b);assert.ok(escaped.length>=2);
 assert.ok(escaped[0].x<=-.70);
 const blocked=new ArenaNavigation([{...w,minZ:-6,maxZ:6}]);assert.deepEqual(blocked.plan(a,b),[a]);
});
test('opaque wall blocks horizontal eye rays, allows rays above its height; root sweep cannot tunnel',()=>{
 assert.equal(sightClear([-2,1.8,0],[2,1.8,0],[w]),false);
 assert.equal(sightClear([-2,3,0],[2,3,0],[w]),true);
 assert.equal(sightClear([-2,1.8,2],[2,1.8,2],[w]),true);
 const n=new ArenaNavigation([w]),p=n.move(a,b);assert.ok(p.x<=-.75&&p.x>-.76);
 assert.deepEqual(n.move({x:-.60,z:0},{x:-1,z:0}),{x:-1,z:0});
 const state=new RouteState();const goal=state.waypoint(n,a,b,0);assert.notDeepEqual(goal,b);assert.ok(state.snapshot().length>=3);
 assert.deepEqual(state.waypoint(n,{x:-2,z:3},{x:2,z:3},1),{x:2,z:3});assert.deepEqual(state.snapshot(),[]);
});
test('manual locomotion cannot cross wall; AI routes around it rather than striking through it',()=>{
 const base=createLabConfig(7),f={...base.fighters[0],origin:[-2,0,0],yawRad:Math.PI/2};
 const c=new LabSimulationCore();c.initialize({seed:7,walls:[w],fighters:[f]});
 for(let i=0;i<300;i++)c.step(FIXED_DT,{commands:[{fighterId:0,forward:1,turn:0,sprint:false}]});
 assert.ok(c.getSnapshot().roots[0]<-.74);
 const other={...base.fighters[1],origin:[2,0,0],yawRad:-Math.PI/2};
 c.initialize({seed:7,walls:[w],fighters:[f,other],combatEnabled:true,expandedStrikes:true});
 let routed=false,around=false;
 for(let i=0;i<900;i++){c.step(FIXED_DT,{commands:[]});const s=c.getSnapshot();routed||=s.routes.some(r=>r.length>1);around||=Math.abs(s.roots[2])>1.4||Math.abs(s.roots[6])>1.4;
 for(const e of c.drainEvents())if(e.type==='fighter-damaged'){const p={x:s.roots[0],z:s.roots[2]},q={x:s.roots[4],z:s.roots[6]};assert.equal(rectHit(p,q,w),null);}
 }
 assert.ok(routed&&around,JSON.stringify({routed,around,roots:Array.from(c.getSnapshot().roots),routes:c.getSnapshot().routes}));
});
test('eight patients with wall geometry, sight and routing remain finite and do not occupy wall footprint',()=>{
 const config=createNavigationCombatConfig(7),c=new LabSimulationCore();c.initialize(config);
 let hits=0;for(let i=0;i<1800;i++){c.step(FIXED_DT,{commands:[]});for(const e of c.drainEvents())if(e.type==='fighter-damaged')hits++;}
 const s=c.getSnapshot();assert.ok(Array.from(s.roots).every(Number.isFinite));assert.ok(hits>=2,JSON.stringify({hits,roots:Array.from(s.roots),routes:s.routes}));
 for(let i=0;i<s.fighterIds.length;i++)if(s.lifeStates[i]==='active')assert.ok(config.walls.every(w=>s.roots[i*4]<=w.minX||s.roots[i*4]>=w.maxX||s.roots[i*4+2]<=w.minZ||s.roots[i*4+2]>=w.maxZ));
});

test('free endpoint behind a separating wall has no viable static route',()=>{
 const partition=new ArenaNavigation([{minX:-.25,maxX:.25,minZ:-6,maxZ:6,height:2.8}]);
 const start={x:-1,z:0},across={x:1,z:0};
 assert.equal(partition.clear(across,across,.65),true,'destination itself is free');
 assert.deepEqual(partition.plan(start,across),[start],'visibility graph correctly has no path');
 assert.equal(partition.reachable(start,across),false,'escape must reject unreachable destination');
 assert.equal(partition.reachable(start,{x:-1,z:2}),true);
 assert.equal(partition.reachable(start,{x:-.7,z:0}),false,'destination in root clearance is invalid');
 assert.equal(new ArenaNavigation([w]).reachable(a,b),true,'ordinary wall can be routed around');
 assert.equal(new ArenaNavigation().reachable(a,b),true,'open arena remains direct');
});
