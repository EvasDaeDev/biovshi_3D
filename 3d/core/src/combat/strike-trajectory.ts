import type {Vec3} from '../types.js';
import type {StrikePhase} from './strike.js';
type Ground=(x:number,z:number)=>number;
const clamp=(t:number)=>Math.max(0,Math.min(1,t));
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
/** Continuous height-dependent accent, measured above the actual surface.
 * Values are in nominal rig units, just like the existing strike IK. */
export function lowTargetAmount(aim:Vec3,ground:Ground):number{
 const t=clamp((.75-(aim[1]-ground(aim[0],aim[2])))/.45);
 return t*t*(3-2*t);
}
/** Shared curved target for a loaded swing and lifted, non-retraced recovery.
 * The caller supplies eased phase progress. The bump is zero at each end;
 * lengths, support and final position are still owned by the existing IK. */
export function strikeTrajectory(base:Vec3,back:Vec3,aim:Vec3,phase:StrikePhase,progress:number,low:number,kind:'arm'|'leg',yaw:number,side:'L'|'R'):Vec3{
 const t=clamp(progress),w=clamp(low);
 if(phase==='idle')return base;
 if(phase==='windup')return mix(base,back,t);
 const recovering=phase==='recover';
 const p=recovering?mix(aim,base,t):mix(back,aim,t);
 const envelope=4*t*(1-t);
 const lift=recovering?(kind==='leg'?.055+.075*w:.035+.075*w):(kind==='leg'?.065*w:.045*w);
 const drift=recovering?(side==='L'?-1:1)*(.025+.035*w):0;
 return [p[0]+Math.cos(yaw)*drift*envelope,p[1]+lift*envelope,p[2]+Math.sin(yaw)*drift*envelope];
}
