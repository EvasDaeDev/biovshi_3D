import {createCompound,compoundPose,capsuleOrientation} from './compound.js';
import {bodyTerrain} from '../core/dist/collision/body-terrain.js';
import {IncapacitatedBodies} from './incapacitated.js';
import {moundDimensions,terrainHeight,capsuleVerticalHalfExtent} from '../core/dist/collision/terrain.js';
import {boneFrame} from '../core/dist/rig/bone-frame.js';
import {createFloorHistory,readFloorHistory} from '../core/dist/arena/floor-history.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Physics adapter owns Rapier bodies; renderer consumes plain snapshots. */
export class DebrisWorld {
 constructor(RAPIER){this.R=RAPIER;this.reset();}
 reset(walls=[],previousFloor=null,arenaId='lab'){
  // Validate BEFORE freeing an active physics world: a corrupt/mismatched
  // saved arena must never wipe the current round.
  const archive=previousFloor===null?null:readFloorHistory(previousFloor,arenaId);
  this.world?.free();
  const R=this.R;
  this.world=new R.World({x:0,y:-9.81,z:0});this.world.timestep=1/60;
  this.items=[];this.settledSingles=[];this.branches=[];this.mounds=[];this.nextId=0;this.incapacitated=new IncapacitatedBodies(R,this.world);
  this.archiveFloor=archive;
  const floor=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0,-.19,0));
  this.world.createCollider(R.ColliderDesc.cuboid(7,.19,7).setFriction(.95),floor);
  for(const [x,z,w,d] of [[7,0,.15,7],[-7,0,.15,7],[0,7,7,.15],[0,-7,7,.15]]){
   const wall=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x,2.1,z));
   this.world.createCollider(R.ColliderDesc.cuboid(w,2.1,d),wall);
  }
  for(const w of walls){
   const body=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation((w.minX+w.maxX)/2,w.height/2,(w.minZ+w.maxZ)/2));
   this.world.createCollider(R.ColliderDesc.cuboid((w.maxX-w.minX)/2,w.height/2,(w.maxZ-w.minZ)/2),body);
  }
  // Previous-round remains have no dynamic Rapier ownership. New bodies
  // collide with their low, walkable cones; meshes keep exact old anatomy.
  for(const mound of archive?.mounds??[]){
   const body=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(mound.x,mound.height/2,mound.z));
   this.world.createCollider(R.ColliderDesc.cone(mound.height/2,mound.radius).setFriction(1.1).setCollisionGroups(0x00010006),body);
  }
 }
 accept(event){
  if(event.type==='fighter-incapacitated'){this.incapacitated.accept(event);return;}
  if(event.type!=='segment-detached')return;
  const poses=event.detachedParts??(event.detachedPose?[event.detachedPose]:[]);
  if(!poses.length)return;
  if(poses.length>1){
   const branch=createCompound(this.R,this.world,poses,{groups:0x00020005,linearDamping:.6,angularDamping:1.25,friction:.8});
   const id=this.nextId++,angle=(id+event.fighterId*17+event.tick*.13)*2.399963;
   branch.rb.setLinvel({x:Math.cos(angle)*.46,y:.20,z:Math.sin(angle)*.46},true);
   branch.rb.setAngvel({x:Math.cos(angle),y:.4,z:Math.sin(angle)},true);
   this.branches.push({...branch,id,fighterId:event.fighterId,age:0,still:0,settled:null});return;
  }
  const p=poses[0],f=boneFrame(p.a,p.b),R=this.R;
  // Quaternion rotating +Y onto the segment axis; sphere orientation is immaterial.
  const [x,y,z]=f.y,n=Math.hypot(z,1+y,x);
  const q=n>1e-8?{x:z/n,y:0,z:-x/n,w:(1+y)/n}:{x:1,y:0,z:0,w:0};
  const length=f.length>1e-8?f.length:0;
  const rb=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...f.center).setRotation(q).setLinearDamping(.6).setAngularDamping(1.25));
  const shape=length?R.ColliderDesc.capsule(length/2,p.radius):R.ColliderDesc.ball(p.radius);
  this.world.createCollider(shape.setMass(clamp(.9+length*2.1,.9,2.8)).setFriction(.8).setRestitution(0).setCollisionGroups(0x00020005),rb);
  const id=this.nextId++,angle=(id+event.fighterId*17+event.tick*.13)*2.399963;
  rb.setLinvel({x:Math.cos(angle)*.46,y:.20,z:Math.sin(angle)*.46},true);
  rb.setAngvel({x:Math.cos(angle),y:.4,z:Math.sin(angle)},true);
  this.items.push({id,rb,length,radius:p.radius,segmentId:p.id,fighterId:event.fighterId,age:0,still:0});
 }
 step(dt){
  if(dt!==1/60)throw new RangeError('Debris requires fixed 60 Hz');
  this.world.step();
  this.incapacitated.settle(this.moundSnapshot());
  for(const b of this.branches){
   if(b.settled)continue;
   const parts=compoundPose(b),v=b.rb.linvel(),w=b.rb.angvel();
   const near=parts.some(p=>[p.a,p.b].some(q=>q[1]-p.radius<=terrainHeight(q[0],q[2],this.moundSnapshot())+.06));
   const speed=Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z)*.4;
   b.age++;b.still=near&&(b.rb.isSleeping()||speed<.16)?b.still+1:0;
   if(b.still<60&&!(b.age>720&&near))continue;
   b.settled=parts;this.world.removeRigidBody(b.rb);b.rb=null;
   for(const [i,m] of bodyTerrain(parts).entries()){
    const R=this.R,rb=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(m.x,m.height/2,m.z));
    this.world.createCollider(R.ColliderDesc.cone(m.height/2,m.radius).setFriction(1.1).setCollisionGroups(0x00010006),rb);
    this.mounds.push({id:'branch:'+b.id+':'+i,source:'branch',...m});
   }
  }
  for(let i=this.items.length-1;i>=0;i--){
   const d=this.items[i],t=d.rb.translation(),q=d.rb.rotation(),v=d.rb.linvel(),w=d.rb.angvel();
   const speed=Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z)*.12;
   const bottom=t.y-(capsuleVerticalHalfExtent(d.length,d.radius,q));
   const nearGround=bottom<=terrainHeight(t.x,t.z,this.moundSnapshot())+.045;
   d.age++;d.still=(speed<.20&&(nearGround||d.rb.isSleeping()))?d.still+1:0;
   if(d.still>=60||(d.age>720&&nearGround)){
    const m=moundDimensions(t.x,t.z,d.length,d.radius,t.y,q),R=this.R;
    // Keep the exact visible segment pose independently of its collider.
    this.settledSingles.push({id:d.id,length:d.length,radius:d.radius,segmentId:d.segmentId,fighterId:d.fighterId,settled:true,position:{...t},rotation:{...q}});
    this.world.removeRigidBody(d.rb);
    const rb=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(m.x,m.height/2,m.z));
    this.world.createCollider(R.ColliderDesc.cone(m.height/2,m.radius).setFriction(1.1).setCollisionGroups(0x00010006),rb);
    this.mounds.push({id:d.id,source:'segment',...m});this.items.splice(i,1);
   }
  }
 }
 bodySnapshot(){return this.incapacitated.snapshot();}
 moundSnapshot(){return [...(this.archiveFloor?.mounds.map(m=>({...m}))??[]),...this.mounds.map(m=>({...m})),...this.incapacitated.moundSnapshot()];}
 archivedOilSnapshot(){return this.archiveFloor?.oilMarks.map(o=>({...o,point:[...o.point]}))??[];}
 /** Never flatten a falling ragdoll into saved scenery. Fully settled visual
  * geometry and hidden cone colliders are serialized independently. */
 exportSettledFloor(arenaId,oilMarks=[]){
  const bodies=this.bodySnapshot();
  if(this.items.length||this.branches.some(b=>!b.settled)||bodies.some(b=>!b.settled))
   throw new Error('Cannot archive an arena while physics bodies are falling');
  const remains=bodies.flatMap(b=>b.parts.map(p=>{
   const frame=boneFrame(p.a,p.b);
   const rotation=capsuleOrientation(frame.y);
   return {fighterId:b.fighterId,segmentId:p.id,settled:true,length:frame.length,radius:p.radius,
    position:{x:frame.center[0],y:frame.center[1],z:frame.center[2]},rotation};
  }));
  return createFloorHistory(arenaId,this.moundSnapshot(),[...this.snapshot(),...remains],
   [...this.archivedOilSnapshot(),...oilMarks]);
 }
 branchSnapshot(){return this.branches.map(b=>({id:b.id,fighterId:b.fighterId,settled:!!b.settled,parts:(b.settled??compoundPose(b)).map(p=>({...p,a:[...p.a],b:[...p.b]}))}));}
 snapshot(){
  const singles=this.items.map(d=>({id:d.id,length:d.length,radius:d.radius,segmentId:d.segmentId,fighterId:d.fighterId,settled:false,position:{...d.rb.translation()},rotation:{...d.rb.rotation()}}));
  const branches=this.branchSnapshot().flatMap(b=>b.parts.map(p=>{const f=boneFrame(p.a,p.b);return {id:'branch:'+b.id+':'+p.id,branchId:b.id,segmentId:p.id,settled:b.settled,length:f.length,radius:p.radius,fighterId:b.fighterId,position:{x:f.center[0],y:f.center[1],z:f.center[2]},rotation:capsuleOrientation(f.y)};}));
  const fresh=singles.concat(this.settledSingles.map(d=>({...d,position:{...d.position},rotation:{...d.rotation}})),branches);
  return (this.archiveFloor?.visuals.map(d=>({...d,position:{...d.position},rotation:{...d.rotation}}))??[]).concat(fresh);
 }
 dispose(){this.world?.free();this.world=null;this.items=[];this.settledSingles=[];this.branches=[];this.mounds=[];this.incapacitated=null;this.archiveFloor=null;}
}
