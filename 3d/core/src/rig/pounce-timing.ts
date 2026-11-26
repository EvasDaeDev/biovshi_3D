import type {Vec3} from '../types.js';
import {JUMP_HEIGHT_SCALE,MOVEMENT} from './movement-timing.js';
/** Shared leaf module: no combat selection, pose editor or gait imports. */
export const POUNCE=Object.freeze({prepare:.18,flight:.42,settle:.20,distance:1.05});
/** Same ballistic lift and eased horizontal displacement as HopCycle.
 * Static preview only; moving targets, terrain and collision can alter
 * the real trajectory. Runtime never grants damage from the preview. */
export function pounceOffset(age:number,yaw:number):Vec3{
 const q=Math.max(0,Math.min(1,(age-POUNCE.prepare)/POUNCE.flight)),s=q*q*(3-2*q),t=q*POUNCE.flight;
 return [Math.sin(yaw)*POUNCE.distance*s,.5*MOVEMENT.gravity*JUMP_HEIGHT_SCALE*t*(POUNCE.flight-t),-Math.cos(yaw)*POUNCE.distance*s];
}
