import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ASSETS} from '../../../src/assets/manifest.js';
import {buildLocationCatalog} from './catalog-locations.mjs';
const core=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(core,'../..');
const site=resolve(repo,'_site'),lab=resolve(site,'3d/lab-next'),vendor=resolve(lab,'vendor');
await rm(site,{recursive:true,force:true});
await mkdir(resolve(site,'3d/core'),{recursive:true});
await cp(resolve(repo,'3d/lab-next'),lab,{recursive:true});
const portraitDir=resolve(lab,'portraits');
const portraitFiles=(await readdir(portraitDir,{withFileTypes:true}))
 .filter(file=>file.isFile()&&!file.name.startsWith('.')&&/\.(webp|png|jpe?g|avif)$/i.test(file.name))
 .map(file=>file.name).sort();
await writeFile(resolve(portraitDir,'catalog.json'),JSON.stringify(portraitFiles));
await cp(resolve(core,'dist'),resolve(site,'3d/core/dist'),{recursive:true});
// v1 authored polygons, vetted spawns and patrols become a static native JSON
// asset before computing the content-addressed release. Never ship v1 runtime.
const catalog=await buildLocationCatalog();
await writeFile(resolve(lab,'location-catalog.json'),JSON.stringify(catalog));
const modelDir=resolve(lab,'models/patients');
await mkdir(modelDir,{recursive:true});
const modelFiles=await readdir(modelDir,{withFileTypes:true});
await writeFile(resolve(modelDir,'catalog.json'),JSON.stringify({active:modelFiles.some(f=>f.isFile()&&f.name==='dummy02.glb')?'dummy02.glb':null}));
const arenaDir=resolve(lab,'models/arenas');
await mkdir(arenaDir,{recursive:true});
const arenaFiles=await readdir(arenaDir,{withFileTypes:true});
await writeFile(resolve(arenaDir,'catalog.json'),JSON.stringify({ring:arenaFiles.some(f=>f.isFile()&&f.name==='eccepry_ring_9m.glb')?'eccepry_ring_9m.glb':null}));
await mkdir(vendor,{recursive:true});
for(const [folder,file] of [['loaders','GLTFLoader.js'],['utils','BufferGeometryUtils.js']]){
 await mkdir(resolve(vendor,folder),{recursive:true});
 await cp(resolve(core,'node_modules/three/examples/jsm',folder,file),resolve(vendor,folder,file));
}
await mkdir(resolve(lab,'audio'),{recursive:true});
const sounds=Object.entries(ASSETS.sounds).filter(([key])=>key!=='music'&&key!=='menuMusic');
await Promise.all([...new Set(sounds.map(([,file])=>file))].map(file=>cp(resolve(repo,'public',file),resolve(lab,'audio',basename(file)))));
await writeFile(resolve(lab,'audio/catalog.json'),JSON.stringify(Object.fromEntries(sounds.map(([key,file])=>[key,basename(file)]))));
for(const file of ['three.module.js','three.core.js'])await cp(resolve(core,'node_modules/three/build',file),resolve(vendor,file));
await cp(resolve(core,'node_modules/@dimforge/rapier3d-compat/rapier.es.js'),resolve(vendor,'rapier.es.js'));
await cp(resolve(core,'node_modules/three/examples/jsm/controls/TransformControls.js'),resolve(vendor,'TransformControls.js'));
await cp(resolve(core,'node_modules/three/LICENSE'),resolve(vendor,'three-LICENSE.txt'));
// All browser module URLs belong to a single content-addressed release.
// Keep stable HTML entry points; copy the complete import graph together.
const hash=createHash('sha256');
async function hashTree(dir,prefix=''){
 for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const path=resolve(dir,entry.name),name=prefix+entry.name;
  if(entry.isDirectory())await hashTree(path,name+'/');
  else if(entry.isFile()){hash.update(name+'\0');hash.update(await readFile(path));hash.update('\0');}
 }
}
await hashTree(lab,'lab-next/');await hashTree(resolve(site,'3d/core/dist'),'core/dist/');
const release=hash.digest('hex').slice(0,20),releaseDir=resolve(site,'releases',release,'3d');
await mkdir(resolve(releaseDir,'core'),{recursive:true});
await cp(lab,resolve(releaseDir,'lab-next'),{recursive:true});
await cp(resolve(site,'3d/core/dist'),resolve(releaseDir,'core/dist'),{recursive:true});
const prefix='../../releases/'+release+'/3d/lab-next/';
const rig=await readFile(resolve(lab,'rig.html'),'utf8');
const editor=await readFile(resolve(lab,'pose-editor.html'),'utf8');
const play=await readFile(resolve(lab,'play.html'),'utf8');
const map=await readFile(resolve(lab,'index.html'),'utf8');
await writeFile(resolve(lab,'rig.html'),rig.replaceAll('./vendor/',prefix+'vendor/').replace("import('./rig.js')","import('"+prefix+"rig.js')").replace('data-build="dev"','data-build="'+release+'"'));
await writeFile(resolve(lab,'pose-editor.html'),editor.replaceAll('./vendor/',prefix+'vendor/').replace('src="./pose-editor.js"','src="'+prefix+'pose-editor.js"'));
await writeFile(resolve(lab,'play.html'),play.replace('src="./play.js"','src="'+prefix+'play.js"'));
await writeFile(resolve(lab,'index.html'),map.replace('src="./main.js"','src="'+prefix+'main.js"'));
await writeFile(resolve(site,'release.json'),JSON.stringify({release}));
console.log('Lab Next content release:',release);
const html=await readFile(resolve(repo,'3d/index.html'),'utf8');
await writeFile(resolve(site,'3d/index.html'),html);
await writeFile(resolve(site,'index.html'),html.replaceAll('href="./lab-next/','href="./3d/lab-next/'));
await writeFile(resolve(site,'.nojekyll'),'');
console.log('Staged offline Lab Next:',lab);
