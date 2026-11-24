import {moundDimensions,terrainHeight,capsuleVerticalHalfExtent} from '../core/dist/collision/terrain.js';
import {boneFrame} from '../core/dist/rig/bone-frame.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Physics adapter owns Rapier bodies; renderer consumes plain snapshots. */
export class DebrisWorld {
 constructor(RAPIER){this.R=RAPIER;this.reset();}
 reset(){
  this.world?.free();
  const R=this.R;
  this.world=new R.World({x:0,y:-9.81,z:0});this.world.timestep=1/60;
  this.items=[];this.mounds=[];this.nextId=0;
  const floor=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0,-.19,0));
  this.world.createCollider(R.ColliderDesc.cuboid(7,.19,7).setFriction(.95),floor);
  for(const [x,z,w,d] of [[7,0,.15,7],[-7,0,.15,7],[0,7,7,.15],[0,-7,7,.15]]){
   const wall=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x,2.1,z));
   this.world.createCollider(R.ColliderDesc.cuboid(w,2.1,d),wall);
  }
 }
 accept(event){
  if(event.type!=='segment-detached'||!event.detachedPose)return;
  const p=event.detachedPose,f=boneFrame(p.a,p.b),R=this.R;
  // Quaternion rotating +Y onto the segment axis; sphere orientation is immaterial.
  const [x,y,z]=f.y,n=Math.hypot(z,1+y,x);
  const q=n>1e-8?{x:z/n,y:0,z:-x/n,w:(1+y)/n}:{x:1,y:0,z:0,w:0};
  const length=f.length>.11?f.length:0;
  const rb=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...f.center).setRotation(q).setLinearDamping(.6).setAngularDamping(1.25));
  const shape=length?R.ColliderDesc.capsule(length/2,p.radius):R.ColliderDesc.ball(p.radius);
  this.world.createCollider(shape.setMass(clamp(.9+length*2.1,.9,2.8)).setFriction(.8).setRestitution(0).setCollisionGroups(0x00020001),rb);
  const id=this.nextId++,angle=(id+event.fighterId*17+event.tick*.13)*2.399963;
  rb.setLinvel({x:Math.cos(angle)*.46,y:.20,z:Math.sin(angle)*.46},true);
  rb.setAngvel({x:Math.cos(angle),y:.4,z:Math.sin(angle)},true);
  this.items.push({id,rb,length,radius:p.radius,fighterId:event.fighterId,age:0,still:0});
 }
 step(dt){
  if(dt!==1/60)throw new RangeError('Debris requires fixed 60 Hz');
  this.world.step();
  for(let i=this.items.length-1;i>=0;i--){
   const d=this.items[i],t=d.rb.translation(),q=d.rb.rotation(),v=d.rb.linvel(),w=d.rb.angvel();
   const speed=Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z)*.12;
   const bottom=t.y-(capsuleVerticalHalfExtent(d.length,d.radius,q));
   const nearGround=bottom<=terrainHeight(t.x,t.z,this.mounds)+.045;
   d.age++;d.still=(speed<.20&&(nearGround||d.rb.isSleeping()))?d.still+1:0;
   if(d.still>=60||(d.age>720&&nearGround)){
    const m=moundDimensions(t.x,t.z,d.length,d.radius,t.y,q),R=this.R;
    this.world.removeRigidBody(d.rb);
    const rb=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(m.x,m.height/2,m.z));
    this.world.createCollider(R.ColliderDesc.cone(m.height/2,m.radius).setFriction(1.1).setCollisionGroups(0x00010002),rb);
    this.mounds.push({id:d.id,...m});this.items.splice(i,1);
   }
  }
 }
 moundSnapshot(){return this.mounds.map(m=>({...m}));}
 snapshot(){return this.items.map(d=>({id:d.id,length:d.length,radius:d.radius,fighterId:d.fighterId,position:{...d.rb.translation()},rotation:{...d.rb.rotation()}}));}
 dispose(){this.world?.free();this.world=null;this.items=[];this.mounds=[];}
}
