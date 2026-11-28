import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,appendFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Only active visual assets, never pose JSON, terrain, scripts or executable files.
export function isVisualAsset(path){
 return path==='3d/lab-next/models/arenas/eccepry_ring_9m.glb'||
 path==='3d/lab-next/models/patients/dummy02.glb'||
 /^3d\/lab-next\/portraits\/[^/]+\.(webp|png|jpe?g|avif)$/i.test(path);
}
export function splitTree(tree){
 const code=[],assets=new Map();
 for(const entry of tree.split('\0').filter(Boolean)){
  const match=/^100644 blob ([0-9a-f]{40,64})\t(.+)$/s.exec(entry);
  if(match&&isVisualAsset(match[2])&&!match[2].split('/').pop().startsWith('.'))assets.set(match[2],match[1]);
  else code.push(entry);
 }
 return {code:code.join('\0'),assets};
}
export function classifyTrees(before,after){
 if(before===after)return false;
 const a=splitTree(before),b=splitTree(after);
 if(a.code!==b.code)return false;
 for(const path of a.assets.keys())if(path.endsWith('.glb')&&!b.assets.has(path))return false;
 return true;
}

export function codeFingerprint(tree,dependencyLock,runtime){
 return createHash('sha256').update(splitTree(tree).code).update('\0')
  .update(dependencyLock).update('\0').update(runtime).digest('hex');
}
function main(){
 const core=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(core,'../..');
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',maxBuffer:64*1024*1024});
 const tree=ref=>git('ls-tree','-r','-z',ref);
 const head=git('rev-parse','HEAD').trim(),current=tree(head),before=process.env.BEFORE_SHA??'';
 let assetOnly=false,reusable=false,fingerprint='';
 // Missing history, force pushes, manual dispatch and empty changes fail closed.
 if(process.env.GITHUB_EVENT_NAME==='push'&&/^[0-9a-f]{40,64}$/.test(before)&&!/^0+$/.test(before)){
  try{
   if(spawnSync('git',['merge-base','--is-ancestor',before,head],{cwd:repo}).status===0)
    assetOnly=classifyTrees(tree(before),current);
  }catch(error){console.warn('Cannot compare push; full CI required:',error.message);}
 }
 // Hash the installed dependency resolution, not just package.json.
 try{
  const lock=readFileSync(resolve(core,'node_modules/.package-lock.json'));
  fingerprint=codeFingerprint(current,lock,[process.version,process.platform,process.arch].join('/'));
  reusable=true;
 }catch(error){console.warn('No dependency lock fingerprint; full CI required:',error.message);}
 console.log('Asset-only push:',assetOnly,'; reusable fingerprint:',reusable);
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,
  'asset_only='+assetOnly+'\nreusable='+reusable+'\nfingerprint='+fingerprint+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main();
