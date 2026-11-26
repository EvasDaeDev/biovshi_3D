/** Presentation-only camera, independent of combat and input. */
export class LabCamera {
 constructor(T,camera,mode,patient,fov){
  this.camera=camera;this.modeInput=mode;this.patientInput=patient;this.fovInput=fov;this.circle=false;
  this.up=new T.Vector3();this.forward=new T.Vector3();this.right=new T.Vector3();this.back=new T.Vector3();
  this.mount=new T.Vector3();this.previousMount=new T.Vector3();
  this.matrix=new T.Matrix4();this.q=new T.Quaternion();this.oldQ=new T.Quaternion();this.worldUp=new T.Vector3(0,1,0);
  this.modeInput.onchange=()=>this.sync();this.sync();this.staticView();
 }
 sync(){this.mode=this.modeInput.value;this.patientInput.disabled=this.mode!=='head';this.fovInput.disabled=this.mode!=='head';}
 setArena(circle){this.circle=circle;this.staticView();}
 reset(s){
  const old=this.patientInput.value;this.patientInput.replaceChildren();
  for(const id of s.fighterIds){const o=document.createElement('option');o.value=String(id);o.textContent='№ '+id;this.patientInput.append(o);}
  if(Array.from(s.fighterIds).includes(Number(old)))this.patientInput.value=old;
  if(!this.patientInput.value&&s.fighterIds.length)this.patientInput.value=String(s.fighterIds[0]);this.sync();
 }
 resize(aspect){this.camera.aspect=aspect;this.projection(true);}
 projection(force=false){
  const c=this.camera,h=Number(this.fovInput.value)||90;
  const v=this.mode==='head'?2*Math.atan(Math.tan(h*Math.PI/360)/c.aspect)*180/Math.PI:65;
  const near=this.mode==='head'?.015:.05;
  if(force||c.fov!==v||c.near!==near){c.fov=v;c.near=near;c.updateProjectionMatrix();}
 }
 staticView(){
  const c=this.camera;c.up.copy(this.worldUp);
  c.position.set(...(this.mode==='overview'?(this.circle?[5,6.4,7.4]:[8,6,9]):(this.circle?[3.9,2.75,4.6]:[5.8,3.6,6.6])));
  c.lookAt(0,this.circle?.75:1,0);this.projection();
 }
 orientation(h,out){
  // A level horizon is independent of the neck's attack/impact roll.
  this.forward.set(...h.forward).normalize();this.right.crossVectors(this.forward,this.worldUp);
  if(this.right.lengthSq()<1e-8)this.right.crossVectors(this.forward,this.up.set(...h.up));
  this.right.normalize();this.up.crossVectors(this.right,this.forward).normalize();this.back.copy(this.forward).negate();
  return out.setFromRotationMatrix(this.matrix.makeBasis(this.right,this.up,this.back));
 }
 update(s,prior,alpha,meshes,clearance){
  this.sync();if(this.mode!=='head'){this.staticView();return;}
  const id=Number(this.patientInput.value),i=s.fighterIds.indexOf(id),j=prior.fighterIds.indexOf(id);
  const h=i>=0?s.headFrames?.[i]:null,m=meshes.get(id+':head');
  if(!h||!m?.visible){this.modeInput.value='overview';this.sync();this.staticView();return;}
  const old=j>=0?prior.headFrames?.[j]:null,parts=s.rigSegments[i],oldParts=j>=0?prior.rigSegments[j]:null;
  const compatible=old&&oldParts&&oldParts.length===parts.length&&s.lifeStates[i]===prior.lifeStates[j]&&parts.every(p=>oldParts.some(q=>q.id===p.id));
  this.orientation(h,this.q);
  if(compatible&&alpha<1){this.orientation(old,this.oldQ);this.q.slerp(this.oldQ,1-alpha);}
  this.up.copy(this.worldUp).applyQuaternion(this.q);
  // Interpolate the virtual mount only across continuous anatomy. On a
  // head strike it follows the unstruck rig, not the lunge of the skull.
  this.mount.set(...(h.cameraCenter??h.center));
  if(compatible&&alpha<1)this.mount.lerp(this.previousMount.set(...(old.cameraCenter??old.center)),1-alpha);
  this.camera.position.copy(this.mount).addScaledVector(this.up,h.radius+clearance);
  this.camera.quaternion.copy(this.q);this.camera.up.copy(this.up);this.projection();
 }
}
