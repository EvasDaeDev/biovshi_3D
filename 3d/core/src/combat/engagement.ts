/** Port of the v1 close-combat decision in src/systems/ai.js:
 * stop only when a real geometric strike is available. The .46 m native
 * root standoff remains unchanged when the preview succeeds or is skipped.
 * Never manufacture an attack/contact; this only selects requested travel. */
export const CLOSE_STANDOFF=.46;
export function pursuitForward(distance:number,heading:number,pursuit:number,failedStrikePreview=false):number{
 if(distance<=CLOSE_STANDOFF&&!failedStrikePreview)return 0;
 return Math.max(0,Math.cos(heading))*pursuit;
}
