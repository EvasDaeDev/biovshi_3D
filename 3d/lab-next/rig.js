import * as THREE from 'three';
import {LabSimulationCore,createLabConfig,FixedClock} from '../core/dist/index.js';
import {boneFrame} from '../core/dist/rig/bone-frame.js';
const core=new LabSimulationCore(),clock=new FixedClock(),keys=new Set();
const scene=new THREE.Scene();scene.background=new THREE.Color(0x09100e);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.05,60);camera.position.set(8,6,9);camera.lookAt(0,1,0);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc5dacb,0x263229,2));const lamp=new THREE.DirectionalLight(0xe0c9af,3);lamp.position.set(-3,6,4);scene.add(lamp);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.MeshStandardMaterial({color:0x26362e}));floor.rotation.x=-Math.PI/2;scene.add(floor,new THREE.GridHelper(14,28,0x5d7265,0x34483c));
const meshes=new Map(),sphere=new THREE.SphereGeometry(1,12,8),cylinder=new THREE.CylinderGeometry(1,1,1,12),materials=[new THREE.MeshStandardMaterial({color:0xa6efba}),new THREE.MeshStandardMaterial({color:0xa58c83})];
let paused=false,last=null;
function reset(){core.initialize(createLabConfig(7));clock.reset();keys.clear();last=null;}
const controls=new Set(['KeyW','KeyS','KeyA','KeyD','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
addEventListener('keydown',e=>{if(controls.has(e.code)){e.preventDefault();keys.add(e.code);}});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{keys.clear();clock.reset();last=null;});
const has=(...c)=>Number(c.some(k=>keys.has(k)));
const input=()=>({commands:[{fighterId:0,forward:has('KeyW','ArrowUp')-has('KeyS','ArrowDown'),turn:has('KeyD','ArrowRight')-has('KeyA','ArrowLeft'),sprint:!!has('ShiftLeft','ShiftRight')}]});
document.getElementById('pause').onclick=e=>{paused=!paused;keys.clear();e.target.textContent=paused?'Продолжить':'Пауза';};document.getElementById('reset').onclick=reset;
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
const v=a=>new THREE.Vector3(...a),basis=new THREE.Matrix4();
function frame(now){const dt=last===null?0:(now-last)/1000;last=now;clock.advance(dt,t=>core.step(t,input()),paused||document.hidden);const s=core.getSnapshot();
 s.rigSegments.forEach((parts,i)=>parts.forEach(p=>{const key=s.fighterIds[i]+':'+p.id;const f=boneFrame(p.a,p.b,[Math.sin(s.roots[i*4+3]),0,-Math.cos(s.roots[i*4+3])]);let m=meshes.get(key);if(!m){m=new THREE.Mesh(f.length>1e-8?cylinder:sphere,materials[i===0?0:1]);meshes.set(key,m);scene.add(m);}m.position.copy(v(f.center));if(f.length>1e-8){basis.makeBasis(v(f.x),v(f.y),v(f.z));m.quaternion.setFromRotationMatrix(basis);m.scale.set(p.radius,f.length,p.radius);}else m.scale.setScalar(p.radius);}));
 document.getElementById('stats').textContent=`Tick ${s.tick} | ${s.rigSegments.flat().length} segments | ${paused?'PAUSED':'RUNNING'} | contacts ${s.collisionStats.contacts} | tests ${s.collisionStats.tests} | no damage / Rapier`;renderer.render(scene,camera);requestAnimationFrame(frame);}
reset();requestAnimationFrame(frame);
