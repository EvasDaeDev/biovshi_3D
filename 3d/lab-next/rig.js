import {createSegmentVisual} from './segment-visual.js';
import {VISION} from '../core/dist/combat/perception.js';
import {PATIENT_SCALE} from '../core/dist/rig/patient-scale.js';
import {advanceCombatStep} from './combat-step.js';
import {SegmentTints} from './segment-tints.js';
import {HitParticles} from './hit-particles.js';
import {PatientHud} from './patient-hud.js';
import {manualInput,capturesTextInput} from './manual-control.js';
import {Playback} from './playback.js';
import {reviewInput,measureMotion} from './motion-review.js';
import {OilMarks} from './oil.js';
import {loadFloorHistory,saveFloorHistory,clearFloorHistory} from './floor-storage.js';
import RAPIER from '@rapier';
import {DebrisWorld} from './debris.js';
import * as THREE from 'three';
import {LabSimulationCore,createLabConfig,createAuthoredCombatConfig,FixedClock,lowHill} from '../core/dist/index.js';
import {boneFrame,anatomicalBoneFrame} from '../core/dist/rig/bone-frame.js';
import {HEAD_CAMERA_CLEARANCE} from '../core/dist/rig/head-frame.js';
import {LabCamera} from './lab-camera.js';
window.labStartup.show('Инициализация Rapier / WASM…');
await RAPIER.init();
window.labStartup.show('Импорт авторских 3D арен…');
const catalogResponse=await fetch(new URL('./location-catalog.json',import.meta.url));
if(!catalogResponse.ok)throw Error('Каталог локаций: HTTP '+catalogResponse.status);
const authoredLocations=await catalogResponse.json();
window.labStartup.show('Создание физического мира…');
const debris=new DebrisWorld(RAPIER),debrisMeshes=new Map();
const core=new LabSimulationCore(),clock=new FixedClock(),keys=new Set();
const scene=new THREE.Scene();scene.background=new THREE.Color(0x09100e);const oilMarks=new OilMarks(THREE,scene);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.05,60);
const cameraControl=new LabCamera(THREE,camera,document.getElementById('camera-mode'),document.getElementById('camera-patient'),document.getElementById('camera-fov'));
window.labStartup.show('Инициализация WebGL…');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc5dacb,0x263229,2));const lamp=new THREE.DirectionalLight(0xe0c9af,3);lamp.position.set(-3,6,4);scene.add(lamp);
const grid=new THREE.GridHelper(14,28,0x5d7265,0x34483c);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.MeshStandardMaterial({color:0x26362e}));floor.rotation.x=-Math.PI/2;scene.add(floor,grid);
const wallMeshes=[],wallMaterial=new THREE.MeshStandardMaterial({color:0x62685e,roughness:1});
const scaleMaterial=new THREE.LineBasicMaterial({color:0x617368});
const gradedMaterial=new THREE.MeshStandardMaterial({color:0x7a8055,roughness:1,side:THREE.DoubleSide});
const routeDebug=document.getElementById('route-debug'),routeLines=[];
const visionDebug=document.getElementById('vision-debug'),visionArrows=[],visionFields=[];
const visionGeometry=new THREE.CircleGeometry(VISION.range,32,-Math.PI/2-VISION.fov/2,VISION.fov);
visionGeometry.rotateX(Math.PI/2);
const visionMaterial=new THREE.MeshBasicMaterial({color:0xffca62,transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false});
const meshes=new Map(),sphere=new THREE.SphereGeometry(1,12,8),materials=[new THREE.MeshStandardMaterial({color:0xa6efba}),new THREE.MeshStandardMaterial({color:0xa58c83})];
const patientHud=new PatientHud(document.getElementById('patient-hud'));
const hitParticles=new HitParticles(THREE,scene),segmentTints=new SegmentTints(),red=new THREE.Color(1,0,0);
function paintSegment(m,fighterId,tint){
 const base=materials[fighterId===0?0:1],material=m.children[0].material;
 material.color.copy(base.color);material.emissive.setRGB(0,0,0);
 if(tint.critical)material.emissive.setRGB(tint.strength,0,0);
 else if(tint.strength)material.color.lerp(red,tint.strength);
}
const supportDebug=document.getElementById('support-debug'),supportGroup=new THREE.Group();scene.add(supportGroup);supportGroup.visible=false;
const contactMaterial=new THREE.MeshBasicMaterial({color:0x72df9c}),massMaterial=new THREE.MeshBasicMaterial({color:0xffca62});
const contactMarkers=[],massMarker=new THREE.Mesh(sphere,massMaterial);massMarker.scale.setScalar(.055);supportGroup.add(massMarker);
const hullGeometry=new THREE.BufferGeometry(),hullPositions=new Float32Array(256*3);hullGeometry.setAttribute('position',new THREE.BufferAttribute(hullPositions,3));
const hullMaterial=new THREE.LineBasicMaterial({color:0x72df9c}),hullLine=new THREE.LineLoop(hullGeometry,hullMaterial);hullLine.frustumCulled=false;supportGroup.add(hullLine);
function drawSupport(state){supportGroup.visible=supportDebug.checked;if(!supportGroup.visible)return;
 massMarker.visible=!!state.centerOfMass;if(state.centerOfMass)massMarker.position.set(...state.centerOfMass);
 for(let i=0;i<state.contacts.length;i++){let m=contactMarkers[i];if(!m){m=new THREE.Mesh(sphere,contactMaterial);m.scale.set(.035,.018,.035);supportGroup.add(m);contactMarkers.push(m);}m.visible=true;const p=state.contacts[i].point;m.position.set(p[0],p[1]+.022,p[2]);}
 for(let i=state.contacts.length;i<contactMarkers.length;i++)contactMarkers[i].visible=false;
 const n=Math.min(256,state.hull.length);for(let i=0;i<n;i++){hullPositions[i*3]=state.hull[i][0];hullPositions[i*3+1]=.025;hullPositions[i*3+2]=state.hull[i][1];}hullGeometry.attributes.position.needsUpdate=true;hullGeometry.setDrawRange(0,n);hullLine.visible=n>1;hullMaterial.color.setHex(state.margin!==null&&state.margin<0?0xee8e65:0x72df9c);
}
const terrainDebug=document.getElementById('terrain-debug'),bodyConeMaterial=new THREE.MeshBasicMaterial({color:0xffca62,wireframe:true});
const moundMeshes=new Map(),cone=new THREE.ConeGeometry(1,1,14),moundMaterial=new THREE.MeshStandardMaterial({color:0x4d574c,roughness:1,flatShading:true});
let paused=false,last=null,frameRequest=0,checkSnapshot=true,floorOperation=0;
const playback=new Playback(clock),stepButton=document.getElementById('frame-step'),rateInput=document.getElementById('playback-rate');
let motionPeak=null,motionLast=null;
let previousFrame=null,currentFrame=null;
const captureFrame=()=>({state:core.getSnapshot(),debris:debris.snapshot()});
function resetFrameHistory(){previousFrame=currentFrame=captureFrame();}
function tickFrame(t){
 previousFrame=currentFrame;const events=advanceCombatStep(core,debris,t,input(),pendingDamage);pendingDamage=null;currentFrame=captureFrame();
 segmentTints.record(events,previousFrame.debris,currentFrame.debris,currentFrame.state.tick);
 hitParticles.record(events,previousFrame.state,currentFrame.state);
 if(scenario.value==='motion-review'){
  motionLast=measureMotion(previousFrame.state,currentFrame.state);
  if(!motionPeak||motionLast.max>motionPeak.max)motionPeak=motionLast;
 }
}
const query=new URLSearchParams(location.search);
const requestedSession=query.get('session');
const floorSession=requestedSession?.trim()&&requestedSession.length<=128?requestedSession:'lab-preview';
const stats=document.getElementById('stats'),floorStatus=document.getElementById('floor-status');
function scheduleFrame(){if(!frameRequest)frameRequest=requestAnimationFrame(frame);}
function assertSnapshot(s){
 const n=s.fighterIds?.length;
 if(!n||s.roots?.length!==n*4||s.rigVersion!==2||s.rigSegments?.length!==n||s.mobilityModes?.length!==n||s.postures?.length!==n||s.bodyTerrainStates?.length!==n||s.oil?.length!==n||s.impacts?.length!==n||!Array.isArray(s.oilMarks)||s.strikes?.length!==n||!s.fight||s.health?.length!==n||s.lifeStates?.length!==n||s.balanceStates?.length!==n||s.stepCounts?.length!==n||s.footStates?.length!==n||s.hopHeights?.length!==n||s.hopPhases?.length!==n||s.supports?.length!==n||s.crawlAnchors?.length!==n||s.residualTraction?.length!==n||!s.damageStats||!s.collisionStats)throw new Error('Несогласованные файлы симуляции и рендера. Обновите страницу; сборка '+stats.dataset.build);
}
const scenario=document.getElementById('scenario'),patientCount=document.getElementById('patient-count');
const controlPatient=document.getElementById('control-patient');
let controlScenario=null;
function resetControl(s){
 const old=controlPatient.value,changed=controlScenario!==scenario.value;controlScenario=scenario.value;
 const auto=document.createElement('option');auto.value='';auto.textContent='Все под ИИ';controlPatient.replaceChildren(auto);
 for(const id of s.fighterIds){const o=document.createElement('option');o.value=String(id);o.textContent='Пациент № '+id;controlPatient.append(o);}
 const autonomous=scenario.value.startsWith('arena')||scenario.value.startsWith('duel')||!!selectedLocation();
 controlPatient.value=!changed&&Array.from(s.fighterIds).includes(Number(old))&&old!==''?old:!changed&&old===''?'':autonomous?'':String(s.fighterIds[0]);
 controlPatient.disabled=scenario.value==='motion-review';
}
controlPatient.onchange=()=>{keys.clear();controlPatient.blur();if(controlPatient.value!==''&&cameraControl.mode==='head')document.getElementById('camera-patient').value=controlPatient.value;};
// Seed is a replay/diagnostic input, not a tactical control.
const requestedSeed=query.get('seed');
function roundSeed(){return requestedSeed!==null&&/^\d{1,10}$/.test(requestedSeed)&&Number(requestedSeed)<=0xffffffff?Number(requestedSeed):7;}
const requestedPatients=Number(new URLSearchParams(location.search).get('patients'));
if(requestedPatients===2)patientCount.value='2';
function authoredPatients(loc){return patientCount.value==='full'?loc.capacity:Math.min(loc.capacity,Math.max(2,Number(patientCount.value)));}
const damageControls=document.getElementById('damage-controls'),damageSegment=document.getElementById('damage-segment'),damageHP=document.getElementById('damage-hp');
let pendingDamage=null;
const queueDamage=amount=>{if(scenario.value==='damage'&&!paused)pendingDamage={fighterId:0,segmentId:damageSegment.value,amount};};
document.getElementById('damage-hit').onclick=()=>queueDamage(1);document.getElementById('damage-crit').onclick=()=>queueDamage(2);
const requestedScenario=new URLSearchParams(location.search).get('scenario');
if(requestedScenario&&[...scenario.options].some(o=>o.value===requestedScenario))scenario.value=requestedScenario;
function selectedLocation(){return scenario.value==='motion-review'?authoredLocations.ring:scenario.value.startsWith('location-')?authoredLocations[scenario.value.slice(9)]??null:null;}
function floorArenaId(){
 const location=selectedLocation();
 const ring=location??(scenario.value.startsWith('duel')?authoredLocations.ring:null);
 const revision=ring?.terrain?.revision??ring?.floorRevision;
 const scope=scenario.value==='motion-review'?'motion-review':location?.id??scenario.value;
 return revision?scope+'@'+revision+'-165':scope+'@165';
}
function scenarioConfig(){
 const mode=scenario.value,base=createLabConfig(7);
 const cfg=mode.startsWith('duel')?{...base,location:authoredLocations.ring}:base;
 if(mode==='terrain-hill')return {...cfg,labDynamicBalance:true,gradedSurface:lowHill(),fighters:[{...cfg.fighters[0],origin:[0,0,1.7],yawRad:0}]};
 if(mode==='motion-review'){
  const review=createAuthoredCombatConfig(7,authoredLocations.ring,2);
  return {...review,combatEnabled:false,expandedStrikes:false,escapeCombat:false,perceptionCombat:false,labContactFracture:false,labDynamicBalance:false,
   fighters:review.fighters.map((f,i)=>({...f,origin:[i===0?-1.2:1.2,0,1.05],yawRad:0}))};
 }
 if(mode.startsWith('location-')){
  const location=selectedLocation();if(!location)throw Error('Неизвестная авторская 3D арена');
  return createAuthoredCombatConfig(roundSeed(),location,authoredPatients(location));
 }
if(mode==='normal')return {...cfg,labContactFracture:true,labDynamicBalance:true};const f=cfg.fighters[0];if(mode==='duel-traits')return {...cfg,combatEnabled:true,expandedStrikes:true,fighters:[{...f,origin:[0,0,1.2],yawRad:0,profile:{movement:4,critical:2,turning:3,temperament:'impulsive'}},{...cfg.fighters[1],origin:[0,0,-1.2],yawRad:Math.PI,profile:{movement:2,critical:4,turning:3,temperament:'hesitant'}}]};if(mode==='duel-prone')return {...cfg,combatEnabled:true,expandedStrikes:true,fighters:[{...f,origin:[0,0,1.05],yawRad:0,segmentIds:f.segmentIds.filter(s=>!/\.(upperLeg|lowerLeg|foot)$/.test(s))},{...cfg.fighters[1],origin:[0,0,-1.05],yawRad:Math.PI,segmentIds:cfg.fighters[1].segmentIds.filter(s=>!/\.(upperLeg|lowerLeg|foot)$/.test(s))}]};if(mode==='duel'||mode==='duel-mixed')return {...cfg,combatEnabled:true,expandedStrikes:mode==='duel-mixed',fighters:[{...f,origin:[0,0,1.2],yawRad:0},{...cfg.fighters[1],origin:[0,0,-1.2],yawRad:Math.PI}]};if(mode==='corpse')return {...cfg,fighters:[{...f,origin:[0,0,2.4]},{...cfg.fighters[1],origin:[0,0,0],yawRad:0}],labContactFracture:false};if(mode==='fall')return {...cfg,labDynamicBalance:true,labContactFracture:false,fighters:[{...f,origin:[0,0,0],yawRad:0},{...cfg.fighters[1],origin:[.08,0,0],yawRad:0}]};let ids=mode==='walk'||mode==='damage'?f.segmentIds:mode==='one-leg'?f.segmentIds.filter(s=>!/^R\.(upperLeg|lowerLeg|foot)$/.test(s)):f.segmentIds.filter(s=>!/\.(upperLeg|lowerLeg|foot)$/.test(s));if(mode==='one-arm')ids=ids.filter(s=>!s.startsWith('R.'));if(mode==='stump')ids=ids.filter(s=>!/\.(upperArm|lowerArm|hand)$/.test(s)||s==='L.upperArm');if(mode==='head'||mode==='torso')ids=ids.filter(s=>!/\.(upperArm|lowerArm|hand)$/.test(s));if(mode==='torso')ids=ids.filter(s=>s!=='head'&&s!=='neck');return {...cfg,fighters:[{...f,segmentIds:ids}],labContactFracture:false};}
function reset(savedFloor=null){try{if(frameRequest)cancelAnimationFrame(frameRequest);frameRequest=0;window.labStartup.show('Сброс сценария…');const config=scenarioConfig();debris.reset(config.walls??[],savedFloor,floorArenaId(),config.location??null,config.gradedSurface??[]);oilMarks.reset();for(const m of wallMeshes){scene.remove(m);m.geometry.dispose();}wallMeshes.length=0;
 for(const tri of config.gradedSurface??[]){
  const geo=new THREE.BufferGeometry(),p=new Float32Array(tri.flatMap(v=>v));
  geo.setAttribute('position',new THREE.BufferAttribute(p,3));geo.computeVertexNormals();
  const surface=new THREE.Mesh(geo,gradedMaterial);surface.receiveShadow=true;
  scene.add(surface);wallMeshes.push(surface);
 }
 const location=config.location??null;
 patientCount.disabled=!selectedLocation();
 document.getElementById('scene-hint').textContent=location||scenario.value.startsWith('duel')
  ?'Ринг ⌀ 9 м · деление 1 м · рост пациента 1,65 м · бой ИИ.':'W/S — движение, A/D — поворот, Shift — бег, пробел — прыжок.';
 floor.visible=grid.visible=location?.shape!=='circle';
 cameraControl.setArena(location?.shape==='circle');
 
 if(location?.shape==='circle'){
  const mat=floor.material;
  const surface=new THREE.Mesh(new THREE.CircleGeometry(location.width/2,location.boundary.length),mat);
  surface.rotation.x=-Math.PI/2;scene.add(surface);wallMeshes.push(surface);
  const radius=location.width/2;
  const marks=[-radius,.003,0,radius,.003,0];
  for(let x=-radius;x<=radius;x+=1)marks.push(x,.003,-.09,x,.003,.09);
  const scaleGeometry=new THREE.BufferGeometry();
  scaleGeometry.setAttribute('position',new THREE.Float32BufferAttribute(marks,3));
  const scaleLine=new THREE.LineSegments(scaleGeometry,scaleMaterial);
  scene.add(scaleLine);wallMeshes.push(scaleLine);
 }
 if(location){
  for(const object of location.objects){
   const shape=new THREE.Shape();
   object.points.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));
   shape.closePath();
   const geometry=new THREE.ExtrudeGeometry(shape,{depth:object.height,bevelEnabled:false,steps:1});
   geometry.rotateX(-Math.PI/2);
   const mesh=new THREE.Mesh(geometry,wallMaterial);scene.add(mesh);wallMeshes.push(mesh);
  }
  for(let i=0;i<location.boundary.length;i++){
   const a=location.boundary[i],b=location.boundary[(i+1)%location.boundary.length];
   const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
   const height=location.boundaryHeight??2.8,offset=location.shape==='circle'?.10:0;
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,height,.20),wallMaterial);
   mesh.position.set((a.x+b.x)/2+dz/len*offset,height/2,(a.z+b.z)/2-dx/len*offset);
   mesh.rotation.y=-Math.atan2(dz,dx);scene.add(mesh);wallMeshes.push(mesh);
  }
 }else for(const w of config.walls??[]){const m=new THREE.Mesh(new THREE.BoxGeometry(w.maxX-w.minX,w.height,w.maxZ-w.minZ),wallMaterial);m.position.set((w.minX+w.maxX)/2,w.height/2,(w.minZ+w.maxZ)/2);scene.add(m);wallMeshes.push(m);}for(const m of debrisMeshes.values()){scene.remove(m);m.children[0].material.dispose();}debrisMeshes.clear();segmentTints.reset();hitParticles.reset();for(const m of moundMeshes.values())scene.remove(m);moundMeshes.clear();core.initialize({...config,patientPoses:authoredLocations.ring.patientPoses,patientScale:PATIENT_SCALE});pendingDamage=null;damageControls.hidden=scenario.value!=='damage';damageSegment.replaceChildren();if(!damageControls.hidden){for(const part of core.getSnapshot().health[0].segments){const o=document.createElement('option');o.value=part.id;o.textContent=part.id;damageSegment.append(o);}damageSegment.value='R.upperArm';}if(scenario.value==='corpse'){core.incapacitate(1);for(const e of core.drainEvents())debris.accept(e);}playback.reset();motionPeak=motionLast=null;keys.clear();last=null;checkSnapshot=true;resetFrameHistory();assertSnapshot(currentFrame.state);cameraControl.reset(currentFrame.state);resetControl(currentFrame.state);
  stats.dataset.graded=String(config.gradedSurface?.length??0);
  stats.dataset.patients=String(config.fighters.length);
  stats.dataset.location=location?.id??'';
  stats.dataset.authoredObjects=String(location?.objects.length??0);
  floorStatus.textContent=savedFloor?'Пол сохранён: '+debris.archiveFloor.visuals.length+' сегментов, '+debris.archiveFloor.mounds.length+' конусов.':'Новый чистый пол.';
  scheduleFrame();}catch(e){window.labStartup.fail(e);}}
const controls=new Set(['KeyW','KeyS','KeyA','KeyD','ShiftLeft','ShiftRight','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyJ','KeyK','KeyL']);
addEventListener('keydown',e=>{if(controls.has(e.code)&&!capturesTextInput(document.activeElement)){e.preventDefault();keys.add(e.code);}});addEventListener('keyup',e=>keys.delete(e.code));document.addEventListener('focusin',e=>{if(capturesTextInput(e.target))keys.clear();});addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{keys.clear();playback.reset();last=null;if(currentFrame)resetFrameHistory();});
const has=(...c)=>Number(c.some(k=>keys.has(k)));
const input=()=>scenario.value==='motion-review'?reviewInput(currentFrame.state.tick).input:manualInput(currentFrame.state.fighterIds,currentFrame.state.lifeStates,controlPatient.value,has,scenario.value==='fall');
document.getElementById('pause').onclick=e=>{paused=!paused;playback.setPaused(paused);keys.clear();last=null;if(currentFrame)resetFrameHistory();stepButton.disabled=!paused;e.target.textContent=paused?'Продолжить':'Пауза';};
 rateInput.onchange=()=>{playback.setRate(Number(rateInput.value));last=null;};
 stepButton.onclick=()=>{if(stats.dataset.state==='running'&&paused)playback.requestStep();};
 function suspendRound(message){
  if(frameRequest)cancelAnimationFrame(frameRequest);
  frameRequest=0;last=null;keys.clear();
  window.labStartup.show(message);
 }
 // Reuse v1's persisted-floor contract: load by session and arena; a plain
 // Reset is an explicit deletion, while switching scenarios reloads its scope.
 async function restoreScenario(){
  const operation=++floorOperation,arena=floorArenaId();
  suspendRound('Восстановление состояния арены…');
  let saved=null,warning='';
  try{saved=await loadFloorHistory(floorSession,arena);}
  catch(error){warning='Хранилище пола недоступно ('+error.message+'). Сцена работает без восстановления.';}
  if(operation!==floorOperation||arena!==floorArenaId())return;
  reset(saved);
  if(warning)floorStatus.textContent=warning;
 }
 document.getElementById('reset').onclick=async()=>{
  const operation=++floorOperation,arena=floorArenaId();
  suspendRound('Очистка сохранённого пола…');
  let warning='';
  try{await clearFloorHistory(floorSession,arena);}
  catch(error){warning='Сброс выполнен, но удалить сохранённый пол не удалось: '+error.message;}
  if(operation!==floorOperation||arena!==floorArenaId())return;
  reset();
  if(warning)floorStatus.textContent=warning;
 };
 scenario.onchange=()=>{scenario.blur();void restoreScenario();};
 patientCount.onchange=()=>{if(selectedLocation()&&scenario.value!=='motion-review')void restoreScenario();};
 document.getElementById('next-round').onclick=async()=>{
  // A premature click must not invalidate an in-flight load or clear.
  if(stats.dataset.state!=='running'){floorStatus.textContent='Дождитесь загрузки арены.';return;}
  const arena=floorArenaId();
  try{
   const state=core.getSnapshot();
   if(!state.fight.ended)throw new Error('Сначала необходимо завершить бой.');
   const saved=debris.exportSettledFloor(arena,state.oilMarks);
   const operation=++floorOperation;
   suspendRound('Сохранение пола перед следующим раундом…');
   let warning='';
   try{await saveFloorHistory(floorSession,arena,saved);}
   catch(error){warning='Следующий раунд запущен, но запись пола не удалась: '+error.message;}
   if(operation!==floorOperation||arena!==floorArenaId())return;
   reset(saved);
   if(warning)floorStatus.textContent=warning;
   else floorStatus.textContent+=' Сохранено в IndexedDB ('+floorSession+').';
  }catch(error){if(arena===floorArenaId())floorStatus.textContent=error.message;}
 };

addEventListener('resize',()=>{cameraControl.resize(innerWidth/innerHeight);renderer.setSize(innerWidth,innerHeight);});
const v=a=>new THREE.Vector3(...a),basis=new THREE.Matrix4(),priorRotation=new THREE.Quaternion();
function frameRotation(f,out){return out.setFromRotationMatrix(basis.makeBasis(v(f.x),v(f.y),v(f.z)));}
function segmentFrame(p,parts,yaw,head){
 if(p.id==='head'&&head){const f=boneFrame(p.a,p.a.map((n,i)=>n+head.up[i]),head.forward);return {...f,center:p.a,length:0};}
 if(p.id.endsWith('.hand')){const arm=parts.find(q=>q.id===p.id.replace('.hand','.lowerArm'));if(arm){const f=anatomicalBoneFrame(arm,parts,yaw);return {...f,center:p.a,length:0};}}
 return anatomicalBoneFrame(p,parts,yaw);
}
function frame(now){frameRequest=0;try{const dt=last===null?0:(now-last)/1000;last=now;playback.advance(dt,tickFrame,document.hidden);const s=currentFrame.state,prior=previousFrame.state,alpha=playback.alpha;patientHud.draw(s);if(checkSnapshot){assertSnapshot(s);checkSnapshot=false;}
 for(const mesh of meshes.values())mesh.visible=false;
 const tinted=[];
 s.rigSegments.forEach((parts,i)=>{
  const j=prior.fighterIds.indexOf(s.fighterIds[i]),oldParts=j>=0?prior.rigSegments[j]:null;
  // Never resurrect severed anatomy or interpolate across an ownership handoff.
  const compatible=oldParts&&oldParts.length===parts.length&&prior.lifeStates[j]===s.lifeStates[i]&&parts.every(p=>oldParts.some(q=>q.id===p.id));
  for(const p of parts){
   const id=s.fighterIds[i],key=id+':'+p.id,f=segmentFrame(p,parts,s.roots[i*4+3],s.headFrames?.[i]);
   let m=meshes.get(key);if(!m){m=createSegmentVisual(p.id,p.radius,f.length,materials[id===0?0:1].clone());meshes.set(key,m);scene.add(m);}
   m.visible=true;m.position.copy(v(f.center));frameRotation(f,m.quaternion);
   const tint=segmentTints.sample(id,p.id,s.tick);paintSegment(m,id,tint);if(tint.strength)tinted.push(key);
   const old=compatible&&alpha<1?oldParts.find(q=>q.id===p.id):null;
   if(old){
    const o=segmentFrame(old,oldParts,prior.roots[j*4+3],prior.headFrames?.[j]);
    m.position.copy(v(o.center)).lerp(v(f.center),alpha);
    frameRotation(o,priorRotation);m.quaternion.slerp(priorRotation,1-alpha);
   }
  }
 });
 cameraControl.update(s,prior,alpha,meshes,HEAD_CAMERA_CLEARANCE);stats.dataset.camera=cameraControl.mode;
 const falling=currentFrame.debris,oldDebris=new Map(previousFrame.debris.map(d=>[d.id,d])),active=new Set(falling.map(d=>d.id));
 for(const [id,m] of debrisMeshes)if(!active.has(id)){scene.remove(m);m.children[0].material.dispose();debrisMeshes.delete(id);}
 for(const d of falling){
  let m=debrisMeshes.get(d.id);
  if(!m){m=createSegmentVisual(d.segmentId,d.radius,d.length,materials[d.fighterId===0?0:1].clone());debrisMeshes.set(d.id,m);scene.add(m);}
  const tint=segmentTints.sample(d.id,d.segmentId,s.tick,true);paintSegment(m,d.fighterId,tint);if(tint.strength)tinted.push('debris:'+d.id);
  m.position.set(d.position.x,d.position.y,d.position.z);m.quaternion.set(d.rotation.x,d.rotation.y,d.rotation.z,d.rotation.w);
  const old=oldDebris.get(d.id);
  if(old&&old.settled===d.settled&&alpha<1){
   m.position.set(old.position.x,old.position.y,old.position.z).lerp(new THREE.Vector3(d.position.x,d.position.y,d.position.z),alpha);
   priorRotation.set(old.rotation.x,old.rotation.y,old.rotation.z,old.rotation.w);m.quaternion.slerp(priorRotation,1-alpha);
  }
 }
 for(const d of debris.moundSnapshot()){
  let m=moundMeshes.get(d.id);if(!m){m=new THREE.Mesh(cone,d.source==='body'||d.source==='branch'||d.source==='segment'?bodyConeMaterial:moundMaterial);m.position.set(d.x,d.height/2,d.z);m.scale.set(d.radius,d.height,d.radius);scene.add(m);moundMeshes.set(d.id,m);}m.visible=(d.source!=='body'&&d.source!=='branch'&&d.source!=='segment')||terrainDebug.checked;
 }
 stats.dataset.hitParticles=String(hitParticles.draw(s.tick));stats.dataset.hitTint=tinted.join(',');stats.dataset.segmentGeometry='ellipsoid';
 const pools=debris.bodyPoolSnapshot();stats.dataset.bodyPools=String(pools.length);
 const floorOil=[...debris.archivedOilSnapshot(),...s.oilMarks,...pools].slice(-2000);
  oilMarks.draw(floorOil,s.tick);stats.dataset.oil=String(floorOil.length);
  stats.dataset.floorVisuals=String(debris.archiveFloor?.visuals.length??0);
  stats.dataset.floorMounds=String(debris.archiveFloor?.mounds.length??0);stats.dataset.wounds=String(s.oil[0].wounds.length);stats.dataset.impact=String(s.impacts[0].active);const health=s.health[0],selected=health.segments.find(p=>p.id===damageSegment.value);damageHP.textContent=selected?selected.hp+'/'+selected.maxHp+(selected.attached?'':' — отделён'):'';stats.dataset.health=String(selected?.hp??0);stats.dataset.trauma=String(health.trauma);stats.dataset.endurance=String(health.endurance);stats.dataset.maxEndurance=String(health.maxEndurance);stats.dataset.cause=health.cause??'';
 for(let i=0;i<visionArrows.length;i++)visionArrows[i].visible=false;
 for(const field of visionFields)if(field)field.visible=false;
 if(visionDebug.checked&&selectedLocation())s.rigSegments.forEach((parts,i)=>{
  const h=parts.find(p=>p.id==='head');if(!h||s.lifeStates[i]!=='active')return;
  let arrow=visionArrows[i];if(!arrow){arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),new THREE.Vector3(),.72,0xffca62,.16,.10);visionArrows[i]=arrow;scene.add(arrow);}
  const yaw=s.perception[i].gazeYaw,dir=new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw));
  let field=visionFields[i];
  if(!field){field=new THREE.Mesh(visionGeometry,visionMaterial);visionFields[i]=field;scene.add(field);}
  field.position.set(h.a[0],.013+i*.001,h.a[2]);field.rotation.y=-yaw;field.visible=true;
  arrow.position.set(...h.a);arrow.position.addScaledVector(dir,h.radius);arrow.setDirection(dir);arrow.visible=true;
 });
 for(const l of routeLines)if(l)l.visible=false;
 if(routeDebug.checked&&selectedLocation())s.routes.forEach((points,i)=>{
  if(!points.length||s.lifeStates[i]!=='active')return;
  let l=routeLines[i];if(!l){l=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffca62}));routeLines[i]=l;scene.add(l);}
  const path=[new THREE.Vector3(s.roots[i*4],.06,s.roots[i*4+2]),...points.map(p=>new THREE.Vector3(p.x,.06,p.z))];
  if(l.geometry.getAttribute('position')?.count!==path.length){l.geometry.dispose();l.geometry=new THREE.BufferGeometry();}
  l.geometry.setFromPoints(path);
  l.geometry.computeBoundingSphere();l.visible=true;
 });
 stats.dataset.drawnRoutes=String(routeLines.filter(l=>l?.visible).length);
 stats.dataset.drawnVision=String(visionFields.filter(f=>f?.visible).length);
 stats.dataset.routes=String(s.routes.filter(r=>r.length).length);stats.dataset.visible=s.perception.map(p=>p.visibleIds.length).join('/');stats.dataset.active=String(s.lifeStates.filter(v=>v==='active').length);stats.dataset.targets=s.tactics.map(t=>t.targetId===null?'-':t.targetId).join('/');stats.dataset.tactics=s.tactics.map(t=>t.mode).join('/');stats.dataset.escapes=String(s.escapes.filter(e=>e.plan).length);
 const controlled=controlPatient.value===''?-1:s.fighterIds.indexOf(Number(controlPatient.value));
 stats.dataset.controlled=controlled>=0?String(s.fighterIds[controlled]):'';
 stats.dataset.controlledX=controlled>=0?String(s.roots[4*controlled]):'';
 stats.dataset.controlledZ=controlled>=0?String(s.roots[4*controlled+2]):'';
 stats.dataset.hunts=(s.hunts??[]).map(h=>h.phase).join('/');
 stats.dataset.raids=(s.raids??[]).map(h=>h.phase).join('/');stats.dataset.tracked=s.perception.map(p=>p.tracked.map(t=>t.id).join('+')).join('/');
 const raidStatus=document.getElementById('raid-status');raidStatus.hidden=scenario.value!=='location-ring';
 if(!raidStatus.hidden){const labels={search:'поиск',observe:'наблюдение',flank:'обход',rush:'рывок',attack:'атака',withdraw:'отход',reassess:'оценка'};raidStatus.textContent=(s.raids??[]).map((r,i)=>'№'+s.fighterIds[i]+' '+(s.lifeStates[i]!=='active'?'выбыл':controlPatient.value===String(s.fighterIds[i])?'ручное':labels[r.phase]??r.phase)+(r.targetId===null?'':' → №'+r.targetId)+(s.perception[i]?.tracked.length>1?' · наблюдает '+s.perception[i].tracked.map(t=>'№'+t.id+(t.visible?'':'?')).join('+'):'')+(r.attempts?' · серия '+r.hits+'/'+r.attempts+' · азарт '+Math.round(r.rush*100)+'%':'')).join(' | ');}
  stats.dataset.playback=String(playback.rate);stats.dataset.reviewPhase=scenario.value==='motion-review'?reviewInput(s.tick).phase:'';
  stats.dataset.motionPeak=motionPeak?motionPeak.max.toFixed(4):'';
  const motionStatus=document.getElementById('motion-status');motionStatus.hidden=scenario.value!=='motion-review';
  if(!motionStatus.hidden)motionStatus.textContent='Фаза: '+stats.dataset.reviewPhase+' | Δ/тик: '+((motionLast?.max??0)*100).toFixed(2)+' см | пик: '+((motionPeak?.max??0)*100).toFixed(2)+' см'+(motionPeak?.segment?' (№'+motionPeak.fighterId+' '+motionPeak.segment+', тик '+motionPeak.tick+')':'');
  stats.dataset.traits=s.patientTraits.map(t=>t.temperament+':'+Math.round(t.criticalChance*100)+'%').join('/');stats.dataset.strike=s.strikes.map(v=>v.phase==='idle'?'idle':(v.prone?'prone:':'')+v.kind+':'+v.phase).join('/');stats.dataset.hits=String(s.damageStats.hits);stats.dataset.fight=s.fight.ended?'ended':'running';stats.dataset.winner=s.fight.winnerId===null?'':String(s.fight.winnerId);
 stats.dataset.settledSingles=String(falling.filter(d=>d.branchId===undefined&&d.settled).length);stats.dataset.visibleCones=String([...moundMeshes.values()].filter(m=>m.visible).length);stats.dataset.ragdollBodies=String(debris.bodySnapshot().reduce((n,b)=>n+b.dynamicBodies,0));stats.dataset.ragdollJoints=String(debris.bodySnapshot().reduce((n,b)=>n+b.joints,0));
 stats.dataset.detachedBranches=String(debris.branchSnapshot().length);stats.dataset.branchSegments=String(debris.branchSnapshot().reduce((n,b)=>n+b.parts.length,0));
 stats.dataset.bodyCones=String(debris.moundSnapshot().filter(m=>m.source==='body').length);stats.dataset.settled=String(s.bodyTerrainStates.filter(Boolean).length);stats.dataset.incapacitated=String(s.lifeStates.filter(v=>v==='incapacitated').length);stats.dataset.fallReasons=s.health.map(h=>h.cause??'-').join('/');stats.dataset.lyingBodies=String(debris.bodySnapshot().filter(b=>{const p=b.parts.find(p=>p.id==='pelvis'),c=b.parts.find(p=>p.id==='chest');if(!p||!c)return b.settled;const v=c.a.map((x,i)=>(x+c.b[i]-p.a[i]-p.b[i])*.5);return Math.abs(v[1])<Math.hypot(...v)*.45;}).length);stats.dataset.bodySegments=String(debris.bodySnapshot().reduce((n,b)=>n+b.parts.length,0));stats.dataset.balance=s.balanceStates[0];stats.dataset.steps=String(s.stepCounts[0]);const support=s.supports[0],anchors=s.crawlAnchors[0],traction=s.residualTraction[0];stats.dataset.traction=String(traction?.scale??0);stats.dataset.tractionContacts=String(traction?.contacts.length??0);stats.dataset.planted=String(anchors.filter(a=>a.valid).length);drawSupport(support);stats.dataset.supportCount=String(support.contacts.length);
 document.getElementById('stats').textContent=`Build ${stats.dataset.build} | Tick ${s.tick} | ${s.rigSegments.flat().length} segments | ${paused?'PAUSED':'RUNNING'} | contacts ${s.collisionStats.contacts} | tests ${s.collisionStats.tests} | hits ${s.damageStats.hits} | ${scenario.value==='duel-traits'?'traits '+stats.dataset.traits+' | ':''}strike ${stats.dataset.strike} | ${(scenario.value.startsWith('arena')||scenario.value.startsWith('duel'))?(s.fight.ended?'winner '+(s.fight.winnerId??'draw'):'duel')+' | ':''} ${scenario.value.startsWith('arena')?'active '+stats.dataset.active+' | targets '+stats.dataset.targets+' | tactics '+stats.dataset.tactics+(scenario.value==='arena-vision'?' | seen '+stats.dataset.visible:'')+' | ':''}trauma ${health.trauma}/${health.traumaThreshold} | wounds ${stats.dataset.wounds} | oil ${stats.dataset.oil} | impact ${stats.dataset.impact} | detached ${s.damageStats.detached} | branches ${stats.dataset.detachedBranches} | incapacitated ${stats.dataset.incapacitated} (${stats.dataset.fallReasons}) | lying ${stats.dataset.lyingBodies} | ragdoll ${stats.dataset.ragdollBodies}/${stats.dataset.ragdollJoints} | body cones ${stats.dataset.bodyCones} | debris ${debrisMeshes.size} | mounds ${moundMeshes.size} | player ${s.mobilityModes[0]} / ${s.postures[0]} | balance ${stats.dataset.balance} | steps ${stats.dataset.steps} | hop ${s.hopPhases[0]} | support ${support.contacts.length} | planted ${stats.dataset.planted} | drive ${traction?traction.mode+'/'+traction.phase+' '+traction.scale.toFixed(2):'-'} | margin ${support.margin===null?'air':support.margin.toFixed(3)+' m'}`;renderer.render(scene,camera);document.getElementById('stats').dataset.tick=String(s.tick);document.getElementById('stats').dataset.posture=s.postures[0];document.getElementById('stats').dataset.mode=s.mobilityModes[0];document.getElementById('stats').dataset.z=String(s.roots[2]);stats.dataset.y=String(s.roots[1]);stats.dataset.hop=String(s.hopHeights[0]);if(document.getElementById('stats').dataset.state!=='running')window.labStartup.ready();scheduleFrame();}catch(e){window.labStartup.fail(e);}}
window.labStartup.show('Восстановление пола арены…');void restoreScenario().catch(window.labStartup.fail);
