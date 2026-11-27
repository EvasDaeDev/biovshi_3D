import {CameraEffects,EFFECT_DEFAULTS,readCameraEffects,saveCameraEffects} from './camera-effects.js';
import {useSharedAnatomy} from '../core/dist/rig/shared-anatomy.js';
import {poseJointAnchor} from '../core/dist/rig/pose-joints.js';
import {createSegmentVisual} from './segment-visual.js';
import {POSE_DRAFT_KEY,readPoseDraft} from './pose-draft.js';
import {anatomicalBoneFrame} from '../core/dist/rig/bone-frame.js';
import {solveTwoBone} from '../core/dist/rig/two-bone.js';
import {TransformControls} from './vendor/TransformControls.js';
import * as THREE from 'three';
import {LAB_SEGMENTS} from '../core/dist/rig/anatomy.js';
import {buildEditedPose,POSE_SLOTS,readPoseDocument,referencePose} from '../core/dist/rig/pose-editor.js';

const element=id=>document.getElementById(id);
const poseSelect=element('pose'),segmentSelect=element('segment'),status=element('status');
const enabled=element('enabled'),lengthInput=element('length'),radius=element('radius');
const workspace=element('viewport');
const colliderRadius=element('collider-radius'),colliderLength=element('collider-length');
const showGeometry=element('show-geometry'),showBones=element('show-bones'),showColliders=element('show-colliders');
const labels={pelvis:'Таз',abdomen:'Живот',chest:'Грудная клетка',neck:'Шея',head:'Голова',
 upperLeg:'бедро',lowerLeg:'голень',foot:'стопа',upperArm:'плечо',lowerArm:'предплечье',hand:'кисть'};
for(const [id,name] of Object.entries(POSE_SLOTS))poseSelect.add(new Option(name,id));
for(const {id} of LAB_SEGMENTS){
 const [side,part]=id.split('.');
 segmentSelect.add(new Option(part?(side==='L'?'Л / ':'П / ')+labels[part]:labels[id],id));
}
segmentSelect.value='L.upperArm';
let data={schemaVersion:1,pivotVersion:2,stature:1.65,slots:{}};
try{
 data=readPoseDraft(localStorage)??data;
 status.textContent='Правки сохраняются в этом браузере.';
}catch(error){status.textContent='Исходная поза загружена. Черновик недоступен.';}
async function loadDefaults(){
 const response=await fetch(new URL('./patient-poses.json',import.meta.url));
 if(!response.ok)throw new Error('Не удалось загрузить исходные позы.');
 const slots=readPoseDocument(await response.json()).slots;
 if(Object.keys(POSE_SLOTS).some(slot=>slot!=='tPose'&&!slots[slot]))
  throw new Error('Неполный набор исходных поз.');
 return {...slots,tPose:slots.tPose??referencePose('tPose')};
}
const defaults=await loadDefaults().catch(error=>{
 status.textContent=error.message;
 throw error;
});
const source=()=>data.slots[poseSelect.value]??defaults[poseSelect.value];
const current=()=>useSharedAnatomy(source(),data.slots.tPose??defaults.tPose);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x101715);
scene.add(new THREE.HemisphereLight(0xd7f4df,0x334d53,2.8));
const light=new THREE.DirectionalLight(0xffffff,2.6);light.position.set(-3,5,2);scene.add(light);
scene.add(new THREE.GridHelper(7,28,0x55776b,0x283b35));
const perspective=new THREE.PerspectiveCamera(39,1,.03,60),orthographic=new THREE.OrthographicCamera(-1,1,1,-1,.03,60),target=new THREE.Vector3(0,.825,0);
let camera=perspective,flatView=false;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));workspace.append(renderer.domElement);
const effects=readCameraEffects(),effectsProfile=element('effects-profile');
let previewEffects=false,cameraEffects;
const actor=new THREE.Group();scene.add(actor);
const colliderMaterial=new THREE.LineBasicMaterial({color:0x63d6ef,transparent:true,opacity:.38,depthTest:false});
const selectedCollider=new THREE.LineBasicMaterial({color:0x79edff,transparent:true,opacity:.94,depthTest:false});
const bones=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffbc72,depthTest:false}));
const bonePoints=new Float32Array((LAB_SEGMENTS.length-1)*6);
bones.geometry.setAttribute('position',new THREE.BufferAttribute(bonePoints,3));
bones.frustumCulled=false;bones.renderOrder=3;scene.add(bones);
const outlines=[];
const primary=new THREE.MeshStandardMaterial({color:0xb1c6bd,roughness:.55});
const selected=new THREE.MeshStandardMaterial({color:0xb5eda0,roughness:.6,emissive:0x193211});
const basis=new THREE.Matrix4();
const raycaster=new THREE.Raycaster();
raycaster.params.Line.threshold=.018;
let azimuth=.95,elevation=.15,distance=4.6;
function draw(){
 camera=flatView?orthographic:perspective;
 controls.camera=camera;
 const aspect=workspace.clientWidth/Math.max(workspace.clientHeight,1)||1;
 if(flatView){
  const half=Math.max(1,1.02/aspect)*distance/4.6;
  Object.assign(orthographic,{top:half,bottom:-half,left:-half*aspect,right:half*aspect});
 }else perspective.aspect=aspect;
 camera.updateProjectionMatrix();
 camera.position.set(
  target.x+distance*Math.cos(elevation)*Math.sin(azimuth),
  target.y+distance*Math.sin(elevation),
  target.z+distance*Math.cos(elevation)*Math.cos(azimuth),
 );
 camera.lookAt(target);
 bones.visible=showBones.checked;
 if(bones.visible){
  let vertex=0;
  for(const node of nodes.values()){
   if(!node.parent.userData.id)continue;
   bonePoints.set(worldPosition(node.parent).toArray(),vertex++*3);
   bonePoints.set(worldPosition(node).toArray(),vertex++*3);
  }
  bones.geometry.attributes.position.needsUpdate=true;
  bones.geometry.setDrawRange(0,vertex);
 }
 if(previewEffects&&effects.enabled)
  (cameraEffects??=new CameraEffects(THREE,renderer)).draw(scene,camera,effects[effectsProfile.value],0,effectsProfile.value);
 else renderer.render(scene,camera);
}
const controls=new TransformControls(camera,renderer.domElement),pickable=[],nodes=new Map();
const ikTarget=new THREE.Object3D();scene.add(ikTarget);
let mode='translate',chain=null,dragPose=null;
const worldPosition=node=>node.getWorldPosition(new THREE.Vector3());
function place(node,position){
 node.position.copy(node.parent.worldToLocal(position.clone()));
 node.updateWorldMatrix(true,true);
}
function orient(node,startDirection,startRotation,newDirection){
 const swing=new THREE.Quaternion().setFromUnitVectors(startDirection,newDirection.normalize());
 const worldRotation=swing.multiply(startRotation);
 node.quaternion.copy(node.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldRotation));
 node.updateWorldMatrix(true,true);
}
function attachControl(){
 chain=null;
 const id=segmentSelect.value,node=nodes.get(id);
 if(mode!=='ik'){if(node)controls.attach(node);return;}
 if(!node||!/[.](hand|foot)$/.test(id))return;
 const lower=node.parent,upper=lower.parent;
 const upperEnd=upper.localToWorld(upper.userData.tip.clone());
 const lowerEnd=lower.localToWorld(lower.userData.tip.clone());
 chain={upper,lower,tip:node,upperEnd,lowerEnd};
 ikTarget.position.copy(worldPosition(node));controls.attach(ikTarget);
}
controls.addEventListener('mouseDown',()=>{
 if(!chain)return;
 const {upper,lower,tip,upperEnd,lowerEnd}=chain;
 const origin=worldPosition(upper),joint=worldPosition(lower);
 dragPose={
  origin,pole:joint.clone().sub(origin),
  upperDirection:upperEnd.clone().sub(origin).normalize(),
  lowerDirection:lowerEnd.clone().sub(joint).normalize(),
  upperRotation:upper.getWorldQuaternion(new THREE.Quaternion()),
  lowerRotation:lower.getWorldQuaternion(new THREE.Quaternion()),
  tipRotation:tip.getWorldQuaternion(new THREE.Quaternion()),
  tipOffset:worldPosition(tip).sub(lowerEnd),
 };
});
controls.addEventListener('objectChange',()=>{
 if(!chain||!dragPose)return;
 const {upper,lower,tip}=chain,d=dragPose;
 const goal=ikTarget.position.clone().sub(d.tipOffset);
 const result=solveTwoBone(d.origin.toArray(),goal.toArray(),upper.userData.length,lower.userData.length,d.pole.toArray());
 const joint=new THREE.Vector3(...result.joint),end=new THREE.Vector3(...result.end);
 orient(upper,d.upperDirection,d.upperRotation,joint.clone().sub(d.origin));
 place(lower,joint);
 orient(lower,d.lowerDirection,d.lowerRotation,end.clone().sub(joint));
 place(tip,end.add(d.tipOffset));
 tip.quaternion.copy(lower.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(d.tipRotation));
 draw();
});
controls.setSize(.72);scene.add(controls.getHelper());
controls.addEventListener('change',draw);
controls.addEventListener('mouseUp',()=>{
 const affected=chain?[chain.upper,chain.lower,chain.tip]:[controls.object];
 const patches=new Map(affected.map(node=>{
  const offset=node.position.clone().sub(node.userData.origin).toArray();
  const {x,y,z}=node.rotation;
  return [node.userData.id,{offset,rotation:[x,y,z]}];
 }));
 dragPose=null;
 queueMicrotask(()=>editParts(parts=>parts.map(p=>({...p,...patches.get(p.id)}))));
});
for(const id of ['translate','rotate','ik'])element(id).onclick=()=>{
 mode=id;controls.detach();controls.setMode(id==='ik'?'translate':id);attachControl();
 for(const button of ['translate','rotate','ik'])element(button).setAttribute('aria-pressed',String(button===id));
 if(id==='ik')status.textContent='Выберите кисть или стопу и потяните стрелку.';
 draw();
};
function renderPose(){
 controls.detach();
 for(const outline of outlines)outline.geometry.dispose();
 outlines.length=0;
 actor.clear();pickable.length=0;
 const parts=current(),settings=new Map(parts.map(p=>[p.id,p]));
 nodes.clear();
 const anchors=new Map();
 const pose=buildEditedPose(parts),byId=new Map(pose.map(part=>[part.id,part]));
 for(const part of pose){
  const a=new THREE.Vector3(...part.a),b=new THREE.Vector3(...part.b),axis=b.clone().sub(a);
  const anchor=new THREE.Vector3(...poseJointAnchor(part,byId));
  const parent=LAB_SEGMENTS.find(def=>def.id===part.id).parent;
  const joint=new THREE.Group(),params=settings.get(part.id);
  joint.position.copy(anchor);
  if(parent)joint.position.sub(anchors.get(parent)).add(nodes.get(parent).userData.bind);
  const bind=new THREE.Vector3(...(params.bindOffset??[0,0,0]));
  joint.userData.bind=bind;
  joint.userData.origin=joint.position.clone();
  joint.userData.id=part.id;
  joint.userData.tip=b.clone().sub(anchor).add(bind);
  joint.userData.length=axis.length();
  joint.position.add(new THREE.Vector3(...(params.offset??[0,0,0])));
  joint.rotation.set(...(params.rotation??[0,0,0]));
  (nodes.get(parent)??actor).add(joint);nodes.set(part.id,joint);anchors.set(part.id,anchor);
  const frame=anatomicalBoneFrame(part,pose,0);
  const visual=createSegmentVisual(part.id,part.radius,frame.length,part.id===segmentSelect.value?selected:primary);
  visual.position.copy(a).lerp(b,.5).sub(anchor).add(bind);
  const vector=values=>new THREE.Vector3(...values);
  visual.quaternion.setFromRotationMatrix(basis.makeBasis(vector(frame.x),vector(frame.y),vector(frame.z)));
  visual.visible=showGeometry.checked;
  joint.add(visual);pickable.push(...visual.children);
  const dimensions=params.collider;
  const r=dimensions?.radius??part.radius,l=dimensions?.length??frame.length;
  const shape=l>0?new THREE.CapsuleGeometry(r,l,5,12):new THREE.SphereGeometry(r,12,10);
  const outline=new THREE.LineSegments(new THREE.WireframeGeometry(shape),part.id===segmentSelect.value?selectedCollider:colliderMaterial);
  shape.dispose();outline.position.copy(visual.position);outline.quaternion.copy(visual.quaternion);
  outline.visible=showColliders.checked;outline.renderOrder=part.id===segmentSelect.value?2:1;
  outline.userData.segment=part.id;joint.add(outline);outlines.push(outline);
  pickable.push(outline);
 }
 actor.updateMatrixWorld(true);attachControl();
 workspace.dataset.segments=String(nodes.size);
 draw();
}
function refresh(){
 const part=current().find(p=>p.id===segmentSelect.value);
 const {protected:mandatory,nominalLength}=LAB_SEGMENTS.find(p=>p.id===part.id);
 enabled.checked=part.enabled;enabled.disabled=mandatory;
 const anatomyView=poseSelect.value==='tPose';
 lengthInput.value=part.length;lengthInput.disabled=!anatomyView||nominalLength===0;
 radius.value=part.radius;radius.disabled=!anatomyView;
 const r=part.collider?.radius??part.radius,l=part.collider?.length??part.length;
 colliderRadius.value=Number(r.toFixed(4));colliderLength.value=Number(l.toFixed(4));
 colliderRadius.disabled=!anatomyView;
 colliderLength.disabled=!anatomyView||nominalLength===0;
 element('reset-collider').disabled=!anatomyView||!part.collider;
 element('anatomy-hint').hidden=anatomyView;
 element('collider-span').value=(l+2*r).toLocaleString('ru-RU',{maximumFractionDigits:3})+' м';
 for(const {field,index,input} of coordinates){
  input.value=String(Number(part[field][index].toFixed(4)));
  input.disabled=part.id==='abdomen'||part.id==='neck'||(field==='b'&&nominalLength===0);
 }
 element('coord-hint').textContent=part.id==='abdomen'?'Ось живота задают таз и грудная клетка.':
  part.id==='neck'?'Ось шеи задают грудная клетка и голова.':
  'Координаты в метрах. Направление задаёт ось капсулы, соединения восстанавливаются по скелету.';
 renderPose();
}
function save(message){
 try{localStorage.setItem(POSE_DRAFT_KEY,JSON.stringify(data));status.textContent=message;}
 catch(error){status.textContent='Черновик недоступен. Экспортируйте JSON, чтобы сохранить правки.';}
}
function edit(patch){
 editParts(parts=>parts.map(p=>p.id===segmentSelect.value?{...p,...patch}:p));
}
function editParts(update){
 const slot=poseSelect.value;
 try{
  const parts=update(source());
  data=readPoseDocument({...data,slots:{...data.slots,[slot]:parts}});
  save('Черновик сохранён. Правки применятся при новом раунде или перезапуске стенда.');
 }catch(error){status.textContent=error.message;}
 refresh();
}
const coordinates=[];
for(const field of ['a','b']){
 const group=document.createElement('div');group.className='coord';
 for(const [index,axis] of ['X','Y','Z'].entries()){
  const label=document.createElement('label');label.textContent=field.toUpperCase()+' '+axis;
  const input=document.createElement('input');input.type='number';input.min=-8;input.max=8;input.step=.01;
  label.append(input);group.append(label);coordinates.push({field,index,input});
  input.onchange=()=>{
   const part=current().find(p=>p.id===segmentSelect.value),point=[...part[field]];
   point[index]=input.valueAsNumber;edit({[field]:point});
  };
 }
 element('coords').append(group);
}
poseSelect.onchange=()=>{
 status.textContent=data.slots[poseSelect.value]?'Поза из черновика.':'Загружена исходная поза.';
 refresh();
};
segmentSelect.onchange=refresh;
enabled.onchange=()=>edit({enabled:enabled.checked});
lengthInput.onchange=()=>edit({length:lengthInput.valueAsNumber});
radius.onchange=()=>edit({radius:radius.valueAsNumber});
const editCollider=(name,value)=>{
 const part=current().find(p=>p.id===segmentSelect.value);
 edit({collider:{...part.collider,[name]:value}});
};
colliderRadius.onchange=()=>editCollider('radius',colliderRadius.valueAsNumber);
colliderLength.onchange=()=>editCollider('length',colliderLength.valueAsNumber);
element('reset-collider').onclick=()=>edit({collider:undefined});
for(const layer of [showBones,showGeometry,showColliders])layer.onchange=renderPose;
element('reset-pose').onclick=()=>{
 const {slots}=data;delete slots[poseSelect.value];
 save('Выбранная поза сброшена.');refresh();
};
element('export').onclick=()=>{
 const slots={...data.slots,[poseSelect.value]:current()};
 const url=URL.createObjectURL(new Blob([JSON.stringify({...data,slots},null,2)+'\n'],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='eccepry-poses.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};
element('import').onchange=async event=>{
 const input=event.target,file=input.files[0];if(!file)return;
 try{
  if(file.size>1_000_000)throw new RangeError('Файл редактора превышает 1 МБ.');
  const imported=readPoseDocument(JSON.parse(await file.text()));
  data={...data,slots:{...data.slots,...imported.slots}};
  const first=Object.keys(imported.slots)[0];if(first)poseSelect.value=first;
  save('Позы импортированы.');refresh();
 }catch(error){status.textContent=error.message;}
 finally{input.value='';}
};
const views=[...document.querySelectorAll('[data-view]')];
for(const button of views)button.onclick=()=>{
 const angle=button.dataset.view;flatView=angle!=='perspective';
 azimuth={front:Math.PI,side:Math.PI/2,perspective:.95}[angle];elevation=angle==='perspective'?.15:0;
 for(const item of views)item.setAttribute('aria-pressed',String(item===button));
 draw();
};
let pointer=null;
workspace.onpointerdown=e=>{
 if(e.button!==0||pointer||controls.dragging)return;
 pointer={id:e.pointerId,x:e.clientX,y:e.clientY,travel:0};
 workspace.setPointerCapture(e.pointerId);
};
workspace.onpointermove=e=>{
 if(pointer?.id!==e.pointerId)return;
 const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
 pointer.travel+=Math.hypot(dx,dy);pointer.x=e.clientX;pointer.y=e.clientY;
 if(pointer.travel<4)return;
 flatView=false;azimuth-=dx*.008;elevation=Math.max(-1.3,Math.min(1.3,elevation+dy*.008));
 for(const button of views)button.setAttribute('aria-pressed','false');
 draw();
};
workspace.onpointerup=e=>{
 if(pointer?.id!==e.pointerId)return;
 if(pointer.travel<4){
  const rect=workspace.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
  const [hit]=raycaster.intersectObjects(pickable.filter(item=>item.visible&&item.parent.visible),false);
  if(hit){segmentSelect.value=hit.object.userData.segment;refresh();}
 }
 pointer=null;
};
workspace.onpointercancel=()=>{pointer=null;};
workspace.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(1.5,Math.min(10,distance*Math.exp(e.deltaY*.001)));draw();},{passive:false});
const anatomyTab=element('tab-anatomy'),effectsTab=element('tab-effects'),effectsEnabled=element('effects-enabled');
const sliders=Object.keys(EFFECT_DEFAULTS.corner).map(name=>({name,input:element('effect-'+name),value:element(name+'-value')}));
const showEffectValues=()=>{
 effectsEnabled.checked=effects.enabled;
 for(const {name,input,value} of sliders){
  input.value=effects[effectsProfile.value][name]*100;
  value.value=Number(input.value).toLocaleString('ru-RU')+'%';
 }
};
const applyEffects=()=>{
 element('effects-status').textContent=saveCameraEffects(effects)?'Настройки сохранены.':'Настройки действуют до закрытия страницы.';
 showEffectValues();
 draw();
};
const selectTab=tab=>{
 previewEffects=tab===effectsTab;
 for(const item of [anatomyTab,effectsTab]){
  item.setAttribute('aria-selected',String(item===tab));
  item.tabIndex=item===tab?0:-1;
  element(item.getAttribute('aria-controls')).hidden=item!==tab;
 }
 draw();
};
for(const tab of [anatomyTab,effectsTab]){
 tab.onclick=()=>selectTab(tab);
 tab.onkeydown=event=>{
  const next=event.key==='Home'?anatomyTab:event.key==='End'?effectsTab:
   ['ArrowLeft','ArrowRight'].includes(event.key)?(tab===anatomyTab?effectsTab:anatomyTab):null;
  if(next){event.preventDefault();selectTab(next);next.focus();}
 };
}
effectsProfile.onchange=()=>{showEffectValues();draw();};
effectsEnabled.onchange=()=>{effects.enabled=effectsEnabled.checked;applyEffects();};
for(const {name,input} of sliders)input.oninput=()=>{
 effects[effectsProfile.value][name]=Number(input.value)/100;
 applyEffects();
};
element('reset-effects').onclick=()=>{
 effects[effectsProfile.value]={...EFFECT_DEFAULTS[effectsProfile.value]};
 applyEffects();
};
showEffectValues();
if(new URLSearchParams(location.search).get('pose')==='tPose'){poseSelect.value='tPose';views.find(view=>view.dataset.view==='front').click();}
new ResizeObserver(()=>{
 renderer.setSize(workspace.clientWidth,workspace.clientHeight,false);draw();
}).observe(workspace);
refresh();
