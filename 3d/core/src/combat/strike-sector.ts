import type {Vec3,PhysicsSegmentPose} from '../types.js';
export const SIDE_STRIKE_LIMIT=70*Math.PI/180;
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
export function strikeBearing(pose:readonly PhysicsSegmentPose[],aim:Vec3,yaw:number):number{
 const p=pose.find(v=>v.id==='pelvis')??pose.find(v=>v.id==='chest');
 if(!p)return 0;
 const x=aim[0]-(p.a[0]+p.b[0])*.5,z=aim[2]-(p.a[2]+p.b[2])*.5;
 return Math.hypot(x,z)<1e-8?0:wrap(Math.atan2(x,-z)-yaw);
}
export function clampStrikeAim(pose:readonly PhysicsSegmentPose[],aim:Vec3,yaw:number):Vec3{
 const p=pose.find(v=>v.id==='pelvis')??pose.find(v=>v.id==='chest');
 if(!p)return aim;
 const angle=strikeBearing(pose,aim,yaw);if(Math.abs(angle)<=SIDE_STRIKE_LIMIT)return aim;
 const x=(p.a[0]+p.b[0])*.5,z=(p.a[2]+p.b[2])*.5,r=Math.hypot(aim[0]-x,aim[2]-z),a=yaw+Math.sign(angle)*SIDE_STRIKE_LIMIT;
 return [x+Math.sin(a)*r,aim[1],z-Math.cos(a)*r];
}
