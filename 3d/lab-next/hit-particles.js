/** Adapted from v1 hit-effects.js and hit-preset.json. No flash geometry.
 * One bounded instanced pool; fixed simulation time, deterministic cosmetics.
 * The hit point is captured by the sweep; explicit damage uses the previous
 * visible segment center. No gameplay RNG or physics objects. */
export const HIT_PARTICLES=Object.freeze({normal:11,critical:15,sever:30,slots:8,life:.51,spread:1.6,gravity:3.6,lift:.35,colors:[0xb51519,0x7b090d,0xde3031],spark:0xdfb782});
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
export function particleSpec(seed,index,direction,severed=false,critical=false){
 const n=seed+index*131,a=direction+(hash(n)-.5)*HIT_PARTICLES.spread,speed=(.8+hash(n+1)*.7)*(severed?1.2:1);
 return {vx:Math.sin(a)*speed,vy:(hash(n+6)-.25)*speed*.7+HIT_PARTICLES.lift,vz:-Math.cos(a)*speed,
  width:(2+Math.floor(hash(n+2)*3))*.008*4/3,height:(1+Math.floor(hash(n+3)*3))*.008*4/3,
  life:HIT_PARTICLES.life*(severed?1.35:critical?1.2:1)*(.7+.3*hash(n+4)),color:index===0?HIT_PARTICLES.spark:HIT_PARTICLES.colors[Math.floor(hash(n+5)*3)]};
}
export function particleFrame(p,age){
 if(age<0||age>=p.life)return null;
 const q=age/p.life;
 return {offset:[p.vx*age,p.vy*age-HIT_PARTICLES.gravity*age*age,p.vz*age],scale:(1-.35*q)*Math.min(1,(1-q)*4)};
}
export class HitParticles{
 constructor(T,scene){
  this.T=T;this.slots=[];this.serial=0;
  this.mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial({color:0xffffff}),HIT_PARTICLES.slots*HIT_PARTICLES.sever);
  this.mesh.count=0;this.mesh.frustumCulled=false;scene.add(this.mesh);
  this.object=new T.Object3D();this.color=new T.Color();
 }
 reset(){this.slots.length=0;this.serial=0;this.mesh.count=0;}
 record(events,previous,current){
  const contacts=events.filter(e=>e.type==='strike-contact'&&e.point);
  const cuts=events.filter(e=>e.type==='segment-detached'&&e.segmentId);
  // Exactly one burst for the severed branch root, even if caused by a
  // critical hit. Also handle explicit detach events without damage.
  const effects=[...events.filter(e=>e.type==='fighter-damaged'&&!cuts.some(c=>c.fighterId===e.fighterId&&c.segmentId===e.segmentId)),...cuts];
  for(const e of effects){
   const i=previous.fighterIds.indexOf(e.fighterId),j=current.fighterIds.indexOf(e.fighterId);
   const contact=contacts.find(c=>c.fighterId===e.fighterId&&c.attackerId===e.attackerId&&c.segmentId===e.segmentId);
   const p=e.detachedParts?.[0]??e.detachedPose??(i>=0?previous.rigSegments[i]:[]).find(p=>p.id===e.segmentId)??(j>=0?current.rigSegments[j]:[]).find(p=>p.id===e.segmentId);
   const point=contact?.point??p?.a.map((v,k)=>(v+p.b[k])*.5);if(!point)continue;
   const damage=events.find(v=>v.type==='fighter-damaged'&&v.fighterId===e.fighterId&&v.segmentId===e.segmentId);
   const attacker=previous.fighterIds.indexOf(e.attackerId??damage?.attackerId),dx=attacker>=0?point[0]-previous.roots[4*attacker]:0,dz=attacker>=0?point[2]-previous.roots[4*attacker+2]:-1;
   const direction=Math.atan2(dx,-dz),severed=e.type==='segment-detached',critical=e.critical===true;
   const seed=e.tick*173+e.fighterId*31+this.serial++*173;
   if(this.slots.length>=HIT_PARTICLES.slots)this.slots.shift();
   this.slots.push({tick:e.tick,point:[...point],particles:Array.from({length:severed?HIT_PARTICLES.sever:critical?HIT_PARTICLES.critical:HIT_PARTICLES.normal},(_,k)=>particleSpec(seed,k,direction,severed,critical))});
  }
 }
 draw(tick){
  this.slots=this.slots.filter(s=>(tick-s.tick)/60<HIT_PARTICLES.life*1.35);
  let index=0;const o=this.object;
  for(const s of this.slots)for(const p of s.particles){
   const f=particleFrame(p,(tick-s.tick)/60);if(!f)continue;
   o.position.set(s.point[0]+f.offset[0],s.point[1]+f.offset[1],s.point[2]+f.offset[2]);
   o.rotation.set(.3,Math.atan2(p.vx,-p.vz),.2);o.scale.set(p.width*f.scale,p.height*f.scale,p.width*f.scale*.65);o.updateMatrix();
   this.mesh.setMatrixAt(index,o.matrix);this.mesh.setColorAt(index,this.color.setHex(p.color));index++;
  }
  this.mesh.count=index;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  return index;
 }
}
