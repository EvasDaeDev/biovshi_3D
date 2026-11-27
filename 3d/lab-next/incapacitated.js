import {physicalCapsule} from '../core/dist/rig/shared-anatomy.js';
import {bodyPool} from './body-pool.js';
import {bodyTerrain} from '../core/dist/collision/body-terrain.js';
import {terrainHeight} from '../core/dist/collision/terrain.js';
import {createRagdoll,ragdollPose,ragdollMotion,removeRagdoll,relaxRagdoll,nudgeCollapse,RAGDOLL_SLOTS} from './ragdoll.js';
/** Physics-driven articulated fall, followed by static visible anatomy
 * and a small number of invisible walkable cone colliders. */
export class IncapacitatedBodies{
 constructor(R,world,baseHeight=()=>0){this.R=R;this.world=world;this.baseHeight=baseHeight;this.bodies=new Map();this.tick=0;}
 accept(event){
  if(event.type!=='fighter-incapacitated'||!event.bodyPose?.length||this.bodies.has(event.fighterId))return;
  const direction=event.fallDirection??[Math.sin(event.fighterId*2.399963),0,Math.cos(event.fighterId*2.399963)];
  const occupied=new Set([...this.bodies.values()].filter(b=>b.rag).map(b=>b.rag.slot));
  const slot=Array.from({length:RAGDOLL_SLOTS},(_,i)=>i).find(i=>!occupied.has(i))??-1;
  const rag=createRagdoll(this.R,this.world,event.bodyPose,direction,slot,event.bodyMotion??[]);
  this.bodies.set(event.fighterId,{rag,still:0,age:0,attempts:0,quiet:0,reference:null,motion:null,settled:null,mounds:[],pool:null});
 }
 worldPose(b){return b.settled??ragdollPose(b.rag);}
 settle(terrain){
  this.tick++;
  for(const [fighterId,b] of this.bodies){
   if(b.settled)continue;
   const parts=this.worldPose(b),rag=b.rag,{sleeping,speed}=ragdollMotion(rag);
   const capsules=parts.map(physicalCapsule);
   const near=capsules.some(p=>[p.a,p.a.map((v,i)=>(v+p.b[i])*.5),p.b].some(q=>q[1]-p.radius<=this.baseHeight(q[0],q[2])+terrainHeight(q[0],q[2],terrain)+.08));
   const bottom=Math.min(...capsules.map(p=>Math.min(p.a[1],p.b[1])-p.radius));
   const top=Math.max(...capsules.map(p=>Math.max(p.a[1],p.b[1])+p.radius));
   const pelvis=parts.find(p=>p.id==='pelvis'),chest=parts.find(p=>p.id==='chest');
   const axis=pelvis&&chest?chest.a.map((v,i)=>(v+chest.b[i]-pelvis.a[i]-pelvis.b[i])*.5):null;
   const lying=axis?Math.abs(axis[1])<Math.hypot(...axis)*.45:top-bottom<.90;
   b.age++;
   // First relax own contacts, then let the body roll off its support.
   // The original last-hit direction is only the fallback for a vertical torso.
   if(b.age===360)relaxRagdoll(rag);
   if(!lying&&near&&b.age>=120&&(b.age-120)%90===0){
    nudgeCollapse(rag,axis,b.attempts++);
    b.still=0;b.quiet=0;b.reference=null;
    b.motion={age:b.age,near,lying,speed,sleeping,still:0,quiet:0,bottom,top,attempts:b.attempts};
    continue;
   }
   // Increase damping only once lying; strong damping while tipped can
   // stabilize the same unwanted perched pose.
   if(lying&&b.age>=360)for(const node of rag.nodes){
    node.rb.setLinearDamping(b.age>=600?6:3);node.rb.setAngularDamping(b.age>=600?8:4);
   }
   const supported=(near||sleeping)&&lying;
   b.still=supported&&(sleeping||speed<.20)?b.still+1:0;
   // A constrained resting limb may have nonzero solver angular velocity.
   // Require the WHOLE visible pose to remain within 3 cm of one fixed
   // reference for a full second, not just tiny per-tick displacement.
   if(!supported){b.reference=null;b.quiet=0;}
   else{
    const drift=b.reference?Math.max(...parts.flatMap((p,i)=>['a','b'].map(k=>Math.hypot(...p[k].map((v,j)=>v-b.reference[i][k][j]))))):Infinity;
    if(drift>.03){b.reference=parts;b.quiet=0;}else b.quiet++;
   }
   b.motion={age:b.age,near,lying,speed,sleeping,still:b.still,quiet:b.quiet,bottom,top,attempts:b.attempts};
   if(b.still<60&&!(b.age>=360&&b.quiet>=60))continue;
   b.settled=parts;b.pool=bodyPool(parts,fighterId,this.tick,this.baseHeight);b.mounds=bodyTerrain(parts,this.baseHeight).map((m,i)=>({...m,id:'body:'+fighterId+':'+i,source:'body'}));
   removeRagdoll(this.world,rag);b.rag=null;
   for(const m of b.mounds){
    const R=this.R,rb=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(m.x,this.baseHeight(m.x,m.z)+m.height/2,m.z));
    this.world.createCollider(R.ColliderDesc.cone(m.height/2,m.radius).setFriction(1.1).setCollisionGroups(0x00010006),rb);
   }
  }
 }
 poolSnapshot(){return [...this.bodies.values()].flatMap(b=>b.pool?[{...b.pool,point:[...b.pool.point]}]:[]);}
 moundSnapshot(){return [...this.bodies.values()].flatMap(b=>b.mounds.map(m=>({...m})));}
 snapshot(){
  return [...this.bodies].map(([fighterId,b])=>({fighterId,parts:this.worldPose(b).map(p=>({...p,a:[...p.a],b:[...p.b]})),settled:!!b.settled,sleeping:b.settled?true:ragdollMotion(b.rag).sleeping,dynamicBodies:b.rag?.nodes.length??0,joints:b.rag?.joints.length??0,motion:b.motion?{...b.motion}:null}));
 }
}
