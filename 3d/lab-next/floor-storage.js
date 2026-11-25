import {readFloorHistory} from '../core/dist/arena/floor-history.js';

/** Adapted from local v1 src/render/floor-storage.js, but with a separate
 * 3D JSON database. The original raster floor store is never opened. */
const DATABASE='biovshi.3d.floor-history.v1';
const STORE='floors';
const pending=new Map();

export function floorScopeKey(sessionId,arenaId){
 if(typeof sessionId!=='string'||!sessionId.trim()||sessionId.length>128||
    typeof arenaId!=='string'||!arenaId.trim()||arenaId.length>128)
  throw new RangeError('Invalid 3D floor session or arena');
 return JSON.stringify([sessionId,arenaId]);
}

function inOrder(key,operation){
 const previous=pending.get(key)??Promise.resolve();
 const result=previous.catch(()=>{}).then(operation);
 pending.set(key,result);
 // Save/clear/load of one arena must never overtake one another, including
 // the case where a write fails or the user clicks Reset during a save.
 void result.then(()=>{if(pending.get(key)===result)pending.delete(key);},
  ()=>{if(pending.get(key)===result)pending.delete(key);});
 return result;
}

function transaction(key,kind,value,{indexedDB=globalThis.indexedDB,timeoutMs=1500}={}){
 return new Promise((resolve,reject)=>{
  if(!indexedDB){reject(Error('IndexedDB unavailable'));return;}
  let db,tx,done=false,answer;
  const finish=(error,result)=>{
   if(done)return;
   done=true;clearTimeout(timer);
   if(error&&tx){try{tx.abort();}catch{}}
   db?.close();
   error?reject(error):resolve(result);
  };
  const timer=setTimeout(()=>finish(Error('3D floor storage timed out')),timeoutMs);
  let request;
  try{request=indexedDB.open(DATABASE,1);}catch(error){finish(error);return;}
  request.onblocked=()=>finish(Error('3D floor storage blocked'));
  request.onerror=()=>finish(request.error??Error('3D floor storage unavailable'));
  request.onupgradeneeded=()=>{
   if(done){request.transaction?.abort();return;}
   if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);
  };
  request.onsuccess=()=>{
   db=request.result;db.onversionchange=()=>db.close();
   if(done){db.close();return;}
   try{
    tx=db.transaction(STORE,kind==='read'?'readonly':'readwrite');
    const store=tx.objectStore(STORE);
    const op=kind==='read'?store.get(key):kind==='clear'?store.delete(key):store.put(value,key);
    op.onsuccess=()=>{answer=op.result;};
    tx.oncomplete=()=>finish(null,answer);
    tx.onerror=tx.onabort=()=>finish(tx.error??Error('3D floor storage failed'));
   }catch(error){finish(error);}
  };
 });
}

export function loadFloorHistory(sessionId,arenaId,options){
 const key=floorScopeKey(sessionId,arenaId);
 return inOrder(key,async()=>{
  const saved=await transaction(key,'read',undefined,options);
  return saved===undefined?null:readFloorHistory(saved,arenaId);
 });
}

export function saveFloorHistory(sessionId,arenaId,snapshot,options){
 const key=floorScopeKey(sessionId,arenaId);
 // Validation precedes opening a DB or replacing a previous valid snapshot.
 const copy=readFloorHistory(snapshot,arenaId);
 return inOrder(key,()=>transaction(key,'write',copy,options));
}

export function clearFloorHistory(sessionId,arenaId,options){
 const key=floorScopeKey(sessionId,arenaId);
 return inOrder(key,()=>transaction(key,'clear',undefined,options));
}
