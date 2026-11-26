/** Settled-body stain. Length is the greatest horizontal distance between
 * surviving capsule ends including radii, not the original patient height.
 * One circular, purely visual stain per settled body. */
export function bodyPool(parts,fighterId,tick,baseHeight=()=>0){
 if(!parts.length)return null;
 const ends=parts.flatMap(p=>[{point:p.a,r:p.radius},{point:p.b,r:p.radius}]);
 let a=ends[0],b=a,length=2*a.r;
 for(const p of ends)for(const q of ends){
  const d=Math.hypot(p.point[0]-q.point[0],p.point[2]-q.point[2])+p.r+q.r;
  if(d>length){a=p;b=q;length=d;}
 }
 const x=(a.point[0]+b.point[0])*.5,z=(a.point[2]+b.point[2])*.5;
 return {id:'pool:'+fighterId,fighterId,tick,point:[x,baseHeight(x,z),z],radius:length*2/3};
}
export function poolRadius(radius,age){
 const t=Math.max(0,Math.min(1,age/3));
 return radius*(.08+.92*t*t*(3-2*t));
}
