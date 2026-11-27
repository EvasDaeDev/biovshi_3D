import {physicalCapsule} from '../core/dist/rig/shared-anatomy.js';
import {boneFrame} from '../core/dist/rig/bone-frame.js';
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
function rotate(p,q){
 const [x,y,z]=p,{x:u,y:v,z:w,w:s}=q;
 const tx=2*(v*z-w*y),ty=2*(w*x-u*z),tz=2*(u*y-v*x);
 return [x+s*tx+v*tz-w*ty,y+s*ty+w*tx-u*tz,z+s*tz+u*ty-v*tx];
}
export function capsuleOrientation(axis){
 const [x,y,z]=axis,n=Math.hypot(z,1+y,x);
 return n>1e-8?{x:z/n,y:0,z:-x/n,w:(1+y)/n}:{x:1,y:0,z:0,w:0};
}
/** One rigid body, one collider per attached segment. Local endpoints
 * retain the exact relative geometry for rendering after the handoff. */
export function createCompound(R,world,poses,{groups,linearDamping=.7,angularDamping=1.1,friction=.9}){
 const frames=poses.map(p=>{
  const capsule=physicalCapsule(p);
  return {p,radius:capsule.radius,f:boneFrame(capsule.a,capsule.b)};
 });
 const mass=frames.map(({radius,f})=>radius*radius*f.length+4*radius**3/3);
 const total=mass.reduce((a,b)=>a+b,0);
 const origin=[0,1,2].map(i=>frames.reduce((a,{f},j)=>a+f.center[i]*mass[j],0)/total);
 const rb=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...origin).setLinearDamping(linearDamping).setAngularDamping(angularDamping));
 const parts=[],colliders=[];
 for(const {p,radius,f} of frames){
  const center=sub(f.center,origin),shape=f.length>1e-8?R.ColliderDesc.capsule(f.length/2,radius):R.ColliderDesc.ball(radius);
  colliders.push(world.createCollider(shape.setTranslation(...center).setRotation(capsuleOrientation(f.y)).setDensity(25).setFriction(friction).setRestitution(0).setCollisionGroups(groups),rb));
  parts.push({...p,a:sub(p.a,origin),b:sub(p.b,origin)});
 }
 return {rb,parts,colliders};
}
export function compoundPose({rb,parts}){
 const t=rb.translation(),q=rb.rotation(),origin=[t.x,t.y,t.z];
 return parts.map(p=>({...p,a:add(origin,rotate(p.a,q)),b:add(origin,rotate(p.b,q))}));
}
