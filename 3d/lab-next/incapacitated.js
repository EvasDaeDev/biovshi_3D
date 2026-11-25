import {bodyTerrain} from '../core/dist/collision/body-terrain.js';
import {terrainHeight} from '../core/dist/collision/terrain.js';
import {createCompound,compoundPose} from './compound.js';
/** Compound body keeps the final rig pose, with one rigid body per patient.
 * On settling, remove capsule colliders and retain visual pose over cones. */
export class IncapacitatedBodies{
 constructor(R,world){this.R=R;this.world=world;this.bodies=new Map();}
 accept(event){
  if(event.type!=='fighter-incapacitated'||!event.bodyPose?.length||this.bodies.has(event.fighterId))return;
  const {rb,parts}=createCompound(this.R,this.world,event.bodyPose,{groups:0x00040007});
  // Tiny initial angular perturbation avoids a perfectly symmetric upright
  // compound balancing indefinitely on the rounded feet.
  rb.setAngvel({x:.65,y:0,z:.15},true);
  this.bodies.set(event.fighterId,{rb,parts,still:0,age:0,settled:null,mounds:[]});
 }
 worldPose(b){
  if(b.settled)return b.settled;
  return compoundPose(b);
 }
 settle(terrain){
  for(const [fighterId,b] of this.bodies){
   if(b.settled)continue;
   const v=b.rb.linvel(),w=b.rb.angvel(),parts=this.worldPose(b);
   const near=parts.some(p=>[p.a,p.b].some(q=>q[1]-p.radius<=terrainHeight(q[0],q[2],terrain)+.06));
   const bottom=Math.min(...parts.map(p=>Math.min(p.a[1],p.b[1])-p.radius));
   const top=Math.max(...parts.map(p=>Math.max(p.a[1],p.b[1])+p.radius));
   const lying=top-bottom<.90;
   b.age++;b.still=near&&lying&&(b.rb.isSleeping()||Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z)*.4<.16)?b.still+1:0;
   if(b.still<60&&!(b.age>720&&near&&lying))continue;
   b.settled=parts;b.mounds=bodyTerrain(parts).map((m,i)=>({...m,id:'body:'+fighterId+':'+i,source:'body'}));
   this.world.removeRigidBody(b.rb);b.rb=null;
   for(const m of b.mounds){
    const R=this.R,rb=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(m.x,m.height/2,m.z));
    this.world.createCollider(R.ColliderDesc.cone(m.height/2,m.radius).setFriction(1.1).setCollisionGroups(0x00010006),rb);
   }
  }
 }
 moundSnapshot(){return [...this.bodies.values()].flatMap(b=>b.mounds.map(m=>({...m})));}
 snapshot(){
  return [...this.bodies].map(([fighterId,b])=>({fighterId,parts:this.worldPose(b).map(p=>({...p,a:[...p.a],b:[...p.b]})),settled:!!b.settled,sleeping:b.settled?true:b.rb.isSleeping()}));
 }
}
