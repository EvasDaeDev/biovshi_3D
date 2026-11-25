import {bodyTerrain} from '../core/dist/collision/body-terrain.js';
import {terrainHeight} from '../core/dist/collision/terrain.js';
import {boneFrame} from '../core/dist/rig/bone-frame.js';
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
function rotate(p,q){
 const [x,y,z]=p,{x:u,y:v,z:w,w:s}=q;
 const tx=2*(v*z-w*y),ty=2*(w*x-u*z),tz=2*(u*y-v*x);
 return [x+s*tx+v*tz-w*ty,y+s*ty+w*tx-u*tz,z+s*tz+u*ty-v*tx];
}
function orientation(axis){
 const [x,y,z]=axis,n=Math.hypot(z,1+y,x);
 return n>1e-8?{x:z/n,y:0,z:-x/n,w:(1+y)/n}:{x:1,y:0,z:0,w:0};
}
/** Compound body keeps the final rig pose, with one rigid body per patient.
 * On settling, remove capsule colliders and retain visual pose over cones. */
export class IncapacitatedBodies{
 constructor(R,world){this.R=R;this.world=world;this.bodies=new Map();}
 accept(event){
  if(event.type!=='fighter-incapacitated'||!event.bodyPose?.length||this.bodies.has(event.fighterId))return;
  const R=this.R,frames=event.bodyPose.map(p=>({p,f:boneFrame(p.a,p.b)}));
  const mass=frames.map(({p,f})=>p.radius*p.radius*f.length+4*p.radius**3/3);
  const total=mass.reduce((a,b)=>a+b,0);
  const origin=[0,1,2].map(i=>frames.reduce((a,{f},j)=>a+f.center[i]*mass[j],0)/total);
  const rb=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...origin).setLinearDamping(.7).setAngularDamping(1.1));
  const parts=[];
  for(const {p,f} of frames){
   const center=sub(f.center,origin),shape=f.length>1e-8?R.ColliderDesc.capsule(f.length/2,p.radius):R.ColliderDesc.ball(p.radius);
   this.world.createCollider(shape.setTranslation(...center).setRotation(orientation(f.y)).setDensity(25).setFriction(.9).setRestitution(0).setCollisionGroups(0x00040007),rb);
   parts.push({id:p.id,a:sub(p.a,origin),b:sub(p.b,origin),radius:p.radius});
  }
  // Tiny initial angular perturbation avoids a perfectly symmetric upright
  // compound balancing indefinitely on the rounded feet.
  rb.setAngvel({x:.65,y:0,z:.15},true);
  this.bodies.set(event.fighterId,{rb,parts,still:0,age:0,settled:null,mounds:[]});
 }
 worldPose(b){
  if(b.settled)return b.settled;
  const t=b.rb.translation(),q=b.rb.rotation(),origin=[t.x,t.y,t.z];
  return b.parts.map(p=>({id:p.id,a:add(origin,rotate(p.a,q)),b:add(origin,rotate(p.b,q)),radius:p.radius}));
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
