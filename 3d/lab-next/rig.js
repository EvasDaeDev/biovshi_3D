import RAPIER from '@rapier';
import {DebrisWorld} from './debris.js';
import * as THREE from 'three';
import {LabSimulationCore,createLabConfig,FixedClock} from '../core/dist/index.js';
import {boneFrame} from '../core/dist/rig/bone-frame.js';
window.labStartup.show('Инициализация Rapier / WASM…');
await RAPIER.init();
window.labStartup.show('Создание физического мира…');
const debris=new DebrisWorld(RAPIER),debrisMeshes=new Map();
const core=new LabSimulationCore(),clock=new FixedClock(),keys=new Set();
const scene=new THREE.Scene();scene.background=new THREE.Color(0x09100e);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.05,60);camera.position.set(8,6,9);camera.lookAt(0,1,0);
window.labStartup.show('Инициализация WebGL…');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc5dacb,0x263229,2));const lamp=new THREE.DirectionalLight(0xe0c9af,3);lamp.position.set(-3,6,4);scene.add(lamp);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.MeshStandardMaterial({color:0x26362e}));floor.rotation.x=-Math.PI/2;scene.add(floor,new THREE.GridHelper(14,28,0x5d7265,0x34483c));
const meshes=new Map(),sphere=new THREE.SphereGeometry(1,12,8),cylinder=new THREE.CylinderGeometry(1,1,1,12),materials=[new THREE.MeshStandardMaterial({color:0xa6efba}),new THREE.MeshStandardMaterial({color:0xa58c83})];
const moundMeshes=new Map(),cone=new THREE.ConeGeometry(1,1,14),moundMaterial=new THREE.MeshStandardMaterial({color:0x4d574c,roughness:1,flatShading:true});
let paused=false,last=null,frameRequest=0,checkSnapshot=true;
const stats=document.getElementById('stats');
function scheduleFrame(){if(!frameRequest)frameRequest=requestAnimationFrame(frame);}
function assertSnapshot(s){
 const n=s.fighterIds?.length;
 if(!n||s.roots?.length!==n*4||s.rigVersion!==2||s.rigSegments?.length!==n||s.mobilityModes?.length!==n||s.postures?.length!==n||s.hopHeights?.length!==n||s.hopPhases?.length!==n||!s.damageStats||!s.collisionStats)throw new Error('Несогласованные файлы симуляции и рендера. Обновите страницу; сборка '+stats.dataset.build);
}
const scenario=document.getElementById('scenario');
const requestedScenario=new URLSearchParams(location.search).get('scenario');
if(requestedScenario&&[...scenario.options].some(o=>o.value===requestedScenario))scenario.value=requestedScenario;
function scenarioConfig(){const cfg=createLabConfig(7),mode=scenario.value;if(mode==='normal')return {...cfg,labContactFracture:true};const f=cfg.fighters[0];let ids=mode==='one-leg'?f.segmentIds.filter(s=>!/^R\.(upperLeg|lowerLeg|foot)$/.test(s)):f.segmentIds.filter(s=>!/\.(upperLeg|lowerLeg|foot)$/.test(s));if(mode==='one-arm')ids=ids.filter(s=>!s.startsWith('R.'));if(mode==='head'||mode==='torso')ids=ids.filter(s=>!/\.(upperArm|lowerArm|hand)$/.test(s));if(mode==='torso')ids=ids.filter(s=>s!=='head'&&s!=='neck');return {...cfg,fighters:[{...f,segmentIds:ids}],labContactFracture:false};}
function reset(){try{if(frameRequest)cancelAnimationFrame(frameRequest);frameRequest=0;window.labStartup.show('Сброс сценария…');debris.reset();for(const m of debrisMeshes.values())scene.remove(m);debrisMeshes.clear();for(const m of moundMeshes.values())scene.remove(m);moundMeshes.clear();core.initialize(scenarioConfig());clock.reset();keys.clear();last=null;checkSnapshot=true;assertSnapshot(core.getSnapshot());scheduleFrame();}catch(e){window.labStartup.fail(e);}}
const controls=new Set(['KeyW','KeyS','KeyA','KeyD','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
addEventListener('keydown',e=>{if(controls.has(e.code)){e.preventDefault();keys.add(e.code);}});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{keys.clear();clock.reset();last=null;});
const has=(...c)=>Number(c.some(k=>keys.has(k)));
const input=()=>({commands:[{fighterId:0,forward:has('KeyW','ArrowUp')-has('KeyS','ArrowDown'),turn:has('KeyD','ArrowRight')-has('KeyA','ArrowLeft'),sprint:!!has('ShiftLeft','ShiftRight')}]});
document.getElementById('pause').onclick=e=>{paused=!paused;keys.clear();e.target.textContent=paused?'Продолжить':'Пауза';};document.getElementById('reset').onclick=reset;scenario.onchange=reset;
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
const v=a=>new THREE.Vector3(...a),basis=new THREE.Matrix4();
function frame(now){frameRequest=0;try{const dt=last===null?0:(now-last)/1000;last=now;clock.advance(dt,t=>{core.setTerrainMounds(debris.moundSnapshot());core.step(t,input());for(const e of core.drainEvents())debris.accept(e);debris.step(t);},paused||document.hidden);const s=core.getSnapshot();if(checkSnapshot){assertSnapshot(s);checkSnapshot=false;}
 for(const mesh of meshes.values())mesh.visible=false;
 s.rigSegments.forEach((parts,i)=>parts.forEach(p=>{const key=s.fighterIds[i]+':'+p.id;const f=boneFrame(p.a,p.b,[Math.sin(s.roots[i*4+3]),0,-Math.cos(s.roots[i*4+3])]);let m=meshes.get(key);if(!m){m=new THREE.Mesh(f.length>1e-8?cylinder:sphere,materials[i===0?0:1]);meshes.set(key,m);scene.add(m);}m.visible=true;m.position.copy(v(f.center));if(f.length>1e-8){basis.makeBasis(v(f.x),v(f.y),v(f.z));m.quaternion.setFromRotationMatrix(basis);m.scale.set(p.radius,f.length,p.radius);}else m.scale.setScalar(p.radius);}));
 const falling=debris.snapshot(),active=new Set(falling.map(d=>d.id));
 for(const [id,m] of debrisMeshes)if(!active.has(id)){scene.remove(m);debrisMeshes.delete(id);}
 for(const d of falling){
  let m=debrisMeshes.get(d.id);
  if(!m){m=new THREE.Mesh(d.length?cylinder:sphere,materials[d.fighterId===0?0:1]);debrisMeshes.set(d.id,m);scene.add(m);if(d.length)m.scale.set(d.radius,d.length,d.radius);else m.scale.setScalar(d.radius);}
  m.position.set(d.position.x,d.position.y,d.position.z);m.quaternion.set(d.rotation.x,d.rotation.y,d.rotation.z,d.rotation.w);
 }
 for(const d of debris.moundSnapshot()){
  if(moundMeshes.has(d.id))continue;
  const m=new THREE.Mesh(cone,moundMaterial);m.position.set(d.x,d.height/2,d.z);m.scale.set(d.radius,d.height,d.radius);scene.add(m);moundMeshes.set(d.id,m);
 }
 document.getElementById('stats').textContent=`Build ${stats.dataset.build} | Tick ${s.tick} | ${s.rigSegments.flat().length} segments | ${paused?'PAUSED':'RUNNING'} | contacts ${s.collisionStats.contacts} | tests ${s.collisionStats.tests} | hits ${s.damageStats.hits} | detached ${s.damageStats.detached} | debris ${debrisMeshes.size} | mounds ${moundMeshes.size} | player ${s.mobilityModes[0]} / ${s.postures[0]} | hop ${s.hopPhases[0]}`;renderer.render(scene,camera);document.getElementById('stats').dataset.tick=String(s.tick);document.getElementById('stats').dataset.posture=s.postures[0];document.getElementById('stats').dataset.mode=s.mobilityModes[0];document.getElementById('stats').dataset.z=String(s.roots[2]);stats.dataset.hop=String(s.hopHeights[0]);if(document.getElementById('stats').dataset.state!=='running')window.labStartup.ready();scheduleFrame();}catch(e){window.labStartup.fail(e);}}
window.labStartup.show('Подготовка первого кадра…');reset();
