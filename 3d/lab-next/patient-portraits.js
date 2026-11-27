import {MeshStandardMaterial,SRGBColorSpace,TextureLoader} from 'three';

const directory=new URL('./portraits/',import.meta.url);

export async function loadPatientPortraits(){
 try{
  const response=await fetch(new URL('catalog.json',directory));
  if(!response.ok)return new Map();
  const files=await response.json();
  if(!Array.isArray(files))return new Map();
  const loader=new TextureLoader();
  const loaded=await Promise.allSettled(files.map(async file=>{
   const map=await loader.loadAsync(new URL(encodeURIComponent(file),directory).href);
   map.colorSpace=SRGBColorSpace;
   return [file,new MeshStandardMaterial({map,roughness:1})];
  }));
  return new Map(loaded.filter(result=>result.status==='fulfilled').map(result=>result.value));
 }catch{
  return new Map();
 }
}

// Use each face once per shuffled set before reusing faces in larger bouts.
export function assignPatientPortraits(fighters,portraits,random=Math.random){
 const catalog=[...portraits.keys()],assigned=new Map();
 if(!catalog.length)return assigned;
 let remaining=[];
 for(const {id} of fighters){
  if(!remaining.length)remaining=[...catalog];
  const index=Math.floor(random()*remaining.length);
  assigned.set(id,remaining.splice(index,1)[0]);
 }
 return assigned;
}
