import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const core=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(core,'../..');
const site=resolve(repo,'_site'),lab=resolve(site,'3d/lab-next'),vendor=resolve(lab,'vendor');
await rm(site,{recursive:true,force:true});
await mkdir(resolve(site,'3d/core'),{recursive:true});
for(const dir of ['lab','lab-next'])await cp(resolve(repo,'3d',dir),resolve(site,'3d',dir),{recursive:true});
await cp(resolve(core,'dist'),resolve(site,'3d/core/dist'),{recursive:true});
await mkdir(vendor,{recursive:true});
for(const file of ['three.module.js','three.core.js'])await cp(resolve(core,'node_modules/three/build',file),resolve(vendor,file));
await cp(resolve(core,'node_modules/@dimforge/rapier3d-compat/rapier.es.js'),resolve(vendor,'rapier.es.js'));
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
const map=await readFile(resolve(lab,'index.html'),'utf8');
await writeFile(resolve(lab,'rig.html'),rig.replaceAll('./vendor/',prefix+'vendor/').replace("import('./rig.js')","import('"+prefix+"rig.js')").replace('data-build="dev"','data-build="'+release+'"'));
await writeFile(resolve(lab,'index.html'),map.replace('src="./main.js"','src="'+prefix+'main.js"'));
await writeFile(resolve(site,'release.json'),JSON.stringify({release}));
console.log('Lab Next content release:',release);
const html=await readFile(resolve(repo,'3d/index.html'),'utf8');
await writeFile(resolve(site,'3d/index.html'),html);
await writeFile(resolve(site,'index.html'),html.replaceAll('href="./lab/','href="./3d/lab/').replaceAll('href="./lab-next/','href="./3d/lab-next/'));
await writeFile(resolve(site,'.nojekyll'),'');
console.log('Staged offline Lab Next:',lab);
