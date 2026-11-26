import type {FighterCommand,Vec3} from '../types.js';
import type {Punch,StrikePhase} from './strike.js';
/** An attack modifies locomotion intent instead of replacing it. Feet
 * continue to run their own gait; the kick has a separate support limit. */
export function strikeLocomotion(command:FighterCommand,punch:Punch,phase:StrikePhase):FighterCommand{
 if(punch.prone||phase==='idle')return command;
 const kind=punch.kind??'arm';
 const forward=kind==='leg'?.42:kind==='head'?.75:.85;
 const turn=kind==='leg'?.25:kind==='head'?.55:.70;
 return {...command,forward:command.forward*forward,turn:command.turn*turn,
  sprint:kind!=='leg'&&command.sprint,jump:false};
}
/** Distance along the requested ray before leaving the supporting foot's
 * horizontal envelope. When already outside, allow inward motion but do
 * not enlarge that error. All values use the rig's native coordinates. */
export function kickTravelLimit(root:Vec3,plant:Vec3,yaw:number,requested:number):number{
 if(!requested)return 0;
 const sign=Math.sign(requested),x=root[0]-plant[0],z=root[2]-plant[2];
 const dx=Math.sin(yaw)*sign,dz=-Math.cos(yaw)*sign;
 const r2=x*x+z*z,limit=Math.max(.38**2,r2),dot=x*dx+z*dz;
 const max=Math.max(0,-dot+Math.sqrt(Math.max(0,dot*dot+limit-r2)));
 return sign*Math.min(Math.abs(requested),max);
}
