import {TransformControls} from './vendor/TransformControls.js';
import * as THREE from 'three';
import {LAB_SEGMENTS} from '../core/dist/rig/anatomy.js';
import {buildEditedPose,POSE_SLOTS,readPoseDocument,referencePose} from '../core/dist/rig/pose-editor.js';

const element=id=>document.getElementById(id);
const poseSelect=element('pose'),segmentSelect=element('segment'),status=element('status');
const enabled=element('enabled'),lengthInput=element('length'),radius=element('radius');
const workspace=element('viewport'),storageKey='eccepry:pose-editor:v1';
const labels={pelvis:'Таз',abdomen:'Живот',chest:'Грудная клетка',neck:'Шея',head:'Голова',
 upperLeg:'бедро',lowerLeg:'голень',foot:'стопа',upperArm:'плечо',lowerArm:'предплечье',hand:'кисть'};
for(const [id,name] of Object.entries(POSE_SLOTS))poseSelect.add(new Option(name,id));
for(const {id} of LAB_SEGMENTS){
 const [side,part]=id.split('.');
 segmentSelect.add(new Option(part?(side==='L'?'Л / ':'П / ')+labels[part]:labels[id],id));
}
segmentSelect.value='L.upperArm';
let data={schemaVersion:1,slots:{}};
try{
 const saved=localStorage.getItem(storageKey);
 if(saved)data=readPoseDocument(JSON.parse(saved));
 status.textContent='Правки сохраняются в этом браузере.';
}catch(error){status.textContent='Исходная поза загружена. Черновик недоступен.';}
const current=()=>data.slots[poseSelect.value]??referencePose(poseSelect.value);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x101715);
scene.add(new THREE.HemisphereLight(0xd7f4df,0x334d53,2.8));
const light=new THREE.DirectionalLight(0xffffff,2.6);light.position.set(-3,5,2);scene.add(light);
scene.add(new THREE.GridHelper(7,28,0x55776b,0x283b35));
const camera=new THREE.PerspectiveCamera(39,1,.03,60),target=new THREE.Vector3(0,1.05,0);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));workspace.append(renderer.domElement);
const actor=new THREE.Group();scene.add(actor);
const primary=new THREE.MeshStandardMaterial({color:0xb1c6bd,roughness:.55});
const selected=new THREE.MeshStandardMaterial({color:0xb5eda0,roughness:.6,emissive:0x193211});
const up=new THREE.Vector3(0,1,0);
const raycaster=new THREE.Raycaster();
let azimuth=.95,elevation=.15,distance=4.6;
function draw(){
 camera.position.set(
  target.x+distance*Math.cos(elevation)*Math.sin(azimuth),
  target.y+distance*Math.sin(elevation),
  target.z+distance*Math.cos(elevation)*Math.cos(azimuth),
 );
 camera.lookAt(target);renderer.render(scene,camera);
}
const controls=new TransformControls(camera,renderer.domElement),pickable=[];
controls.setSize(.72);scene.add(controls.getHelper());
controls.addEventListener('change',draw);
controls.addEventListener('mouseUp',()=>{
 const node=controls.object;
 const offset=node.position.clone().sub(node.userData.origin).toArray();
 const {x,y,z}=node.rotation;
 queueMicrotask(()=>edit({offset,rotation:[x,y,z]}));
});
for(const mode of ['translate','rotate'])element(mode).onclick=()=>{
 controls.setMode(mode);
 for(const id of ['translate','rotate'])element(id).setAttribute('aria-pressed',String(id===mode));
 draw();
};
function renderPose(){
 controls.detach();
 actor.traverse(obj=>obj.geometry?.dispose());actor.clear();pickable.length=0;
 const parts=current(),settings=new Map(parts.map(p=>[p.id,p]));
 const nodes=new Map(),anchors=new Map();
 for(const part of buildEditedPose(parts)){
  const a=new THREE.Vector3(...part.a),b=new THREE.Vector3(...part.b),axis=b.clone().sub(a);
  const anchor=['pelvis','chest'].includes(part.id)?a.clone().lerp(b,.5):a.clone();
  const parent=LAB_SEGMENTS.find(def=>def.id===part.id).parent;
  const joint=new THREE.Group(),params=settings.get(part.id);
  joint.position.copy(anchor);
  if(parent)joint.position.sub(anchors.get(parent));
  joint.userData.origin=joint.position.clone();
  joint.position.add(new THREE.Vector3(...(params.offset??[0,0,0])));
  joint.rotation.set(...(params.rotation??[0,0,0]));
  (nodes.get(parent)??actor).add(joint);nodes.set(part.id,joint);anchors.set(part.id,anchor);
  const geometry=axis.lengthSq()>1e-12?new THREE.CapsuleGeometry(part.radius,axis.length(),6,12):new THREE.SphereGeometry(part.radius,18,12);
  const mesh=new THREE.Mesh(geometry,part.id===segmentSelect.value?selected:primary);
  mesh.userData.segment=part.id;mesh.position.copy(a).lerp(b,.5).sub(anchor);
  if(axis.lengthSq()>1e-12)mesh.quaternion.setFromUnitVectors(up,axis.normalize());
  joint.add(mesh);pickable.push(mesh);
 }
 const node=nodes.get(segmentSelect.value);if(node)controls.attach(node);
 workspace.dataset.segments=String(pickable.length);
 draw();
}
function refresh(){
 const part=current().find(p=>p.id===segmentSelect.value);
 const {protected:mandatory,nominalLength}=LAB_SEGMENTS.find(p=>p.id===part.id);
 enabled.checked=part.enabled;enabled.disabled=mandatory;
 lengthInput.value=part.length;lengthInput.disabled=nominalLength===0;
 radius.value=part.radius;
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
 try{localStorage.setItem(storageKey,JSON.stringify(data));status.textContent=message;}
 catch(error){status.textContent='Черновик недоступен. Экспортируйте JSON, чтобы сохранить правки.';}
}
function edit(patch){
 const slot=poseSelect.value;
 try{
  const parts=current().map(p=>p.id===segmentSelect.value?{...p,...patch}:p);
  data=readPoseDocument({...data,slots:{...data.slots,[slot]:parts}});
  save('Черновик сохранён.');
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
 const angle=button.dataset.view;
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
 azimuth-=dx*.008;elevation=Math.max(-1.3,Math.min(1.3,elevation+dy*.008));
 for(const button of views)button.setAttribute('aria-pressed','false');
 draw();
};
workspace.onpointerup=e=>{
 if(pointer?.id!==e.pointerId)return;
 if(pointer.travel<4){
  const rect=workspace.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
  const [hit]=raycaster.intersectObjects(pickable,false);
  if(hit){segmentSelect.value=hit.object.userData.segment;refresh();}
 }
 pointer=null;
};
workspace.onpointercancel=()=>{pointer=null;};
workspace.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(1.5,Math.min(10,distance*Math.exp(e.deltaY*.001)));draw();},{passive:false});
new ResizeObserver(()=>{
 camera.aspect=workspace.clientWidth/workspace.clientHeight;camera.updateProjectionMatrix();
 renderer.setSize(workspace.clientWidth,workspace.clientHeight,false);draw();
}).observe(workspace);
refresh();
