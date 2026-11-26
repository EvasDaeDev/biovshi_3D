const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
/** Higher angular urgency for large turn commands, still proportional near
 * alignment. Fixed-step rate limit preserves intermediate rotations. */
export function horrorTurnRate(command:number):number{
 const u=clamp(Math.abs(command),0,1),curve=u*u*(3-2*u);
 return Math.sign(command)*u*(2.15+1.85*curve);
}
/** Pivot steps are shorter than walking steps and anticipate rotation.
 * Preserve the planted foot and do not teleport either ankle. */
export function pivotPlan(turnRate:number,speed:number){
 const strength=clamp((Math.abs(turnRate)-.9)/2.2,0,1)*clamp((.65-Math.abs(speed))/.50,0,1);
 return {strength,lead:clamp(turnRate*.105,-.42,.42)*strength,
  threshold:.13-.055*strength,swing:.32-.105*strength,interval:.50-.21*strength};
}
