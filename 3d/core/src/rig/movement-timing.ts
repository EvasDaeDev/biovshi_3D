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
export const HORROR_MOVEMENT=Object.freeze({walkSpeed:1.80,minWalkSpeed:.80,maxWalkSpeed:2.20,sprintSpeed:6.25,minSprintSpeed:5.50,maxSprintSpeed:7.00,crawlMultiplier:1.45,stanceReach:.55,maxStrideSpeed:4.3,maxRunSpeed:8.7});
export const HORROR_CRAWL_TIMING=Object.freeze({swing:.27,plant:.49,reach:.48});
export function horrorBipedStep(speed:number,tempo=1){
 const plan=bipedStep(speed),v=Math.min(HORROR_MOVEMENT.maxStrideSpeed/Math.max(1,tempo),Math.abs(speed)),run=Math.max(0,Math.min(1,(v-1.2)/1.6));
 // Advance the swinging foot beyond the predicted landing root, not
 // just toward the present root. Shorten cadence with increased speed.
 const sprint=Math.max(0,Math.min(1,(v-2.8)/1.5));
 const interval=(.41-.11*run-.115*sprint)*tempo,swing=(.28-.055*run-.09*sprint)*tempo;
 return {...plan,interval,swing,run,lead:Math.sign(speed)*Math.min(.96+.10*sprint,v*(swing+interval*.5)+.065*sprint),lift:.082+.045*run+.025*sprint,sprint};
}

/** Nominal healthy world-space speed. Small input values still permit
 * creeping, alignment and smooth stopping; damage is applied separately. */
export function patientDriveSpeed(forward:number,sprint:boolean,multiplier:number):number{
 const full=sprint&&forward>0?
  Math.max(HORROR_MOVEMENT.minSprintSpeed,Math.min(HORROR_MOVEMENT.maxSprintSpeed,HORROR_MOVEMENT.sprintSpeed*multiplier)):
  Math.min(HORROR_MOVEMENT.maxWalkSpeed,HORROR_MOVEMENT.walkSpeed*multiplier);
 return Math.max(-1,Math.min(1,forward))*full;
}
/** Native-space running, not a shortened walking step. Two swing
 * intervals overlap briefly, with world-space landing anchors. */
export function horrorRunStep(speed:number,tempo=1){
 const v=Math.min(HORROR_MOVEMENT.maxRunSpeed,Math.max(0,speed));
 // Keep the stance distance within the same anatomical envelope as walking.
 const interval=Math.min(.22*tempo,Math.max(.185,1.62/Math.max(1,v)));
 const swing=interval+Math.max(.075,interval*.43);
 return {interval,swing,lead:v*swing+.47,lift:.25+.04*Math.min(1,v/8.7)};
}
