import {Group,Mesh,Matrix4,Vector3} from 'three';
import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';
import {LAB_SEGMENTS} from '../core/dist/rig/anatomy.js';
import {boneFrame} from '../core/dist/rig/bone-frame.js';

const directory=new URL('./models/patients/',import.meta.url);
const ids=new Set(LAB_SEGMENTS.map(p=>p.id));
// Blender Z-up/-Y-front exports glTF Y-up/+Z-front. The game faces -Z
// with the same L/R identifiers: reflect Z and reverse triangle winding.
const mirror=new Matrix4().makeScale(1,1,-1);
const point=v=>new Vector3(v[0],v[2],v[1]);
const validPoint=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
function bake(mesh,transform){
 const geometry=mesh.geometry.clone();
 geometry.applyMatrix4(transform.clone().multiply(mirror).multiply(mesh.matrixWorld));
 const count=geometry.getAttribute('position').count;
 if(!geometry.index)geometry.setIndex(Array.from({length:count},(_,i)=>i));
 const index=geometry.index;
 if(index.count%3)throw new Error('Expected triangles');
 for(let i=0;i<index.count;i+=3){
  const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);
 }
 index.needsUpdate=true;
 const tangent=geometry.getAttribute('tangent');
 if(tangent)for(let i=0;i<tangent.count;i++)tangent.setW(i,-tangent.getW(i));
 geometry.computeBoundingBox();geometry.computeBoundingSphere();
 return geometry;
}
export function preparePatientModel(root){
 root.updateMatrixWorld(true);
 const nodes=new Map();
 let face;
 root.traverse(node=>{
  const id=node.userData.segment_id;
  if(ids.has(id)){
   if(nodes.has(id))throw new Error('Duplicate segment '+id);
   nodes.set(id,node);
  }
  if(node.name==='face'){
   if(face)throw new Error('Duplicate face');
   face=node;
  }
 });
 if(nodes.size!==ids.size||!face)throw new Error('Expected all 17 segment_id nodes and face');
 const refs=new Map();
 for(const [id,node] of nodes){
  const {bone_a_blender:a,bone_b_blender:b,bone_length_m:length,radius_m:radius}=node.userData;
  if(!validPoint(a)||!validPoint(b)||!Number.isFinite(length)||length<0||!Number.isFinite(radius)||radius<=0)throw new Error('Missing bind metadata: '+id);
  const pa=point(a),pb=point(b);
  if(Math.abs(pa.distanceTo(pb)-length)>.001)throw new Error('Invalid bind length: '+id);
  refs.set(id,{a:pa,b:pb,length,radius});
 }
 const entries=new Map();
 for(const [id,node] of nodes){
  const {a,b,length,radius}=refs.get(id);
  const midpoint=a.clone().lerp(b,.5);
  // Authored origin is a joint, except the pelvis uses its midpoint,
  // chest the abdomen tip, and head the neck tip. Honor edited origins.
  const pivot=id==='pelvis'?midpoint:id==='chest'?refs.get('abdomen').b:id==='head'?refs.get('neck').b:a;
  const center=node.getWorldPosition(new Vector3()).applyMatrix4(mirror).add(midpoint.clone().sub(pivot));
  const arm=id.endsWith('.hand')?refs.get(id.replace('.hand','.lowerArm')):null;
  const axis=arm?arm.b.clone().sub(arm.a):b.clone().sub(a);
  if(axis.lengthSq()<1e-10)axis.set(0,1,0);
  // Torso vertical frames in anatomicalBoneFrame use +Z; the other
  // bind frames use -Z. A horizontal T-pose arm uses the hanging-arm
  // roll convention so it faces forward in normal locomotion.
  const front=id==='abdomen'||id==='neck'?[0,0,1]:[0,0,-1];
  const f=boneFrame([0,0,0],axis.toArray(),front);
  const bindFrame=new Matrix4().makeBasis(new Vector3(...f.x),new Vector3(...f.y),new Vector3(...f.z)).setPosition(center);
  const transform=bindFrame.clone().invert();
  const templates=[];
  const add=(parent,isFace)=>parent.traverse(mesh=>{
   if(!mesh.isMesh||(!isFace&&mesh===face))return;
   if(Array.isArray(mesh.material))throw new Error('Unsupported grouped material: '+id);
   if(isFace&&!mesh.geometry.getAttribute('uv'))throw new Error('Face requires UVs');
   templates.push({geometry:bake(mesh,transform),material:mesh.material,isFace});
  });
  add(node,false);
  if(!templates.length)throw new Error('No geometry: '+id);
  if(id==='head'){
   const before=templates.length;add(face,true);
   if(templates.length!==before+1)throw new Error('Expected one face primitive');
  }
  entries.set(id,{templates,length,radius,bindFrame});
 }
 return {
  create(id,radius,length,palette,portrait){
   const entry=entries.get(id);
   if(!entry)throw new Error('Unknown segment '+id);
   const group=new Group(),bodyMaterials=[];
   const radial=radius/entry.radius,axial=entry.length>0?length/entry.length:radial;
   for(const t of entry.templates){
    if(t.isFace&&!portrait)continue;
    const material=t.isFace?portrait:t.material.clone();
    if(!t.isFace){
     // Preserve authored shading/materials and existing fighter distinction.
     material.color.multiply(palette.color);
     bodyMaterials.push({material,base:material.color.clone(),hsl:material.color.getHSL({})});
    }
    const mesh=new Mesh(t.geometry,material);
    mesh.name=t.isFace?'portrait':'segment';
    mesh.userData.segment=id;
    mesh.scale.set(radial,axial,radial);
    group.add(mesh);
   }
   group.userData.bodyMaterials=bodyMaterials;
   return group;
  },
  createReference(palette,portrait){
   const reference=new Group();
   for(const [id,{radius,length,bindFrame}] of entries){
    const segment=this.create(id,radius,length,palette,portrait);
    segment.matrix.copy(bindFrame);
    segment.matrixAutoUpdate=false;
    reference.add(segment);
   }
   return reference;
  }
 };
}
export async function loadPatientModel(){
 try{
  const catalog=await fetch(new URL('catalog.json',directory));
  if(!catalog.ok)return null;
  const {active}=await catalog.json();
  if(!active)return null;
  if(active!=='dummy02.glb')throw new Error('Unknown active model');
  const gltf=await new GLTFLoader().loadAsync(new URL(active,directory).href);
  return preparePatientModel(gltf.scene);
 }catch(error){
  console.warn('Patient model unavailable; using primitive visuals.',error);
  return null;
 }
}
export function disposePatientVisual(group){
 const materials=group.userData.bodyMaterials;
 if(materials)for(const {material} of materials)material.dispose();
 else group.children[0]?.material.dispose();
}
export function paintModel(group,tint,pulse,saturation,red){
 const materials=group.userData.bodyMaterials;
 if(!materials)return false;
 const mix=Math.max(pulse,tint.critical?0:tint.strength);
 for(const {material,base,hsl} of materials){
  if(saturation===1)material.color.copy(base);
  else material.color.setHSL(hsl.h,hsl.s*saturation,hsl.l);
  material.emissive?.setRGB(tint.critical?tint.strength:0,0,0);
  if(mix)material.color.lerp(red,mix);
 }
 return true;
}
