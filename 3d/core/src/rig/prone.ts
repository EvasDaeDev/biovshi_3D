import type { Vec3 } from '../types.js';
import type { RigPose } from './gait.js';
import type { Mobility } from './mobility.js';
import { LAB_SEGMENTS } from './anatomy.js';
import { solveTwoBone } from './two-bone.js';
import { constrainRig } from './rig-constraints.js';
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const scale=(a:Vec3,n:number):Vec3=>[a[0]*n,a[1]*n,a[2]*n];
/** Kinematic ground locomotion. No rigid body or renderer dependency.
 * Pose is pure: repeated collision passes never advance phase. */
export function pronePose(root:Vec3,yaw:number,phase:number,effort:number,direction:number,mobility:Mobility,ground:(x:number,z:number)=>number,organic=false):readonly RigPose[]{
 const c=Math.cos(yaw),s=Math.sin(yaw),wave=Math.sin(phase),w=effort*wave;
 const world=(p:Vec3):Vec3=>add(root,[c*p[0]-s*p[2],p[1],s*p[0]+c*p[2]]);
 const floorAt=(x:number,z:number)=>{const p=world([x,0,z]);return ground(p[0],p[2])-root[1];};
 const torsoOnly=mobility.mode==='torso-crawl',headDriven=mobility.mode==='head-crawl';
 const hip:Vec3=[w*.045,.15+Math.abs(w)*.015,w*.035];
 const chest:Vec3=[-w*.065,.22+Math.abs(w)*.025,-.49+(headDriven?w*.07:torsoOnly?w*.05:0)];
 const roll=torsoOnly?w*.19:w*.055;
 const across=(center:Vec3,half:number,side:number):Vec3=>add(center,[side*half*Math.cos(roll),side*half*Math.sin(roll),0]);
 const hipAt=(side:number)=>across(hip,.17,side),shoulderAt=(side:number)=>torsoOnly?add(chest,[side*.34*Math.cos(roll),-side*.34*Math.sin(roll),0]):across(chest,.34,side);
 const headZ=chest[2]-.31+(headDriven?w*.08:0);
 // During the driving half-cycle pitch the connected neck toward the floor;
 // during recovery lift the head. The fixed-length reconstruction and
 // terrain envelope below still determine the final capsule position.
 const push=Math.cos(phase);
 const headY=headDriven?chest[1]-.07-effort*.13*Math.max(0,push)+effort*.11*Math.max(0,-push):Math.max(.195,floorAt(chest[0],headZ)+.19)+.025;
 const head:Vec3=[chest[0]+(headDriven?w*.045:0),headY,headZ];
 const points=new Map<string,readonly [Vec3,Vec3]>();
 const put=(id:string,a:Vec3,b:Vec3=a)=>points.set(id,[world(a),world(b)]);
 put('pelvis',hipAt(-1),hipAt(1));put('abdomen',hip,chest);put('chest',shoulderAt(-1),shoulderAt(1));
 put('neck',chest,add(head,[0,0,.10]));put('head',head);
 for(let i=0;i<2;i++){
  const side=i===0?-1:1,key=i===0?'L.':'R.',h=hipAt(side),shoulder=shoulderAt(side);
  const legX=h[0]+side*.10,legZ=h[2]+.83;
  const foot:Vec3=[legX,Math.max(.13,floorAt(legX,legZ)+.13),legZ];
  const leg=solveTwoBone(h,foot,.49,.50,[side*.3,1,0]);
  put(key+'upperLeg',h,leg.joint);put(key+'lowerLeg',leg.joint,leg.end);put(key+'foot',leg.end);
  const arm=mobility.arms[i]??0;
  const offset=mobility.arms[0]&&mobility.arms[1]?i*Math.PI:0;
  const stroke=Math.sin(phase+offset),recovery=Math.max(0,Math.cos(phase+offset));
  const x=shoulder[0]+side*.12,z=shoulder[2]-.17-direction*effort*stroke*(organic?.27:.20);
  const height=arm===1?.10:.083;
  const target:Vec3=[x,Math.max(height,floorAt(x,z)+height)+effort*recovery*.095,z];
  if(arm===1){
   const delta:Vec3=[side*.12,-.25-effort*.08*Math.max(0,Math.cos(phase+offset))+effort*.10*Math.max(0,-Math.cos(phase+offset)),-.17-direction*effort*stroke*(organic?.12:.09)],len=Math.hypot(...delta);
   const elbow=add(shoulder,len>1e-8?scale(delta,.36/len):[0,-.36,0]);
   put(key+'upperArm',shoulder,elbow);put(key+'lowerArm',elbow,add(elbow,[0,0,-.32]));put(key+'hand',add(elbow,[0,0,-.32]));
  }else{
   const a=solveTwoBone(shoulder,target,.36,.32,[side*.7,.5,.25]);
   put(key+'upperArm',shoulder,a.joint);put(key+'lowerArm',a.joint,a.end);put(key+'hand',a.end);
  }
 }
 return LAB_SEGMENTS.map(def=>{const [a,b]=points.get(def.id)!;return {id:def.id,a,b,radius:def.radius};});
}
/** Blend toward the ground pose and correct the active capsule envelope.
 * Sample endpoints and midpoint; this is approximate on steep terrain. */
export function blendGroundPose(standing:readonly RigPose[],prone:readonly RigPose[],amount:number,active:readonly string[],ground:(x:number,z:number)=>number,continuous=false):readonly RigPose[]{
 if(continuous&&amount===0)return standing;
 const t=amount*amount*(3-2*amount);
 const result=constrainRig(standing.map((p,i)=>{const q=prone[i]!;return {...p,a:mix(p.a,q.a,t),b:mix(p.b,q.b,t)};}));
 let correction=-Infinity;
 for(const p of result)if(active.includes(p.id))for(const point of [p.a,p.b,mix(p.a,p.b,.5)])correction=Math.max(correction,ground(point[0],point[2])+p.radius-point[1]);
 const lift=Number.isFinite(correction)?(continuous&&correction<0?correction*t:amount>=1?correction:Math.max(0,correction)):0;
 return result.map(p=>({...p,a:add(p.a,[0,lift,0]),b:add(p.b,[0,lift,0])}));
}
