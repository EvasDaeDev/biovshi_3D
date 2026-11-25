import {bodyTerrain} from '../core/dist/collision/body-terrain.js';
import {terrainHeight} from '../core/dist/collision/terrain.js';
import {createRagdoll,ragdollPose,ragdollMotion,removeRagdoll} from './ragdoll.js';
/** Physics-driven articulated fall, followed by static visible anatomy
 * and a small number of invisible walkable cone colliders. */
export class IncapacitatedBodies{
 constructor(R,world){this.R=R;this.world=world;this.bodies=new Map();}
 accept(event){
  if(event.type!=='fighter-incapacitated'||!event.bodyPose?.length||this.bodies.has(event.fighterId))return;
  const direction=event.fallDirection??[Math.sin(event.fighterId*2.399963),0,Math.cos(event.fighterId*2.399963)];
  const rag=createRagdoll(this.R,this.world,event.bodyPose,direction);
  this.bodies.set(event.fighterId,{rag,still:0,age:0,settled:null,mounds:[]});
 }
 worldPose(b){return b.settled??ragdollPose(b.rag);}
 settle(terrain){
  for(const [fighterId,b] of this.bodies){
   if(b.settled)continue;
   const parts=this.worldPose(b),rag=b.rag,{sleeping,speed}=ragdollMotion(rag);
   const near=parts.some(p=>[p.a,p.b].some(q=>q[1]-p.radius<=terrainHeight(q[0],q[2],terrain)+.06));
   const bottom=Math.min(...parts.map(p=>Math.min(p.a[1],p.b[1])-p.radius));
   const top=Math.max(...parts.map(p=>Math.max(p.a[1],p.b[1])+p.radius));
   const pelvis=parts.find(p=>p.id==='pelvis'),chest=parts.find(p=>p.id==='chest');
   const axis=pelvis&&chest?chest.a.map((v,i)=>(v+chest.b[i]-pelvis.a[i]-pelvis.b[i])*.5):null;
   const lying=axis?Math.abs(axis[1])<Math.hypot(...axis)*.45:top-bottom<.90;
   b.age++;
   // If held upright by the wall or another casualty, try a bounded
   // outward impulse on the torso; never rotate/teleport a frozen pose.
   if(!lying&&b.age<=480&&b.age%120===0){
    const rb=rag.torso.rb;
    rb.setLinvel({x:rag.dx*.52,y:0,z:rag.dz*.52},true);
    rb.setAngvel({x:rag.dz*2.5,y:0,z:-rag.dx*2.5},true);
    b.still=0;continue;
   }
   // Dampen residual joint oscillation after six seconds. Still require
   // actual rest; no timeout-based freezing of airborne moving bodies.
   if(b.age===360)for(const node of rag.nodes){node.rb.setLinearDamping(3);node.rb.setAngularDamping(4);}
   b.still=(near||sleeping)&&(lying||b.age>480)&&(sleeping||speed<.20)?b.still+1:0;
   if(b.still<60)continue;
   b.settled=parts;b.mounds=bodyTerrain(parts).map((m,i)=>({...m,id:'body:'+fighterId+':'+i,source:'body'}));
   removeRagdoll(this.world,rag);b.rag=null;
   for(const m of b.mounds){
    const R=this.R,rb=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(m.x,m.height/2,m.z));
    this.world.createCollider(R.ColliderDesc.cone(m.height/2,m.radius).setFriction(1.1).setCollisionGroups(0x00010006),rb);
   }
  }
 }
 moundSnapshot(){return [...this.bodies.values()].flatMap(b=>b.mounds.map(m=>({...m})));}
 snapshot(){
  return [...this.bodies].map(([fighterId,b])=>({fighterId,parts:this.worldPose(b).map(p=>({...p,a:[...p.a],b:[...p.b]})),settled:!!b.settled,sleeping:b.settled?true:ragdollMotion(b.rag).sleeping,dynamicBodies:b.rag?.nodes.length??0,joints:b.rag?.joints.length??0}));
 }
}
