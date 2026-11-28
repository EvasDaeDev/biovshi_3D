import {boneFrame,anatomicalBoneFrame} from '../core/dist/rig/bone-frame.js';

export function patientSegmentFrame(p,parts,yaw,head){
 if(p.id==='head'&&head){const f=boneFrame(p.a,p.a.map((n,i)=>n+head.up[i]),head.forward);return {...f,center:p.a,length:0};}
 if(p.id.endsWith('.hand')){const arm=parts.find(q=>q.id===p.id.replace('.hand','.lowerArm'));if(arm){const f=anatomicalBoneFrame(arm,parts,yaw);return {...f,center:p.a,length:0};}}
 return anatomicalBoneFrame(p,parts,yaw);
}
