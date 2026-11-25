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
  // Topple away from the final hit; simultaneous losers no longer tip
  // into one another using the same world-space perturbation.
  const direction=event.fallDirection??[Math.sin(event.fighterId*2.399963),0,Math.cos(event.fighterId*2.399963)];
  const n=Math.hypot(direction[0],direction[2])||1,dx=direction[0]/n,dz=direction[2]/n;
  rb.setLinvel({x:dx*.38,y:0,z:dz*.38},true);
  rb.setAngvel({x:dz*2.4,y:0,z:-dx*2.4},true);
  this.bodies.set(event.fighterId,{rb,parts,dx,dz,still:0,age:0,settled:null,mounds:[]});
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
   const pelvis=parts.find(p=>p.id==='pelvis'),chest=parts.find(p=>p.id==='chest');
   const mid=p=>p.a.map((v,i)=>(v+p.b[i])*.5);
   const axis=pelvis&&chest?mid(chest).map((v,i)=>v-mid(pelvis)[i]):null;
   const lying=axis?Math.abs(axis[1])<Math.hypot(...axis)*.45:top-bottom<.90;
   b.age++;
   if(!lying&&b.age===120){
    b.rb.setLinvel({x:b.dx*.65,y:0,z:b.dz*.65},true);
    b.rb.setAngvel({x:b.dz*3.0,y:0,z:-b.dx*3.0},true);
   }
   b.still=near&&lying&&(b.rb.isSleeping()||Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z)*.4<.16)?b.still+1:0;
   if(b.still<60&&!(b.age>720&&near&&lying)&&!(b.age>=360&&!lying))continue;
   // Fail-safe for wedged or mutually supported upright compounds.
   // Rotate the whole captured pose as a rigid unit onto the floor.
   // Only used if physics failed to topple within six simulated seconds.
   let final=parts;
   if(!lying){
    const t=b.rb.translation(),pivot=[t.x,t.y,t.z];
    const v=axis??[0,1,0],h=Math.hypot(v[0],v[2]),angle=Math.atan2(v[1],h);
    const ux=h>1e-6?v[0]/h:b.dx,uz=h>1e-6?v[2]/h:b.dz,c=Math.cos(angle),s=Math.sin(angle);
    const rotate=p=>{const x=p[0]-pivot[0],y=p[1]-pivot[1],z=p[2]-pivot[2],d=x*ux+z*uz,offset=d*(c-1)+y*s;return [p[0]+ux*offset,pivot[1]+y*c-d*s,p[2]+uz*offset];};
    final=parts.map(p=>({...p,a:rotate(p.a),b:rotate(p.b)}));
    const lift=Math.max(...final.flatMap(p=>[p.a,p.b].map(q=>terrainHeight(q[0],q[2],terrain)+p.radius-q[1])));
    final=final.map(p=>({...p,a:[p.a[0],p.a[1]+lift,p.a[2]],b:[p.b[0],p.b[1]+lift,p.b[2]]}));
   }
   b.settled=final;b.mounds=bodyTerrain(final).map((m,i)=>({...m,id:'body:'+fighterId+':'+i,source:'body'}));
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
