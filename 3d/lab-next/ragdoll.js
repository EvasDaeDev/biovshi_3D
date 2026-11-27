import {physicalCapsule} from '../core/dist/rig/shared-anatomy.js';
import {HANDOFF_LIMITS} from '../core/dist/animation/handoff-motion.js';
import {LAB_SEGMENTS} from '../core/dist/rig/anatomy.js';
import {createCompound,compoundPose} from './compound.js';
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vec=([x,y,z])=>({x,y,z});
const center=rb=>{const t=rb.translation();return [t.x,t.y,t.z];};
const torsoIds=new Set(['pelvis','abdomen','chest']);
const parents=new Map(LAB_SEGMENTS.map(p=>[p.id,p.parent]));
// Rapier's 16 collision bits: 1 terrain, 2 debris, 4 common
// ragdoll membership (for existing terrain/debris filters). Bits 3–15
// distinguish simultaneous casualties without breaking those filters.
export const RAGDOLL_SLOTS=13;
export function ragdollCollisionGroups(slot,selfCollision=true){
 if(slot<0||slot>=RAGDOLL_SLOTS)return 0xfffcffff>>>0;
 const bit=1<<(slot+3);
 const membership=4|bit,filter=0xfffb&~(selfCollision?0:bit);
 return ((membership<<16)|filter)>>>0;
}
export function relaxRagdoll(rag){
 for(const node of rag.nodes){
  node.rb.setLinearDamping(3);node.rb.setAngularDamping(4);
  // Keep collision with other casualties, debris and the world. Remove
  // only own non-adjacent contacts which can fight the joint constraints.
  for(const c of node.colliders)c.setCollisionGroups(ragdollCollisionGroups(rag.slot,false));
 }
}

/** Preserve the captured geometry at handoff. The three central segments
 * share a torso body; head, neck and every surviving limb segment have
 * independent inertial bodies. Joint anchors are expressed in each body's
 * initial local frame (all bodies begin with identity rotation).
 * No animation or kinematic motor drives the falling patient. */
export function createRagdoll(R,world,pose,direction,slot=-1,motion=[]){
 const parts=new Map(pose.map(p=>[p.id,p])),order=pose.map(p=>p.id),nodes=[],byPart=new Map(),joints=[];
 const groups=[pose.filter(p=>torsoIds.has(p.id)),...pose.filter(p=>!torsoIds.has(p.id)).map(p=>[p])].filter(g=>g.length);
 for(const group of groups){
  const node=createCompound(R,world,group,{groups:ragdollCollisionGroups(slot),linearDamping:.85,angularDamping:1.35,friction:.9});
  nodes.push(node);for(const part of group)byPart.set(part.id,node);
 }
 for(const child of pose){
  const parent=parts.get(parents.get(child.id)),a=parent&&byPart.get(parent.id),b=byPart.get(child.id);
  if(!a||!b||a===b)continue;
  // A capsule sphere can be offset from the end of its parent (head/foot).
  // Use the anatomical joint, not the sphere centre, for the shared pivot.
  const pivot=child.id==='head'||child.id.endsWith('.foot')||child.id.endsWith('.hand')?parent.b:child.a;
  const anchorA=vec(sub(pivot,center(a.rb))),anchorB=vec(sub(pivot,center(b.rb)));
  const hinge=/\.(lowerArm|lowerLeg)$/.test(child.id);
  let data;
  if(hinge){
   let axis=cross(sub(parent.b,parent.a),sub(child.b,child.a));
   if(Math.hypot(...axis)<1e-5){
    const girdle=parts.get(child.id.endsWith('lowerArm')?'chest':'pelvis');
    axis=girdle?sub(girdle.b,girdle.a):[1,0,0];
   }
   const n=Math.hypot(...axis)||1;
   data=R.JointData.revolute(anchorA,anchorB,vec(axis.map(v=>v/n)));
  }else data=R.JointData.spherical(anchorA,anchorB);
  const joint=world.createImpulseJoint(data,a.rb,b.rb,true);
  joint.setContactsEnabled(false);
  // Limits relative to the captured pose, not final animation tuning.
  if(hinge)joint.setLimits(-1.5,1.5);
  joints.push({joint,a,b,parentId:parent.id,childId:child.id});
 }
 const torso=byPart.get('pelvis')??byPart.get('chest')??nodes[0],origin=center(torso.rb);
 const inherited=new Map(motion.filter(m=>Array.isArray(m.linear)&&m.linear.length===3&&Array.isArray(m.angular)&&m.angular.length===3&&[...m.linear,...m.angular].every(Number.isFinite)).map(m=>[m.id,m]));
 const cap=(v,max)=>{const n=Math.hypot(...v);return n>max?v.map(x=>x*max/n):v;};
 const n=Math.hypot(direction[0],direction[2])||1,dx=direction[0]/n,dz=direction[2]/n,omega=[dz*2.4,0,-dx*2.4];
 // Inherit coherent outward tipping velocity, but each limb is free to
 // fold under gravity and contact immediately after handoff.
 for(const node of nodes){
  const v=cross(omega,sub(center(node.rb),origin));
  const fallback=[dx*.38+v[0]*.55,Math.min(0,v[1]*.55),dz*.38+v[2]*.55];
  // Use the same capsule-volume weights as createCompound. A shared torso
  // cannot independently inherit each central segment's angular motion.
  let mass=0;const linear=[0,0,0],angular=[0,0,0];
  for(const p of node.parts){
   const m=inherited.get(p.id);if(!m)continue;
   const {a,b,radius}=physicalCapsule(p);
   const w=radius*radius*Math.hypot(...sub(b,a))+4*radius**3/3;
   mass+=w;
   for(let i=0;i<3;i++){linear[i]+=m.linear[i]*w;angular[i]+=m.angular[i]*w;}
  }
  if(mass>0){
   // Keep a bounded tipping impulse so a stationary casualty still falls.
   // Preserve independent limb motion rather than assigning one omega.
   node.rb.setLinvel(vec(cap(linear.map((x,i)=>x/mass*.75+fallback[i]*.55),HANDOFF_LIMITS.linear)),true);
   node.rb.setAngvel(vec(cap(angular.map((x,i)=>x/mass*.75+omega[i]*.55),HANDOFF_LIMITS.angular)),true);
  }else{
   node.rb.setLinvel(vec(fallback),true);node.rb.setAngvel(vec(omega),true);
  }
 }
 return {nodes,joints,torso,order,dx,dz,slot};
}
/** Follow the CURRENT torso inclination. A constant last-hit direction
 * can restore an already tilted torso to vertical instead of toppling it.
 * omega cross axis must reduce the absolute vertical component. */
export function collapseDirection(axis,dx,dz,attempt=0){
 const h=axis?Math.hypot(axis[0],axis[2]):0;
 let x=h>.04?axis[0]/h:dx,z=h>.04?axis[2]/h:dz;
 // A nearly unchanged support configuration needs a slightly different
 // direction on successive attempts to roll off the supporting limb.
 const angle=attempt%3===1?.45:attempt%3===2?-.45:0;
 const c=Math.cos(angle),s=Math.sin(angle),sign=axis&&axis[1]<0?-1:1;
 return {x:(x*c-z*s)*sign,z:(x*s+z*c)*sign};
}
export function nudgeCollapse(rag,axis,attempt){
 const d=collapseDirection(axis,rag.dx,rag.dz,attempt);
 const origin=center(rag.torso.rb),rate=Math.min(4.8,2.8+.45*attempt);
 const omega=[d.z*rate,0,-d.x*rate],drive=Math.min(1.1,.48+.12*attempt);
 // A short coherent velocity pulse keeps joint anchors compatible.
 // Every segment remains an independent simulated body. No position or
 // rotation is assigned here, so gravity and contact still decide the fall.
 for(const node of rag.nodes){
  const offset=sub(center(node.rb),origin),v=cross(omega,offset);
  node.rb.setLinearDamping(1.2);node.rb.setAngularDamping(1.8);
  if(attempt>=2)for(const c of node.colliders)c.setFriction(.25);
  node.rb.setLinvel({x:d.x*drive+v[0],y:v[1]-.12,z:d.z*drive+v[2]},true);
  node.rb.setAngvel(vec(omega),true);
 }
}
export function ragdollPose(rag){
 const parts=new Map(rag.nodes.flatMap(compoundPose).map(p=>[p.id,p]));
 return rag.order.map(id=>parts.get(id));
}
export function ragdollMotion(rag){
 return {sleeping:rag.nodes.every(n=>n.rb.isSleeping()),speed:Math.max(...rag.nodes.map(n=>{
  const v=n.rb.linvel(),w=n.rb.angvel();return Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z)*.16;
 }))};
}
export function removeRagdoll(world,rag){
 // Removing the bodies also removes their colliders and impulse joints.
 for(const node of rag.nodes)world.removeRigidBody(node.rb);
 rag.nodes.length=0;rag.joints.length=0;
}
