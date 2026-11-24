/** Structural vector types intentionally independent of Three.js. */
export interface Point3 { readonly x: number; readonly y: number; readonly z: number }
export interface Capsule { readonly a: Point3; readonly b: Point3; readonly r: number }
export interface CapsuleContact { dx: number; dy: number; dz: number; dist: number; penetration: number }
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export function capsuleContact(a: Capsule, b: Capsule): CapsuleContact | null{
 const ux=a.b.x-a.a.x,uy=a.b.y-a.a.y,uz=a.b.z-a.a.z;
 const vx=b.b.x-b.a.x,vy=b.b.y-b.a.y,vz=b.b.z-b.a.z;
 const wx=a.a.x-b.a.x,wy=a.a.y-b.a.y,wz=a.a.z-b.a.z;
 const A=ux*ux+uy*uy+uz*uz,B=ux*vx+uy*vy+uz*vz,C=vx*vx+vy*vy+vz*vz,D=ux*wx+uy*wy+uz*wz,E=vx*wx+vy*wy+vz*wz;
 let sc=0,tc=0,denom=A*C-B*B;
 if(A<1e-10&&C<1e-10){sc=0;tc=0;}
 else if(A<1e-10){tc=clamp(E/C,0,1);}
 else if(C<1e-10){sc=clamp(-D/A,0,1);}
 else if(denom<1e-10){sc=0;tc=clamp(E/C,0,1);}
 else{sc=clamp((B*E-C*D)/denom,0,1);tc=clamp((A*E-B*D)/denom,0,1);}
 if(A>=1e-10)sc=clamp((B*tc-D)/A,0,1);
 if(C>=1e-10)tc=clamp((B*sc+E)/C,0,1);
 if(A>=1e-10)sc=clamp((B*tc-D)/A,0,1);
 let dx=wx+sc*ux-tc*vx,dy=wy+sc*uy-tc*vy,dz=wz+sc*uz-tc*vz;
 const dist=Math.hypot(dx,dy,dz),penetration=a.r+b.r-dist;
 if(penetration<=0)return null;
 return {dx,dy,dz,dist,penetration};
}
