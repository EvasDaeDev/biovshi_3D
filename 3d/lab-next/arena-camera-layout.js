export const CAMERA_HEIGHT=3;
export const CAMERA_CLEARANCE=.18;
const CORNERS=[[1,1],[-1,1],[-1,-1],[1,-1]];
const INSET=.44;

export function cornerMounts(arena,navigation){
 return CORNERS.map(([sx,sz])=>{
  const dx=sx*arena.width/2,dz=sz*arena.depth/2;
  let limit=Infinity;
  for(let i=0;i<arena.boundary.length;i++){
   const a=arena.boundary[i],b=arena.boundary[(i+1)%arena.boundary.length];
   const ex=b.x-a.x,ez=b.z-a.z,along=ex*dz-ez*dx;
   if(along<0)limit=Math.min(limit,(ex*a.z-ez*a.x)/along);
  }
  const inset=INSET/Math.hypot(dx,dz);
  for(let t=limit-inset;t>0;t-=inset){
   const point={x:t*dx,z:t*dz};
   if(navigation.clear(point,point,CAMERA_CLEARANCE))return point;
  }
  const [x,,z]=arena.spawnSlots[0];
  return {x,z};
 });
}
