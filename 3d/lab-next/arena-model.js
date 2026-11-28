import {Box3,Group,Mesh,Vector3} from 'three';
import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';
import {mergeGeometries} from './vendor/utils/BufferGeometryUtils.js';

const directory=new URL('./models/arenas/',import.meta.url);
const file='eccepry_ring_9m.glb';

// Import visuals only: NativeLocation remains the source of all physics,
// navigation, spawns, functional cameras and floor history.
export function prepareRingModel(root){
 root.updateMatrixWorld(true);
 const floor=root.getObjectByName('arena_floor'),wall=root.getObjectByName('arena_wall');
 if(!floor||!wall)throw new Error('Ring requires arena_floor and arena_wall');
 const floorBox=new Box3().setFromObject(floor),wallBox=new Box3().setFromObject(wall);
 const size=floorBox.getSize(new Vector3()),center=floorBox.getCenter(new Vector3());
 if(Math.abs(size.x-9)>.08||Math.abs(size.z-9)>.08||Math.abs(center.x)>.04||Math.abs(center.z)>.04||Math.abs(floorBox.max.y)>.025||
    !Number.isFinite(wallBox.max.y)||wallBox.max.y<3.099)
  throw new Error('Ring must be centered at X/Z=0, diameter 9 m, floor Y=0, walls at least 3.1 m');
 // Bake authored transforms, including the deliberately taller wall.
 const batches=new Map(),result=new Group();
 result.name='Authored ring visual';
 root.traverse(node=>{
  if(!node.isMesh)return;
  if(node.isSkinnedMesh||Array.isArray(node.material)||node.matrixWorld.determinant()<=0)
   throw new Error('Expected static single-material positive-scale meshes');
  const g=node.geometry.clone();
  g.applyMatrix4(node.matrixWorld);
  if(!g.getAttribute('position'))throw new Error('Missing positions');
  const isFloor=node===floor||floor.getObjectById(node.id)!==undefined;
  const layout=Object.keys(g.attributes).sort().map(k=>{
   const a=g.attributes[k];return [k,a.itemSize,a.normalized,a.array.constructor.name].join(':');
  }).join('|');
  const key=[node.material.uuid,isFloor,!!g.index,layout].join('/');
  let batch=batches.get(key);
  if(!batch){batch={material:node.material,isFloor,geometries:[]};batches.set(key,batch);}
  batch.geometries.push(g);
 });
 let triangles=0;
 for(const {material,isFloor,geometries} of batches.values()){
  const merged=geometries.length===1?geometries[0]:mergeGeometries(geometries,false);
  const add=geometry=>{
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const mesh=new Mesh(geometry,material);
   mesh.castShadow=!isFloor;mesh.receiveShadow=true;
   result.add(mesh);
   triangles+=(geometry.index?.count??geometry.getAttribute('position').count)/3;
  };
  if(merged){
   add(merged);
   if(geometries.length>1)for(const geometry of geometries)geometry.dispose();
  }else for(const geometry of geometries)add(geometry);
 }
 if(!result.children.length)throw new Error('Empty ring model');
 result.userData.triangles=triangles;
 return result;
}

export async function loadRingModel(){
 try{
  const response=await fetch(new URL('catalog.json',directory));
  if(!response.ok)return null;
  const {ring}=await response.json();
  if(!ring)return null;
  if(ring!==file)throw new Error('Unexpected ring model filename');
  const gltf=await new GLTFLoader().loadAsync(new URL(ring,directory).href);
  const visual=prepareRingModel(gltf.scene);
  gltf.scene.traverse(node=>{if(node.isMesh)node.geometry.dispose();});
  return visual;
 }catch(error){
  console.warn('Ring model unavailable; using native primitive visuals.',error);
  return null;
 }
}
