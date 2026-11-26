import {poolRadius} from './body-pool.js';
/** Visual-only stains, one bounded instanced mesh. No collider or terrain. */
export class OilMarks {
 constructor(THREE,scene){
  this.THREE=THREE;this.mesh=new THREE.InstancedMesh(new THREE.CircleGeometry(1,32),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.82,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),2000);
  this.mesh.count=0;this.mesh.frustumCulled=false;scene.add(this.mesh);
  this.dummy=new THREE.Object3D();this.dummy.rotation.x=-Math.PI/2;this.color=new THREE.Color();this.lastTick=-1;this.lastId=-1;
 }
 reset(){this.mesh.count=0;this.lastTick=-1;this.lastId=-1;}
 draw(marks,tick){
  const last=marks.at(-1)?.id??-1;
  const growing=marks.some(p=>p.radius!==undefined&&tick-p.tick<180);
  if(!growing&&last===this.lastId&&Math.floor(tick/15)===Math.floor(this.lastTick/15))return;
  this.lastId=last;this.lastTick=tick;
  this.mesh.count=marks.length;
  marks.forEach((p,i)=>{
   const age=Math.max(0,(tick-p.tick)/60),r=p.radius===undefined?.035*(1+.5*Math.min(1,age/3)):poolRadius(p.radius,age);
   this.dummy.position.set(p.point[0],p.point[1]+.008,p.point[2]);this.dummy.scale.set(r,r,1);this.dummy.updateMatrix();
   this.mesh.setMatrixAt(i,this.dummy.matrix);
   this.color.setHex(0x380607).lerp(new this.THREE.Color(0x160c09),Math.min(1,age/18));this.mesh.setColorAt(i,this.color);
  });
  this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
 }
}
