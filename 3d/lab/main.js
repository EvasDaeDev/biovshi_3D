import * as THREE from 'three';
import RAPIER from '@rapier';
const $=id=>document.getElementById(id), clamp=THREE.MathUtils.clamp, vec=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const up=vec(0,1,0), forward=vec(0,0,-1), watchPos=vec(4.9,3.28,4.95);
let scene,renderer,camera,actorA,actorB,actors=[],playing=false,paused=false,mode='spectator',showcase=false,inspect=0,simTime=0,last=0,frame=0,lastFps=0,fps=0,debugColliders=false,debugObjects=[];
let diagnostics={tests:0,contacts:0,wallContacts:0,collisionMs:0,animationMs:0,renderMs:0,simMs:0,maxFrameMs:0};
let fixedDebt=0,mouseSensitivity=0.0024;
let physicsWorld=null, debris=[],mounds=[],nextDebrisId=0;
const HIT_COOLDOWN=.42, CONTACT_RELEASE=.12, FRACTURE_HITS=3, REST_DELAY=1.0;
let damageStats={hits:0,severed:0,falling:0,mounds:0,physicsMs:0};
const activePairs=new Map(), collisionHits=[];
let orbital=0,headCamPos=vec(0,1.8,0),headCamRot=new THREE.Quaternion();
const keys=new Set();
function fail(e){$('err').style.display='block';$('err').textContent='ОШИБКА: '+(e?.stack||e)}
function mesh(geom,mat,parent,pos){const obj=new THREE.Mesh(geom,mat);obj.position.copy(pos||vec());obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj}
function createScene(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x030806);scene.fog=new THREE.FogExp2(0x09100e,.043);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.insertBefore(renderer.domElement,$('vignette'));
 camera=new THREE.PerspectiveCamera(90,innerWidth/innerHeight,.06,60);camera.rotation.order='YXZ';
 const mat={floor:new THREE.MeshStandardMaterial({color:0x30392e,roughness:.95}),wall:new THREE.MeshStandardMaterial({color:0x394840,roughness:1,side:THREE.DoubleSide}),ceiling:new THREE.MeshStandardMaterial({color:0x151c19}),stone:new THREE.MeshStandardMaterial({color:0x525c53}),lamp:new THREE.MeshBasicMaterial({color:0x9ba990})};
 mesh(new THREE.BoxGeometry(14,.35,14),mat.floor,scene,vec(0,-.19,0));mesh(new THREE.BoxGeometry(11,.26,11),mat.ceiling,scene,vec(0,4.47,0));
 const corners=[[-7,-7],[7,-7],[7,7],[-7,7]];
 for(let i=0;i<4;i++){const [x,z]=corners[i],[xx,zz]=corners[(i+1)%4],a=[x*.785,z*.785],b=[xx*.785,zz*.785];const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([x,0,z,xx,0,zz,b[0],4.3,b[1],x,0,z,b[0],4.3,b[1],a[0],4.3,a[1]],3));g.computeVertexNormals();mesh(g,mat.wall,scene)}
 const grid=new THREE.GridHelper(13,26,0x52645a,0x293930);grid.position.y=.004;scene.add(grid);
 for(const [x,z] of [[-4,-3.8],[3.7,3.5]]){mesh(new THREE.CylinderGeometry(.14,.17,.65,8),mat.stone,scene,vec(x,.33,z))}
 scene.add(new THREE.AmbientLight(0x708a76,.6));const lamp=new THREE.SpotLight(0xc0d2b0,140,19,Math.PI/3,.65,1.4);lamp.position.set(-2.6,4.13,1.5);lamp.target.position.set(0,0,0);lamp.castShadow=true;lamp.shadow.mapSize.set(1024,1024);scene.add(lamp,lamp.target);mesh(new THREE.BoxGeometry(.65,.055,.4),mat.lamp,scene,vec(-2.6,4.15,1.5));const red=new THREE.PointLight(0x7b2822,15,8);red.position.set(4,3,-4);scene.add(red);
}
// Bones are rendered between calculated joints. Each bone's endpoints are the actual kinematic skeleton positions.
function bone(parent,material,r=.085){
 const m=mesh(new THREE.CylinderGeometry(r,r*.93,1,9,1),material,parent);
 // Asymmetrical longitudinal marker exposes any unwanted axial twists.
 const mark=new THREE.Mesh(new THREE.BoxGeometry(r*.27,1.01,r*.11),new THREE.MeshBasicMaterial({color:0x15221b}));
 mark.position.set(r*.91,0,0);m.add(mark);
 return m;
}
// Stable roll: bone's local Z is aligned toward patient's forward vector.
// The old setFromUnitVectors(up, axis) is under-constrained and can spin around the bone itself.
const _axis=vec(),_side=vec(),_front=vec(),_basis=new THREE.Matrix4();
function placeBone(m,a,b,stableForward=forward){
 const mid=a.clone().add(b).multiplyScalar(.5),v=b.clone().sub(a),len=v.length();
 m.position.copy(mid);_axis.copy(v).multiplyScalar(1/Math.max(len,1e-8));
 _front.copy(stableForward).addScaledVector(_axis,-stableForward.dot(_axis));
 if(_front.lengthSq()<1e-7)_front.set(0,0,-1).addScaledVector(_axis,_axis.z);
 if(_front.lengthSq()<1e-7)_front.set(1,0,0).addScaledVector(_axis,-_axis.x);
 _front.normalize();_side.crossVectors(_axis,_front).normalize();
 _front.crossVectors(_side,_axis).normalize();
 _basis.makeBasis(_side,_axis,_front);m.quaternion.setFromRotationMatrix(_basis);
 m.scale.set(1,Math.max(.001,len),1);
}
function makePatient(id,x,z){
 const isPlayer=id===0,m={body:new THREE.MeshStandardMaterial({color:isPlayer?0x68776b:0x7e6e69,roughness:.92,flatShading:true}),limb:new THREE.MeshStandardMaterial({color:isPlayer?0x99a698:0x907c75,roughness:.85,flatShading:true}),joint:new THREE.MeshStandardMaterial({color:0x24312d,metalness:.38,roughness:.62}),head:new THREE.MeshStandardMaterial({color:isPlayer?0xa8b2a1:0x9d8c82,roughness:1,flatShading:true})};
 const root=new THREE.Group();scene.add(root);root.position.set(x,0,z);const hips=new THREE.Group();root.add(hips);const torso=bone(root,m.body,.23);const neck=bone(root,m.joint,.073);const head=mesh(new THREE.IcosahedronGeometry(.18,1),m.head,root);const face=mesh(new THREE.BoxGeometry(.115,.075,.065),m.joint,root);
 const limbs={};for(const side of [-1,1]){const s=side===-1?'L':'R';limbs[s]={upperLeg:bone(root,m.limb,.118),lowerLeg:bone(root,m.limb,.092),foot:mesh(new THREE.BoxGeometry(.18,.085,.28),m.joint,root),upperArm:bone(root,m.limb,.092),lowerArm:bone(root,m.limb,.07),hand:mesh(new THREE.IcosahedronGeometry(.075,1),m.joint,root),knee:mesh(new THREE.IcosahedronGeometry(.102,1),m.joint,root),elbow:mesh(new THREE.IcosahedronGeometry(.082,1),m.joint,root)};}
 return {id,root,torso,neck,head,face,limbs,broken:new Set(),hitCounts:new Map(),position:vec(x,0,z),heading:isPlayer?0:Math.PI,turnRate:0,speed:0,moveAmount:0,walkTime:0,stepSide:'L',colliders:[],wanderSpeed:.35,turnIntent:0,legs:{L:{plant:vec(x-.16,.05,z),start:vec(),target:vec(),phase:0,moving:false},R:{plant:vec(x+.16,.05,z),start:vec(),target:vec(),phase:0,moving:false}},lastHeading:0,gaze:0,torsoAngle:0,headPoint:vec(),hipPoint:vec(),wanderTimer:0,wanderAngle:1.7,shoulderCenter:vec()};
}
function directionFromHeading(yaw){return vec(-Math.sin(yaw),0,-Math.cos(yaw))}
function sideVector(yaw){return vec(Math.cos(yaw),0,-Math.sin(yaw))}
// Two-bone 3D IK with a forward-facing preferred knee direction.
function solveTwoBone(a,b,upperLength,lowerLength,pole){
 const diff=b.clone().sub(a),d=Math.max(.0001,diff.length()),dir=diff.clone().divideScalar(d),reach=clamp(d,.02,upperLength+lowerLength-.008);
 const along=(upperLength*upperLength-lowerLength*lowerLength+reach*reach)/(2*reach);
 const sideways=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
 const bend=pole.clone().addScaledVector(dir,-pole.dot(dir));if(bend.lengthSq()<.000001)bend.set(0,0,-1);bend.normalize();
 return a.clone().addScaledVector(dir,along).addScaledVector(bend,sideways);
}
function wrapAngle(a){return Math.atan2(Math.sin(a),Math.cos(a));}
function advanceActor(a,dt){
 let desiredSpeed=0,turn=0;
 if(a.id===0){
  const forwardAxis=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
  turn=Number(keys.has('KeyA')||keys.has('ArrowLeft'))-Number(keys.has('KeyD')||keys.has('ArrowRight'));
  a.heading+=turn*2.15*dt;
  desiredSpeed=forwardAxis*(keys.has('ShiftLeft')||keys.has('ShiftRight')?1.9:.9);
 }else{
  a.wanderTimer-=dt;
  if(a.wanderTimer<=0){a.wanderTimer=1.5+Math.random()*2.5;a.wanderAngle+=(-1+Math.random()*2);a.wanderSpeed=.24+Math.random()*.43;}
  // Turn away before reaching the sloping arena boundary.
  const wallMargin=4.2;
  if(Math.abs(a.position.x)>wallMargin||Math.abs(a.position.z)>wallMargin){
   const inwardHeading=Math.atan2(a.position.x,a.position.z);
   a.wanderAngle=wrapAngle(inwardHeading);
  }
  const diff=wrapAngle(a.wanderAngle-a.heading);
  a.heading+=clamp(diff,-1.1*dt,1.1*dt);
  desiredSpeed=a.wanderSpeed;
 }
 a.turnRate=THREE.MathUtils.damp(a.turnRate,turn*2.15,6,dt);
 a.speed=THREE.MathUtils.damp(a.speed,desiredSpeed,3,dt);
 a.moveAmount=THREE.MathUtils.damp(a.moveAmount,clamp(Math.abs(a.speed)/1.9,0,1),4,dt);
 const f=directionFromHeading(a.heading),walkDelta=f.clone().multiplyScalar(a.speed*dt);a.position.add(walkDelta);a.position.x=clamp(a.position.x,-5.65,5.65);a.position.z=clamp(a.position.z,-5.65,5.65);a.root.position.copy(a.position);a.root.rotation.y=a.heading;
 const active=Math.abs(a.speed)>.09,side=sideVector(a.heading);
 const elevation=terrainHeight(a.position.x,a.position.z);a.root.position.y=elevation;
 // One planted foot, one traveling foot. World-space stance locks avoid sliding during transitions.
 for(const s of ['L','R']){const leg=a.legs[s];if(leg.moving){leg.phase=Math.min(1,leg.phase+dt*(Math.abs(a.speed)>1.4?3.8:2.8));const ease=leg.phase*leg.phase*(3-2*leg.phase);leg.plant.copy(leg.start).lerp(leg.target,ease);leg.plant.y=terrainHeight(leg.plant.x,leg.plant.z)+.055+Math.sin(Math.PI*leg.phase)*(Math.abs(a.speed)>1.4?.19:.13);if(leg.phase>=1){leg.moving=false;leg.plant.y=terrainHeight(leg.plant.x,leg.plant.z)+.055;}}}
 if(active&&!a.legs.L.moving&&!a.legs.R.moving){const s=a.stepSide,leg=a.legs[s],lateral=(s==='L'?-1:1)*.18;const ideal=a.position.clone().addScaledVector(side,lateral).addScaledVector(f,(a.speed<0?-1:1)*(Math.abs(a.speed)>1.4?.35:.23));ideal.y=terrainHeight(ideal.x,ideal.z)+.055;
  const delta=leg.plant.distanceTo(ideal);if(delta>.23){leg.moving=true;leg.phase=0;leg.start.copy(leg.plant);leg.target.copy(ideal);a.stepSide=s==='L'?'R':'L';}
 }
 if(!active){for(const s of ['L','R']){const leg=a.legs[s];if(!leg.moving&&leg.plant.distanceTo(a.position)>.75){leg.plant.copy(a.position).addScaledVector(side,s==='L'?-.18:.18).addScaledVector(f,-.02);leg.plant.y=terrainHeight(leg.plant.x,leg.plant.z)+.055;}}}
 for(const s of ['L','R'])if(!a.legs[s].moving)a.legs[s].plant.y=terrainHeight(a.legs[s].plant.x,a.legs[s].plant.z)+.055;
 a.walkTime+=dt*Math.abs(a.speed)*5.2;
}
function animateActor(a,t,dt){
 const moving=clamp(a.moveAmount,0,1),sway=Math.sin(t*.88+a.id*1.4),sway2=Math.sin(t*1.37+a.id*.9),breathing=Math.sin(t*1.95+a.id*.6);
 // Drunken-but-human: small independent low-frequency weight shifts and delayed counter-rotation.
 const lateral=(.018*sway+.009*sway2)*(1-moving*.42);const torsoRoll=(.045*Math.sin(t*.88+a.id*.9)+.019*sway2)*(1-moving*.35);
 const forwardLean=moving*.045+Math.sin(t*.72+a.id)*.012;const bob=moving*.018*Math.sin(a.walkTime*2)+breathing*.006;
 const hip=vec(lateral,1.02+bob,0),chest=vec(-lateral*.35,1.51+bob, -.035-forwardLean*.5);
 const hipsWorld=a.root.localToWorld(hip.clone()),chestWorld=a.root.localToWorld(chest.clone());
 // Slight delayed head correction: eye line steadier than the swaying chest.
 const headLocal=vec(-lateral*.65+.012*Math.sin(t*.62+a.id),1.89+bob,-.045-forwardLean*.24);
 const headWorld=a.root.localToWorld(headLocal.clone());a.headPoint.copy(headWorld);a.hipPoint.copy(hipsWorld);a.shoulderCenter.copy(chestWorld);
 const chestPose=chest.clone().add(vec(-torsoRoll*.12,0,forwardLean*.18));const stableForward=forward;
 placeBone(a.torso,hip,chestPose,stableForward);placeBone(a.neck,chestPose,headLocal.clone().add(vec(0,-.14,0)),stableForward);
 a.head.position.copy(headLocal);a.head.rotation.set(-.02+.035*Math.sin(t*.74+a.id), .07*Math.sin(t*.57+a.id),-.32*torsoRoll);
 a.face.position.copy(headLocal).add(vec(0,-.028,-.187));a.face.rotation.copy(a.head.rotation);
 const inspectPose=a.id===0&&inspect>0?Math.min(1,inspect*2):0;
 for(const s of ['L','R']){
  const side=s==='L'?-1:1,arm=a.limbs[s];const hipRoot=hip.clone().add(vec(side*.17,-.055,0)),shoulder=chest.clone().add(vec(side*.34,.05,0));
  const footWorld=a.legs[s].plant.clone(),footLocal=a.root.worldToLocal(footWorld);
  footLocal.y=Math.max(.045,footLocal.y);const ankle=footLocal.clone().add(vec(0,.04,.055));
  const knee=solveTwoBone(hipRoot,ankle,.49,.50,vec(0,.02,-1));placeBone(arm.upperLeg,hipRoot,knee,stableForward);placeBone(arm.lowerLeg,knee,ankle,stableForward);arm.knee.position.copy(knee);arm.foot.position.copy(footLocal);arm.foot.rotation.y=0;
  const swing=moving*Math.sin(a.walkTime+(side===1?Math.PI:0));const elbow=shoulder.clone().add(vec(side*.055,-.31,.08+swing*.12));const hand=shoulder.clone().add(vec(side*.06,-.59,-.06+swing*.22));
  if(inspectPose){elbow.lerp(shoulder.clone().add(vec(side*.12,-.11,-.23)),inspectPose);hand.lerp(shoulder.clone().add(vec(side*.11,-.16,-.45)),inspectPose)}
  placeBone(arm.upperArm,shoulder,elbow,stableForward);placeBone(arm.lowerArm,elbow,hand,stableForward);arm.elbow.position.copy(elbow);arm.hand.position.copy(hand);
 }
}
// Gameplay collision capsules: approximate every rendered anatomical segment.
// Contacts within a patient's own articulated body are ignored intentionally.
const collisionDefinitions=[
 ['torso',.235,.50],['neck',.082,.23],['head',.19,0],
 ...['L','R'].flatMap(s=>[
  ['upperLeg',.124,.49],['lowerLeg',.103,.50],['foot',.13,0],
  ['upperArm',.100,.36],['lowerArm',.083,.32],['hand',.083,0]
 ].map(([name,r,len])=>[s+'.'+name,r,len]))
];
const colliderSphereGeometry=new THREE.SphereGeometry(1,8,6);
const colliderCylinderGeometry=new THREE.CylinderGeometry(1,1,1,8);
const colliderMaterial=new THREE.MeshBasicMaterial({color:0x64f8bc,wireframe:true,transparent:true,opacity:.42,depthTest:false});
function attachColliders(actor){
 const items={torso:actor.torso,neck:actor.neck,head:actor.head};
 for(const side of ['L','R'])for(const k of ['upperLeg','lowerLeg','foot','upperArm','lowerArm','hand'])items[side+'.'+k]=actor.limbs[side][k];
 for(const [name,r] of collisionDefinitions){
  const shape=items[name];
  const dbg=new THREE.Mesh(colliderCylinderGeometry,colliderMaterial);scene.add(dbg);dbg.visible=debugColliders;
  const cap={name,mesh:shape,r,a:vec(),b:vec(),dbg};actor.colliders.push(cap);debugObjects.push(dbg);
 }
}
function updateCapsules(actor){
 actor.root.updateMatrixWorld(true);
 for(const c of actor.colliders){
  if(actor.broken.has(c.name)){c.dbg.visible=false;continue;}
  const m=c.mesh;
  const isSegment=(c.name==='torso'||c.name==='neck'||c.name.includes('Leg')||c.name.includes('Arm'));
  const length=isSegment?m.scale.y:0;
  const axis=up.clone().applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion()));
  const midpoint=m.getWorldPosition(vec());
  c.a.copy(midpoint).addScaledVector(axis,-length*.5);
  c.b.copy(midpoint).addScaledVector(axis,length*.5);
  if(debugColliders){
   c.dbg.visible=true;c.dbg.position.copy(midpoint);c.dbg.quaternion.setFromUnitVectors(up,axis);
   c.dbg.scale.set(c.r,Math.max(.001,length+2*c.r),c.r);
  }else c.dbg.visible=false;
 }
}
// Closest-point vector between two 3D line segments; returns signed separation direction.
function capsuleContact(a,b){
 const ux=a.b.x-a.a.x,uy=a.b.y-a.a.y,uz=a.b.z-a.a.z;
 const vx=b.b.x-b.a.x,vy=b.b.y-b.a.y,vz=b.b.z-b.a.z;
 const wx=a.a.x-b.a.x,wy=a.a.y-b.a.y,wz=a.a.z-b.a.z;
 const A=ux*ux+uy*uy+uz*uz,B=ux*vx+uy*vy+uz*vz,C=vx*vx+vy*vy+vz*vz,D=ux*wx+uy*wy+uz*wz,E=vx*wx+vy*wy+vz*wz;
 let sc=0,tc=0,denom=A*C-B*B;
 if(A<1e-10&&C<1e-10){sc=0;tc=0;}
 else if(A<1e-10){tc=clamp(E/C,0,1);}
 else if(C<1e-10){sc=clamp(-D/A,0,1);}
 else if(denom<1e-10){sc=0;tc=clamp(E/C,0,1);}
 else{sc=clamp((B*E-C*D)/denom,0,1);tc=clamp((A*E-B*D)/denom,0,1);}
 if(A>=1e-10)sc=clamp((B*tc-D)/A,0,1);
 if(C>=1e-10)tc=clamp((B*sc+E)/C,0,1);
 if(A>=1e-10)sc=clamp((B*tc-D)/A,0,1);
 let dx=wx+sc*ux-tc*vx,dy=wy+sc*uy-tc*vy,dz=wz+sc*uz-tc*vz;
 const dist=Math.hypot(dx,dy,dz),penetration=a.r+b.r-dist;
 if(penetration<=0)return null;
 return {dx,dy,dz,dist,penetration};
}
function moveResolved(a,dx,dz){
 a.position.x+=dx;a.position.z+=dz;a.root.position.copy(a.position);
 // Planted feet are world-space anchors and should not get moved by penetration correction.
}
function wallCorrection(a){
 let correctionX=0,correctionZ=0;
 for(const c of a.colliders)if(!a.broken.has(c.name))for(const end of [c.a,c.b]){
  const y=clamp(end.y,0,4.3);
  const inner=6.95-1.47*(y/4.3)-c.r-.08;
  if(end.x>inner)correctionX=Math.min(correctionX,inner-end.x);
  if(end.x< -inner)correctionX=Math.max(correctionX,-inner-end.x);
  if(end.z>inner)correctionZ=Math.min(correctionZ,inner-end.z);
  if(end.z< -inner)correctionZ=Math.max(correctionZ,-inner-end.z);
 }
 if(correctionX||correctionZ){
  moveResolved(a,clamp(correctionX,-.10,.10),clamp(correctionZ,-.10,.10));
  diagnostics.wallContacts++;
 }
 return !!(correctionX||correctionZ);
}
function solveCollisions(dt){
 const started=performance.now();diagnostics.tests=0;diagnostics.contacts=0;diagnostics.wallContacts=0;
 // Recalculate collision poses after root corrections, otherwise the 2nd pass uses stale geometry.
 for(let iteration=0;iteration<3;iteration++){
  for(const a of actors){animateActor(a,simTime,dt);updateCapsules(a);wallCorrection(a);}
  for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
   const a=actors[i],b=actors[j];
   if(a.position.distanceToSquared(b.position)>4.7*4.7)continue;
   let cx=0,cz=0,count=0;
   for(const ac of a.colliders)if(!a.broken.has(ac.name))for(const bc of b.colliders)if(!b.broken.has(bc.name)){
    // Cheap bounding sphere check before a full capsule distance test.
    const mx=(ac.a.x+ac.b.x-bc.a.x-bc.b.x)*.5,mz=(ac.a.z+ac.b.z-bc.a.z-bc.b.z)*.5;
    const ra=ac.a.distanceTo(ac.b)*.5+ac.r,rb=bc.a.distanceTo(bc.b)*.5+bc.r;
    if(mx*mx+mz*mz>(ra+rb)*(ra+rb))continue;
    diagnostics.tests++;
    const contact=capsuleContact(ac,bc);
    if(!contact)continue;
    diagnostics.contacts++;
    if(iteration===0)collisionHits.push({a,ac,b,bc,contact});
    let nx=contact.dx,nz=contact.dz,len=Math.hypot(nx,nz);
    if(len<1e-5){nx=a.position.x-b.position.x;nz=a.position.z-b.position.z;len=Math.hypot(nx,nz);}
    if(len<1e-5){nx=1;nz=0;len=1;}
    // Vertical overlap can be legitimate (arms over shoulders); only apply a horizontal correction.
    if(contact.dist>1e-5&&len/contact.dist<.23)continue;
    const push=Math.min(.11,contact.penetration*.36);
    cx+=nx/len*push;cz+=nz/len*push;count++;
   }
   if(count){
    const factor=1/Math.sqrt(count);
    moveResolved(a,clamp(cx*factor*.5,-.10,.10),clamp(cz*factor*.5,-.10,.10));
    moveResolved(b,clamp(-cx*factor*.5,-.10,.10),clamp(-cz*factor*.5,-.10,.10));
   }
  }
 }
 for(const a of actors){animateActor(a,simTime,dt);updateCapsules(a);}
 processHits();
 diagnostics.collisionMs=performance.now()-started;
}
function updateCamera(dt){const a=actorA;
 if(mode==='spectator'){
  // Permanently fixed inside all four inward-sloping walls; only orientation follows the patient.
  const cameraAnchor=showcase?vec(2.6,2.75,3.7):watchPos;const safeY=clamp(cameraAnchor.y,1,3.75),interior=6.75-(6.75-5.35)*(safeY/4.3)-.32;
  camera.position.set(clamp(cameraAnchor.x,-interior,interior),safeY,clamp(cameraAnchor.z,-interior,interior));
  const target=a.position.clone().add(vec(0,1.2,0));const matrix=new THREE.Matrix4().lookAt(camera.position,target,up),targetQ=new THREE.Quaternion().setFromRotationMatrix(matrix);
  camera.quaternion.slerp(targetQ,1-Math.exp(-dt*2.7));camera.fov=104;actorA.head.visible=!actorA.broken.has('head');actorA.face.visible=!actorA.broken.has('head');
 }else{
  const target=a.headPoint.clone().add(vec(0,.105,-.07).applyAxisAngle(up,a.heading));
  headCamPos.lerp(target,1-Math.exp(-dt*12));camera.position.copy(headCamPos);
  // The skull drives the camera but the roll is deliberately attenuated.
  const yaw=a.heading+.025*Math.sin(simTime*.62),roll=.013*Math.sin(simTime*.88)+a.turnRate*.009,pitch=inspect>0?.34:.035*Math.sin(simTime*.94);
  const desired=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,roll,'YXZ'));
  headCamRot.slerp(desired,1-Math.exp(-dt*9));camera.quaternion.copy(headCamRot);camera.fov=106;actorA.head.visible=false;actorA.face.visible=false;
 }
 camera.updateProjectionMatrix();
}
function info(){const a=actorA;const p=a.position,d=Math.min(...actors.filter(x=>x!==a).map(x=>p.distanceTo(x.position)));
 $('stats').textContent=`КАМЕРА: ${mode==='spectator'?'НАБЛЮДЕНИЕ / ФИКСИРОВАНА':'НА ГОЛОВЕ'}\n`+
 `ПАЦИЕНТ: ${Math.abs(a.speed)>.18?'ИДЁТ':'АЙДЛ / НЕУСТОЙЧИВЫЙ'}\n`+
 `СКЕЛЕТ: КИНЕМАТИКА + ДВУХКОСТНАЯ IK\n`+
 `ДИСТАНЦИЯ: ${d.toFixed(2)} м\n`+
 `СТОПЫ: ${['L','R'].map(s=>a.legs[s].moving?'ШАГ':'ОПОРА').join(' / ')}\n`+
 `СКОРОСТЬ: ${a.speed.toFixed(2)} м/с · УГОЛ: ${(a.heading*180/Math.PI%360).toFixed(0)}°\n`+
 `ПАЦИЕНТЫ: ${actors.length} · КАПСУЛЫ: ${actors.reduce((n,a)=>n+a.colliders.length-a.broken.size,0)}\n`+
 `УДАРЫ: ${damageStats.hits} · ОТРЫВЫ: ${damageStats.severed} · ОБЛОМКИ: ${debris.length} · НАСЫПИ: ${mounds.length}\n`+
 `КОНТАКТЫ: ${diagnostics.contacts} · ПРОВЕРКИ: ${diagnostics.tests} · СТЕНЫ: ${diagnostics.wallContacts}\n`+
 `CPU: COLL ${diagnostics.collisionMs.toFixed(2)} ms · PHYS ${damageStats.physicsMs.toFixed(2)} ms · RENDER ${diagnostics.renderMs.toFixed(2)} ms · FPS ${fps}\n`+
 `РЕЖИМ: ${paused?'ПАУЗА':'АНИМАЦИЯ'} · DEBUG ${debugColliders?'ON':'OFF'}`;
 $('fps').textContent=`FPS ${fps} · THREE.JS · NO RAGDOLL`;
}
// Detached parts alone use actual Rapier dynamics. Living rigs remain kinematic.
function createDebrisWorld(){
 physicsWorld=new RAPIER.World({x:0,y:-9.81,z:0});
 physicsWorld.timestep=1/60;
 const ground=physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.19,0));
 physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(7,.19,7).setFriction(.95),ground);
 for(const [x,z,w,d] of [[0,-6.7,7,.25],[0,6.7,7,.25],[-6.7,0,.25,7],[6.7,0,.25,7]]){
  const rb=physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,2.1,z));
  physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(w,2.1,d),rb);
 }
}
function terrainHeight(x,z){
 let height=0;
 for(const m of mounds){
  const distance=Math.hypot(x-m.x,z-m.z);
  if(distance<m.radius)height=Math.max(height,m.height*(1-distance/m.radius));
 }
 return height;
}
function descendantsOf(name){
 if(name==='head')return ['head'];
 if(name==='neck')return ['neck','head'];
 const p=name.split('.');if(p.length!==2)return [name];
 const [side,part]=p;
 if(part==='upperArm')return [name,side+'.lowerArm',side+'.hand'];
 if(part==='lowerArm')return [name,side+'.hand'];
 if(part==='upperLeg')return [name,side+'.lowerLeg',side+'.foot'];
 if(part==='lowerLeg')return [name,side+'.foot'];
 return [name];
}
function sever(actor,name,impulseNormal){
 if(name==='torso'||actor.broken.has(name))return;
 for(const key of descendantsOf(name)){
  if(actor.broken.has(key))continue;
  const cap=actor.colliders.find(c=>c.name===key);if(!cap)continue;
  actor.broken.add(key);cap.mesh.updateWorldMatrix(true,false);
  const worldPosition=cap.mesh.getWorldPosition(vec());
  const worldQuaternion=cap.mesh.getWorldQuaternion(new THREE.Quaternion());
  // Make a fresh static mesh for the dropped segment, preserve the animated mesh geometry.
  const falling=cap.mesh.clone(false);falling.geometry=cap.mesh.geometry.clone();
  falling.position.copy(worldPosition);falling.quaternion.copy(worldQuaternion);
  const length=cap.a.distanceTo(cap.b);
  falling.scale.set(1,Math.max(length,.05),1);falling.castShadow=true;falling.receiveShadow=true;scene.add(falling);
  cap.mesh.visible=false;cap.dbg.visible=false;
  if(key==='head'){actor.face.visible=false;}
  const rb=physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(worldPosition.x,worldPosition.y,worldPosition.z)
   .setRotation({x:worldQuaternion.x,y:worldQuaternion.y,z:worldQuaternion.z,w:worldQuaternion.w})
   .setLinearDamping(.6).setAngularDamping(1.25));
  // The previous density of 2.5 kg/m^3 gave a small arm a mass of only
  // ~0.02 kg. A 1 N*s impulse then produced tens of metres per second.
  // Give each detached piece an explicit kg mass instead of volume-dependent
  // toy density. This is a visual/physics test, not a biomechanical mass model.
  const bodyMass=clamp(0.9+length*2.1,0.9,2.8);
  const desc=length>.11?RAPIER.ColliderDesc.capsule(length*.5,cap.r):RAPIER.ColliderDesc.ball(cap.r);
  // Detached pieces may initially overlap at a severing joint. Preventing
  // debris-vs-debris contact avoids explosive solver separation; still collide
  // with the floor, boundaries and all baked static mounds (default group 1).
  const DEBRIS_GROUP=0x0002, STATIC_GROUP=0x0001;
  physicsWorld.createCollider(desc.setMass(bodyMass).setFriction(.8)
   .setRestitution(0).setCollisionGroups((DEBRIS_GROUP<<16)|STATIC_GROUP),rb);
  // Specify launch *velocity*, not mass-amplified impulse. A modest sideways
  // velocity and slight upward lift allow readable, gravity-driven falls.
  const normal=impulseNormal.clone();normal.y=0;
  if(normal.lengthSq()<1e-6)normal.set(1,0,0);
  normal.normalize();
  const lateralSpeed=.32+Math.random()*.28;
  rb.setLinvel({x:normal.x*lateralSpeed,y:.12+Math.random()*.18,z:normal.z*lateralSpeed},true);
  const spinAxis=vec(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize();
  rb.setAngvel({x:spinAxis.x*1.4,y:spinAxis.y*1.4,z:spinAxis.z*1.4},true);
  debris.push({id:nextDebrisId++,rb,mesh:falling,r:cap.r,length,still:0,age:0});
  damageStats.severed++;
  $('status').textContent='ОТРЫВ '+actor.id+' / '+key+' — динамическое падение, затем статичный пологий конус.';
 }
}
function processHits(){
 const seen=new Set();
 for(const hit of collisionHits){
  // Stable episode identity: one sustained overlap is NOT three impacts.
  const {a,ac,b,bc,contact}=hit;
  for(const [victim,part,other] of [[a,ac,b],[b,bc,a]]){
   if(part.name==='torso'||victim.broken.has(part.name))continue;
   const key=victim.id+':'+part.name+'|'+other.id;
   if(seen.has(key))continue;seen.add(key);
   const record=activePairs.get(key);
   if(!record||simTime-record.lastSeen>CONTACT_RELEASE){
    if(!record||simTime-record.lastHit>=HIT_COOLDOWN){
     const count=(victim.hitCounts.get(part.name)||0)+1;
     victim.hitCounts.set(part.name,count);damageStats.hits++;
     if(count>=FRACTURE_HITS){
      let dx=victim.position.x-other.position.x,dz=victim.position.z-other.position.z;
      const n=vec(dx,.15,dz).normalize();sever(victim,part.name,n);
     }
     activePairs.set(key,{lastSeen:simTime,lastHit:simTime});
    }else activePairs.set(key,{...record,lastSeen:simTime});
   }else record.lastSeen=simTime;
  }
 }
 collisionHits.length=0;
 for(const [key,rec] of activePairs)if(simTime-rec.lastSeen>2)activePairs.delete(key);
}
function bakeDebris(d){
 const t=d.rb.translation();
 const x=clamp(t.x,-6.25,6.25),z=clamp(t.z,-6.25,6.25);
 const radius=clamp(d.length*.65+d.r*2.2,.30,.77),height=clamp(d.r*2+d.length*.18,.08,.30);
 // Physically removed after rest, replaced by a fixed conical obstruction.
 physicsWorld.removeRigidBody(d.rb);
 const visual=new THREE.Mesh(new THREE.ConeGeometry(radius,height,14,1),new THREE.MeshStandardMaterial({color:0x4d574c,roughness:1,flatShading:true}));
 visual.position.set(x,height/2,z);visual.castShadow=true;visual.receiveShadow=true;scene.add(visual);
 const rb=physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,height/2,z));
 physicsWorld.createCollider(RAPIER.ColliderDesc.cone(height/2,radius).setFriction(1.1),rb);
 mounds.push({x,z,radius,height,mesh:visual,rb});
 scene.remove(d.mesh);d.mesh.geometry.dispose();damageStats.mounds=mounds.length;
}
function stepDebris(dt){
 const st=performance.now();physicsWorld.step();
 for(let i=debris.length-1;i>=0;i--){const d=debris[i],t=d.rb.translation(),q=d.rb.rotation(),v=d.rb.linvel(),w=d.rb.angvel();
  d.mesh.position.set(t.x,t.y,t.z);d.mesh.quaternion.set(q.x,q.y,q.z,q.w);d.age+=dt;
  const speed=Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z)*.12;
  // Project the capsule half-length onto gravity to estimate lowest point.
  // Rapier's capsule axis is local +Y, so vertical half-extent depends on q.
  const verticalAxis=1-2*(q.x*q.x+q.z*q.z);
  const bottom=t.y-(Math.abs(verticalAxis)*d.length*.5+d.r);
  const hasContact=bottom<=.045;
  d.still=(hasContact&&speed<.20)?d.still+dt:0;
  if(d.still>=REST_DELAY||(d.age>12&&hasContact)){bakeDebris(d);debris.splice(i,1);}
 }
 damageStats.falling=debris.length;damageStats.physicsMs=performance.now()-st;
}
function clearDebris(){
 if(!physicsWorld)return;
 for(const d of debris){scene.remove(d.mesh);d.mesh.geometry.dispose();physicsWorld.removeRigidBody(d.rb);}debris=[];
 for(const m of mounds){scene.remove(m.mesh);m.mesh.geometry.dispose();m.mesh.material.dispose();physicsWorld.removeRigidBody(m.rb);}mounds=[];
}
function reset(){
 clearDebris();activePairs.clear();collisionHits.length=0;damageStats={hits:0,severed:0,falling:0,mounds:0,physicsMs:0};
 for(const a of actors){a.broken.clear();a.hitCounts.clear();for(const c of a.colliders){c.mesh.visible=true;c.dbg.visible=debugColliders;}a.face.visible=true;a.head.visible=true;}
 const starts=[[0,1.4],[-3,-3.3],[2.8,-3.4],[3.5,.8],[-3.7,.6],[-2.7,3.4],[2.4,3.4],[.5,-1.6]];
 for(const a of actors){const [x,z]=starts[a.id];a.position.set(x,0,z);a.heading=a.id?Math.PI+a.id*.42:0;a.speed=0;a.moveAmount=0;a.wanderAngle=a.heading;a.wanderTimer=1+a.id*.3;a.root.position.copy(a.position);a.root.rotation.y=a.heading;for(const s of ['L','R']){const leg=a.legs[s];leg.moving=false;leg.plant.copy(a.position).add(vec(s==='L'?-.18:.18,.055,0));}}
 inspect=0;keys.clear();fixedDebt=0;$('status').textContent='Все восемь пациентов восстановлены.';
}
function frameLoop(ms){
 requestAnimationFrame(frameLoop);if(!playing)return;
 const dt=clamp((ms-last)/1000||0,0,.08);last=ms;
 if(!paused){
  fixedDebt=Math.min(.15,fixedDebt+dt);let n=0;
  while(fixedDebt>=1/60&&n<6){
   const t=performance.now();simTime+=1/60;
   for(const a of actors)advanceActor(a,1/60);
   if(inspect>0)inspect=Math.max(0,inspect-1/60);
   solveCollisions(1/60);stepDebris(1/60);diagnostics.simMs=performance.now()-t;
   fixedDebt-=1/60;n++;
  }
 }
 updateCamera(dt);const before=performance.now();renderer.render(scene,camera);diagnostics.renderMs=performance.now()-before;
 frame++;if(ms-lastFps>600){fps=Math.round(frame*1000/(ms-lastFps));frame=0;lastFps=ms}info();
}
function install(){
 const actions={
  KeyC:()=>{mode=mode==='spectator'?'head':'spectator';showcase=false;$('status').textContent='Камера: '+mode;},
  Digit1:()=>{mode='spectator';showcase=false;},
  Digit2:()=>{mode='spectator';showcase=true;},
  KeyV:()=>inspect=2.1,KeyG:reset,KeyP:()=>paused=!paused,
  KeyT:()=>{if(actors[1])sever(actors[1], 'R.lowerArm', vec(0,1,0));},
  KeyH:()=>{debugColliders=!debugColliders;$('status').textContent='Коллайдеры: '+(debugColliders?'показаны':'скрыты');}
 };
 addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(!e.repeat&&actions[e.code])actions[e.code]();
 });
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
 addEventListener('mousemove',e=>{
  if(!playing||paused)return;
  if(document.pointerLockElement===renderer.domElement){actorA.heading-=e.movementX*mouseSensitivity;}
 });
 renderer.domElement.addEventListener('click',()=>renderer.domElement.requestPointerLock?.());
 addEventListener('keydown',e=>{if(e.code==='Escape'&&document.pointerLockElement)document.exitPointerLock?.()});
 for(const [id,fn] of Object.entries({cam:actions.KeyC,view:actions.Digit1,idle:actions.Digit2,inspect:actions.KeyV,reset:actions.KeyG,pause:actions.KeyP,hitbox:actions.KeyH,sever:actions.KeyT}))$(id).onclick=fn;
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
}
$('begin').onclick=async()=>{try{await RAPIER.init();createScene();createDebrisWorld();actors=[];for(let i=0;i<8;i++){const a=makePatient(i,0,0);actors.push(a);attachColliders(a);}actorA=actors[0];actorB=actors[1];reset();for(const a of actors){animateActor(a,0,0);updateCapsules(a);}install();playing=true;$('menu').remove();last=performance.now();lastFps=last;requestAnimationFrame(frameLoop)}catch(e){fail(e)}};
