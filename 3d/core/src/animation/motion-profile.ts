import type {PatientProfile} from '../combat/patient-profile.js';
/** Presentation and intent accents only; independent of damage rolls and
 * movement stats. Values stay fixed for the actor's lifetime. */
export interface MotionProfile {
 readonly observation:number;readonly stalkPace:number;readonly burstPace:number;
 readonly burstDuration:number;readonly recovery:number;
 readonly lag:number;readonly sway:number;readonly twist:number;readonly armSwing:number;
 readonly asymmetry:number;
 readonly strideTempo:number;readonly strikeTempo:number;readonly hopTempo:number;readonly firstFoot:0|1;readonly compensation:number;
}
export const BASE_MOTION_PROFILE:MotionProfile=Object.freeze({
 observation:1,stalkPace:.52,burstPace:.86,burstDuration:1,recovery:1,
 lag:1,sway:1,twist:1,armSwing:1,asymmetry:1,strideTempo:1,strikeTempo:1,hopTempo:1,firstFoot:0,compensation:.72
});
const variants:Record<NonNullable<PatientProfile['temperament']>,MotionProfile>={
 impulsive:{...BASE_MOTION_PROFILE,observation:.72,stalkPace:.64,burstPace:.96,burstDuration:1.06,recovery:.83,lag:.86,sway:1.08,twist:1.12,armSwing:1.14,asymmetry:1},
 balanced:{...BASE_MOTION_PROFILE},
 hesitant:{...BASE_MOTION_PROFILE,observation:1.38,stalkPace:.42,burstPace:.78,burstDuration:.90,recovery:1.30,lag:1.16,sway:1.13,twist:.9,armSwing:.82,asymmetry:1}
};
export function patientMotionProfile(seed:number,id:number,temperament?:PatientProfile['temperament']):MotionProfile{
 if(!temperament)return BASE_MOTION_PROFILE;
 const bits=(Math.imul((seed^Math.imul(id+1,0x9e3779b9))>>>0,0x85ebca6b))>>>0;
 const sign=(bits&1)===0?1:-1,variation=.85+((bits>>>8)&255)/255*.30;
 const base=variants[temperament];
 const unit=(shift:number)=>((bits>>>shift)&255)/255;
 const temperamentTempo=temperament==='impulsive'?.94:temperament==='hesitant'?1.06:1;
 return Object.freeze({...base,asymmetry:sign*variation,sway:base.sway*(.94+unit(16)*.12),
  strideTempo:.94+unit(3)*.12,strikeTempo:temperamentTempo*(.95+unit(19)*.10),
  hopTempo:.94+unit(11)*.12,firstFoot:((bits>>>31)&1) as 0|1,
  compensation:.64+unit(24)*.18});
}
