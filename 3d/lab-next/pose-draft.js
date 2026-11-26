import {readPoseDocument} from '../core/dist/rig/pose-editor.js';

export const POSE_DRAFT_KEY='eccepry:pose-editor:v1';

export function readPoseDraft(storage){
 const saved=storage.getItem(POSE_DRAFT_KEY);
 return saved===null?null:readPoseDocument(JSON.parse(saved));
}

export function roundPatientPoses(defaults,storage){
 try{
  const draft=readPoseDraft(storage);
  if(draft)return {...defaults,slots:{...defaults.slots,...draft.slots}};
 }catch{
  // A blocked or invalid local draft must leave the released round playable.
 }
 return defaults;
}
