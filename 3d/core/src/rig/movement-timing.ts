/** Native 3D movement profile. Source: src/config.js movement/idle,
 * src/robot/locomotion.js and src/robot/scenes.js in the local v1 reference.
 * No runtime import from the 2D game.
 */
const source={walkCm:32,chaseCm:55,fleeCm:64,speedMultiplier:1.2,bodyScale:.5,
 stepReplantCm:15,stepCycleCm:8.4,stepSwingRate:4.5,stepLeadTime:.18,
 stepLeadStartCm:30,stepLeadFullCm:60,stepLeadMaxCm:22,
 hopFlight:.28,hopPause:.12,hopDistanceCm:18} as const;
// Preserve the accepted .9 m/s 3D walk speed; conversion is a calibration,
// not a claim that the 2D coordinate unit is a physical centimetre.
const spatial=.9/(source.walkCm*.01*source.speedMultiplier);
export const MOVEMENT=Object.freeze({
 walkSpeed:source.walkCm*.01*source.speedMultiplier*spatial,
 // Existing 3D Shift speed remains until player feel is accepted.
 sprintSpeed:1.9,
 stepSwingSeconds:source.bodyScale/source.stepSwingRate,
 stepCycleDistance:source.stepCycleCm*.01*source.bodyScale*spatial,
 stepReplantDistance:source.stepReplantCm*.01*source.bodyScale*spatial,
 stepLeadSeconds:source.stepLeadTime,
 stepLeadStart:source.stepLeadStartCm*.01*spatial,
 stepLeadFull:source.stepLeadFullCm*.01*spatial,
 stepLeadMax:source.stepLeadMaxCm*.01*source.bodyScale*spatial,
 hopFlightSeconds:source.hopFlight,hopPauseSeconds:source.hopPause,
 hopMaxDistance:source.hopDistanceCm*.01*spatial,gravity:9.81
});
export function stepLead(speed:number):number{
 const v=Math.abs(speed),f=Math.max(0,Math.min(1,(v-MOVEMENT.stepLeadStart)/(MOVEMENT.stepLeadFull-MOVEMENT.stepLeadStart)));
 return Math.sign(speed)*Math.min(v*MOVEMENT.stepLeadSeconds,MOVEMENT.stepLeadMax)*f;
}

/** A 3D biped needs a full stance interval, not the v1 short replant error
 * and swing duration alone. Signed lead includes predicted root displacement
 * throughout swing plus half the distance between consecutive landings. */
export function bipedStep(speed:number){
 const v=Math.abs(speed),run=Math.max(0,Math.min(1,(v-MOVEMENT.walkSpeed)/(MOVEMENT.sprintSpeed-MOVEMENT.walkSpeed)));
 const interval=.50-.14*run,swing=.32-.06*run;
 return {interval,swing,lead:Math.sign(speed)*Math.min(.92,v*(swing+interval*.5)),lift:.085+.045*run,run};
}
export const CRAWL_TIMING=Object.freeze({swing:.30,plant:.55,reach:.40});
/** Authored full-scale horror profile; v1 calibration stays unchanged. */
export const HORROR_MOVEMENT=Object.freeze({walkSpeed:1.20,sprintSpeed:2.30,crawlMultiplier:1.45,stanceReach:.55});
export const HORROR_CRAWL_TIMING=Object.freeze({swing:.27,plant:.49,reach:.48});
export function horrorBipedStep(speed:number){
 const plan=bipedStep(speed),v=Math.abs(speed),run=Math.max(0,Math.min(1,(v-1.2)/1.1));
 const interval=.47-.12*run,swing=.30-.055*run;
 return {...plan,interval,swing,run,lead:Math.sign(speed)*Math.min(.63,v*(swing+interval*.5)),lift:.082+.045*run};
}
