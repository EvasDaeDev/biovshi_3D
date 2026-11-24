import type { Vec3 } from '../types.js';
const add = (a: Vec3,b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub = (a: Vec3,b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul = (a: Vec3,s: number): Vec3 => [a[0]*s,a[1]*s,a[2]*s];
const dot = (a: Vec3,b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length = (a: Vec3) => Math.hypot(...a);
export interface TwoBonePose { readonly joint: Vec3; readonly end: Vec3 }
/** Analytic IK; clamp unreachable targets rather than stretching either bone. */
export function solveTwoBone(root: Vec3,target: Vec3,upper: number,lower: number,pole: Vec3): TwoBonePose {
  if (![...root,...target,...pole,upper,lower].every(Number.isFinite)||upper<=0||lower<=0) throw new RangeError('Invalid IK geometry');
  const delta=sub(target,root), d=length(delta);
  const axis: Vec3=d>1e-10?mul(delta,1/d):[0,-1,0];
  const reach=Math.max(Math.abs(upper-lower),Math.min(upper+lower,d));
  let bend=sub(pole,mul(axis,dot(pole,axis)));
  if(length(bend)<1e-8){
    const fallback: Vec3=Math.abs(axis[2])<.9?[0,0,-1]:[1,0,0];
    bend=sub(fallback,mul(axis,dot(fallback,axis)));
  }
  bend=mul(bend,1/length(bend));
  if(reach===0) return {joint:add(root,mul(bend,upper)),end:[...root]};
  const along=(upper*upper-lower*lower+reach*reach)/(2*reach);
  const sideways=Math.sqrt(Math.max(0,upper*upper-along*along));
  return {joint:add(add(root,mul(axis,along)),mul(bend,sideways)),end:add(root,mul(axis,reach))};
}
