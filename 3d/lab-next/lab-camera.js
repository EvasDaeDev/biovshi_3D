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
  this.worldUp=new T.Vector3(0,1,0);this.view=new T.Vector3();this.samples=[];
  this.headAngle=105;
  this.modeInput.onchange=()=>this.select(this.modeInput.value);
  this.select(cornerModes[0]);
 }
 get mounted(){return this.mode==='gopro'||this.mode==='gopro-chest';}
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
  if(this.mounted)this.projectHead();
  else this.project(65,.05);
  return true;
 }
 reset(s){
  const old=this.patientInput.value;this.patientInput.replaceChildren();
  for(const id of s.fighterIds){const option=document.createElement('option');option.value=String(id);option.textContent='№ '+id;this.patientInput.append(option);}
  if(Array.from(s.fighterIds).includes(Number(old)))this.patientInput.value=old;
  if(!this.patientInput.value&&s.fighterIds.length)this.patientInput.value=String(s.fighterIds[0]);
 }
 resize(aspect){
  this.camera.aspect=aspect;this.framed=false;this.camera.updateProjectionMatrix();
  if(this.mounted)this.projectHead();
 }
 setHeadAngle(angle){
  if(!HEAD_ANGLES.includes(angle))return;
  this.headAngle=angle;
  if(this.mounted)this.projectHead();
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
 update(s,prior,alpha,meshes,clearance,dt=0){
  if(this.mode==='free')return;
  if(!this.mounted){
   this.track(s.rigSegments.filter((_,i)=>s.lifeStates[i]==='active'),dt);
   return;
  }
  const id=Number(this.patientInput.value),i=s.fighterIds.indexOf(id),j=prior.fighterIds.indexOf(id);
  if(this.mode==='gopro-chest'){
   const chest=i>=0?s.rigSegments[i].find(part=>part.id==='chest'):null;
   const mesh=meshes.get(id+':chest');
   if(!chest||!mesh?.visible){this.select(cornerModes[this.corner]);return;}
   // The chest segment uses local Y across the shoulders and X toward
   // the neck. Put the lens high on the sternum, ahead of the chest mesh.
   this.up.set(1,0,0).applyQuaternion(mesh.quaternion);
   this.forward.set(0,0,1).applyQuaternion(mesh.quaternion);
   this.camera.position.copy(mesh.position).addScaledVector(this.up,.105)
    .addScaledVector(this.forward,chest.radius+.085);
   this.camera.up.copy(this.up);
   this.camera.lookAt(this.mount.copy(this.camera.position).add(this.forward));
   return;
  }
  const h=i>=0?s.headFrames?.[i]:null,m=meshes.get(id+':head');
  if(!h||!m?.visible){this.select(cornerModes[this.corner]);return;}
  const old=j>=0?prior.headFrames?.[j]:null,parts=s.rigSegments[i],oldParts=j>=0?prior.rigSegments[j]:null;
  const compatible=old&&oldParts&&oldParts.length===parts.length&&s.lifeStates[i]===prior.lifeStates[j]&&parts.every(p=>oldParts.some(q=>q.id===p.id));
  this.orientation(h,this.q);
  if(compatible&&alpha<1){this.orientation(old,this.oldQ);this.q.slerp(this.oldQ,1-alpha);}
  this.up.copy(this.worldUp).applyQuaternion(this.q);
  this.mount.set(...(h.cameraCenter??h.center));
  if(compatible&&alpha<1)this.mount.lerp(this.previousMount.set(...(old.cameraCenter??old.center)),1-alpha);
  this.camera.position.copy(this.mount).addScaledVector(this.up,h.radius+clearance);
  this.camera.quaternion.copy(this.q);this.camera.up.copy(this.up);

 }
}
