import {headCameraPosition} from '../core/dist/rig/head-frame.js';
import {PolygonNavigation} from '../core/dist/arena/polygon-navigation.js';
import {CAMERA_CLEARANCE,CAMERA_HEIGHT,cornerMounts} from './arena-camera-layout.js';

const DEG=Math.PI/180;
const LIMIT=155;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));
export const HEAD_ANGLES=Object.freeze([90,105,120]);
export const headVerticalFov=(angle,aspect)=>2*Math.atan(Math.tan(angle*DEG/2)/aspect)/DEG;
const cornerModes=['corner-1','corner-2','corner-3','corner-4'];
const damping=(dt,seconds)=>1-Math.exp(-clamp(dt,0,.1)/seconds);

/** Spectator views read snapshots and never drive the simulation. */
export class LabCamera {
 constructor(T,camera,mode,patient){
  this.camera=camera;this.modeInput=mode;this.patientInput=patient;
  this.up=new T.Vector3();this.forward=new T.Vector3();this.right=new T.Vector3();this.back=new T.Vector3();
  this.mount=new T.Vector3();this.previousMount=new T.Vector3();
  this.matrix=new T.Matrix4();this.q=new T.Quaternion();this.oldQ=new T.Quaternion();
  this.chasePivot=new T.Vector3();this.chaseTarget=new T.Vector3();this.chaseOffset=new T.Vector3();
  this.orbitYaw=0;this.orbitPitch=0;this.chaseOwner=null;
  this.worldUp=new T.Vector3(0,1,0);this.view=new T.Vector3();this.samples=[];
  this.headAngle=105;
  this.modeInput.onchange=()=>this.select(this.modeInput.value);
  this.select(cornerModes[0]);
 }
 get mounted(){return this.mode==='gopro'||this.mode==='third-person';}
 setArena(arena,fixtureRadii=[]){
  this.navigation=arena?new PolygonNavigation(arena):null;
  this.mounts=arena?cornerMounts(arena,this.navigation,fixtureRadii):null;
  this.select(this.mode);
 }
 allowFree(allowed){
  this.freeAllowed=allowed&&!!this.navigation;
  const option=this.modeInput.querySelector?.('option[value="free"]');
  if(option)option.disabled=!this.freeAllowed;
  if(!this.freeAllowed&&this.mode==='free')this.select(cornerModes[this.corner]);
 }
 select(mode){
  if(mode==='free'&&!this.freeAllowed)return false;
  if(cornerModes.includes(mode))this.corner=cornerModes.indexOf(mode);
  if(this.mode!==mode){
   this.chaseOwner=null;this.orbitYaw=0;this.orbitPitch=0;
  }
  this.mode=this.modeInput.value=mode;
  this.patientInput.disabled=!this.mounted;
  const mount=this.mounts?.[this.corner];
  const camera=this.camera;
  camera.up.copy(this.worldUp);
  if(!this.mounted){
   camera.position.set(mount?.x??5.8,mount?CAMERA_HEIGHT:3.6,mount?.z??6.6);
   this.homeYaw=Math.atan2(-camera.position.x,-camera.position.z);
   this.yaw=this.homeYaw;this.pitch=Math.atan2(1-camera.position.y,Math.hypot(camera.position.x,camera.position.z));
   this.aimAt(this.yaw,this.pitch);
  }
  this.framed=false;
  if(mode==='gopro')this.projectHead();
  else if(mode==='third-person')this.project(58,.035);
  else this.project(65,.05);
  return true;
 }
 reset(s){
  this.chaseOwner=null;
  const old=this.patientInput.value;this.patientInput.replaceChildren();
  for(const id of s.fighterIds){const option=document.createElement('option');option.value=String(id);option.textContent='№ '+id;this.patientInput.append(option);}
  if(Array.from(s.fighterIds).includes(Number(old)))this.patientInput.value=old;
  if(!this.patientInput.value&&s.fighterIds.length)this.patientInput.value=String(s.fighterIds[0]);
 }
 resize(aspect){
  this.camera.aspect=aspect;this.framed=false;this.camera.updateProjectionMatrix();
  if(this.mode==='gopro')this.projectHead();
 }
 setHeadAngle(angle){
  if(!HEAD_ANGLES.includes(angle))return;
  this.headAngle=angle;
  if(this.mode==='gopro')this.projectHead();
 }
 projectHead(){this.project(headVerticalFov(this.headAngle,this.camera.aspect),.015);}
 project(fov,near){
  const c=this.camera;
  if(c.fov===fov&&c.near===near)return;
  c.fov=fov;c.near=near;c.updateProjectionMatrix();
 }
 aimAt(yaw,pitch){
  const {position:p}=this.camera,flat=Math.cos(pitch);
  this.camera.lookAt(p.x+Math.sin(yaw)*flat,p.y+Math.sin(pitch),p.z+Math.cos(yaw)*flat);
 }
 look(dx,dy){
  if(this.mode==='third-person'){
   this.orbitYaw=wrap(this.orbitYaw-dx*.003);
   this.orbitPitch=clamp(this.orbitPitch-dy*.003,-.65,.62);
   return;
  }
  if(this.mode!=='free')return;
  this.yaw=wrap(this.yaw-dx*.003);
  this.pitch=clamp(this.pitch-dy*.003,-1.45,1.45);
  this.aimAt(this.yaw,this.pitch);
 }
 move(forward,strafe,dt){
  if(this.mode!=='free'||!this.freeAllowed||(!forward&&!strafe))return;
  const p=this.camera.position,step=3*clamp(dt,0,.05)/Math.max(1,Math.hypot(forward,strafe));
  const sin=Math.sin(this.yaw),cos=Math.cos(this.yaw);
  const next=this.navigation.move(p,{x:p.x+(forward*sin-strafe*cos)*step,z:p.z+(forward*cos+strafe*sin)*step},CAMERA_CLEARANCE);
  p.set(next.x,CAMERA_HEIGHT,next.z);
  this.aimAt(this.yaw,this.pitch);
 }
 track(parts,dt){
  const p=this.camera.position;
  let left=Infinity,right=-Infinity;
  const points=this.samples;points.length=0;
  for(const patient of parts)for(const segment of patient){
   for(let end=0;end<2;end++){
    const point=end===0?segment.a:segment.b;
    const x=point[0]-p.x,y=point[1]-p.y,z=point[2]-p.z;
    const bearing=wrap(Math.atan2(x,z)-this.homeYaw);
    const margin=Math.atan2(segment.radius,Math.hypot(x,y,z));
    left=Math.min(left,bearing-margin);right=Math.max(right,bearing+margin);
    points.push(x,y,z,segment.radius,margin);
   }
  }
  if(!points.length)return;
  const turn=this.framed?damping(dt,.34):1;
  const targetYaw=this.homeYaw+clamp((left+right)/2,-1.1,1.1);
  const sin=Math.sin(targetYaw),cos=Math.cos(targetYaw);
  let low=Infinity,high=-Infinity;
  for(let i=0;i<points.length;i+=5){
   const elevation=Math.atan2(points[i+1],points[i]*sin+points[i+2]*cos),margin=points[i+4];
   low=Math.min(low,elevation-margin);high=Math.max(high,elevation+margin);
  }
  this.yaw+=wrap(targetYaw-this.yaw)*turn;
  this.pitch+=(clamp((low+high)/2,-1.5,1.5)-this.pitch)*turn;
  this.aimAt(this.yaw,this.pitch);
  this.q.copy(this.camera.quaternion).invert();
  let tangent=0;
  for(let i=0;i<points.length;i+=5){
   const radius=points[i+3];
   const v=this.view.set(points[i],points[i+1],points[i+2]).applyQuaternion(this.q);
   const depth=Math.max(.04,-v.z-radius);
   tangent=Math.max(tangent,(Math.abs(v.y)+radius)/depth,(Math.abs(v.x)+radius)/(depth*this.camera.aspect));
  }
  const goal=clamp(2*Math.atan(tangent*1.12)/DEG,37,LIMIT);
  this.project(this.framed?this.camera.fov+(goal-this.camera.fov)*damping(dt,goal>this.camera.fov?.16:.56):goal,.05);
  this.framed=true;
 }
 orientation(h,out){
  this.forward.set(...h.forward).normalize();this.right.crossVectors(this.forward,this.worldUp);
  if(this.right.lengthSq()<1e-8)this.right.crossVectors(this.forward,this.up.set(...h.up));
  this.right.normalize();this.up.crossVectors(this.right,this.forward).normalize();this.back.copy(this.forward).negate();
  return out.setFromRotationMatrix(this.matrix.makeBasis(this.right,this.up,this.back));
 }
 chase(s,i,id,dt,manual){
  const h=s.headFrames?.[i],k=i*4;
  const rootYaw=s.roots[k+3],forward=h?.forward;
  const facing=manual&&forward?Math.atan2(forward[0],-forward[2]):rootYaw;
  const yaw=facing+this.orbitYaw;
  const pitch=clamp((manual&&forward?Math.asin(clamp(forward[1],-1,1)):0)+this.orbitPitch,-.65,.62);
  const immediate=this.chaseOwner!==id;
  const t=immediate?1:damping(dt,.11);
  const x=s.roots[k],y=s.roots[k+1],z=s.roots[k+2];
  this.view.set(x,Math.max(y+.30,(h?.center[1]??y+1.60)-.28),z);
  this.chasePivot.lerp(this.view,t);
  this.chaseYaw=immediate?yaw:this.chaseYaw+wrap(yaw-this.chaseYaw)*t;
  this.chasePitch=immediate?pitch:this.chasePitch+(pitch-this.chasePitch)*t;
  this.chaseOwner=id;
  const sin=Math.sin(this.chaseYaw),cos=Math.cos(this.chaseYaw),distance=3.15;
  const reach=Math.cos(this.chasePitch)*distance;
  this.chaseOffset.set(-sin*reach+.50*cos,.34-Math.sin(this.chasePitch)*distance,cos*reach+.50*sin);
  this.chaseOffset.y=Math.max(y+.26-this.chasePivot.y,this.chaseOffset.y);
  const p=this.chasePivot,nav=this.navigation;
  if(nav&&!nav.clear(this.view,p,.16)){p.x=this.view.x;p.z=this.view.z;}
  let available=1;
  if(nav&&!nav.clear(this.view,this.chaseTarget.copy(p).add(this.chaseOffset),.16)){
   let high=1;available=0;
   for(let step=0;step<8;step++){
    const fraction=(available+high)*.5;
    if(nav.clear(this.view,this.chaseTarget.copy(p).addScaledVector(this.chaseOffset,fraction),.16))available=fraction;
    else high=fraction;
   }
  }
  this.chaseFraction=immediate?available:Math.min(available,this.chaseFraction+(available-this.chaseFraction)*damping(dt,.24));
  this.camera.position.copy(p).addScaledVector(this.chaseOffset,this.chaseFraction);
  this.camera.up.copy(this.worldUp);
  this.camera.lookAt(this.chaseTarget.set(p.x+sin*3,p.y+Math.tan(this.chasePitch)*3,p.z-cos*3));
 }
 update(s,prior,alpha,meshes,dt=0,controlled=null){
  if(this.mode==='free')return;
  if(!this.mounted){
   this.track(s.rigSegments.filter((_,i)=>s.lifeStates[i]==='active'),dt);
   return;
  }
  const id=Number(this.patientInput.value),i=s.fighterIds.indexOf(id),j=prior.fighterIds.indexOf(id);
  if(i<0){this.select(cornerModes[this.corner]);return;}
  if(this.mode==='third-person'){
   this.chase(s,i,id,dt,controlled===id);
   return;
  }
  const h=i>=0?s.headFrames?.[i]:null,m=meshes.get(id+':head');
  if(!h||!m?.visible){this.select(cornerModes[this.corner]);return;}
  const old=j>=0?prior.headFrames?.[j]:null,parts=s.rigSegments[i],oldParts=j>=0?prior.rigSegments[j]:null;
  const compatible=old&&oldParts&&oldParts.length===parts.length&&s.lifeStates[i]===prior.lifeStates[j]&&parts.every(p=>oldParts.some(q=>q.id===p.id));
  this.orientation(h,this.q);
  if(compatible&&alpha<1){this.orientation(old,this.oldQ);this.q.slerp(this.oldQ,1-alpha);}
  this.up.copy(this.worldUp).applyQuaternion(this.q);
  this.mount.set(...headCameraPosition(h));
  if(compatible&&alpha<1)this.mount.lerp(this.previousMount.set(...headCameraPosition(old)),1-alpha);
  this.camera.position.copy(this.mount);
  this.camera.quaternion.copy(this.q);this.camera.up.copy(this.up);

 }
}
