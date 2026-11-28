export const CAMERA_HEIGHT=3;
export const CAMERA_CLEARANCE=.18;
const CORNERS=[[1,1],[-1,1],[-1,-1],[1,-1]];
const INSET=.44;
export const CAMERA_FIXTURE_CLEARANCE=.18;

// Read the actual world-space camera fixture vertices before visual batching.
// The original corner numbering is defined by X/Z quadrants, not Blender's
// camera_01...04 naming order (Blender's Y converts to glTF -Z).
export function ringCameraRadii(root){
 root.updateMatrixWorld(true);
 const radii=Array(4).fill(Infinity);
 root.traverse(node=>{
  if(!node.isMesh||!/^camera_\d+_/i.test(node.name))return;
  const position=node.geometry.getAttribute('position');
  if(!position?.count)return;
  const m=node.matrixWorld.elements,points=[];
  let sumX=0,sumZ=0;
  for(let i=0;i<position.count;i++){
   const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
   const wx=m[0]*x+m[4]*y+m[8]*z+m[12],wz=m[2]*x+m[6]*y+m[10]*z+m[14];
   points.push(wx,wz);sumX+=wx;sumZ+=wz;
  }
  const corner=CORNERS.findIndex(([sx,sz])=>sx*sumX>0&&sz*sumZ>0);
  if(corner<0)return;
  const [sx,sz]=CORNERS[corner];
  for(let i=0;i<points.length;i+=2)
   radii[corner]=Math.min(radii[corner],(sx*points[i]+sz*points[i+1])*Math.SQRT1_2-CAMERA_FIXTURE_CLEARANCE);
 });
 return radii.map(r=>Number.isFinite(r)&&r>0?r:null);
}

export function cornerMounts(arena,navigation,fixtureRadii=[]){
 return CORNERS.map(([sx,sz],corner)=>{
  const dx=sx*arena.width/2,dz=sz*arena.depth/2;
  let limit=Infinity;
  for(let i=0;i<arena.boundary.length;i++){
   const a=arena.boundary[i],b=arena.boundary[(i+1)%arena.boundary.length];
   const ex=b.x-a.x,ez=b.z-a.z,along=ex*dz-ez*dx;
   if(along<0)limit=Math.min(limit,(ex*a.z-ez*a.x)/along);
  }
  const distance=Math.hypot(dx,dz),inset=INSET/distance;
  const radius=fixtureRadii[corner];
  const start=Number.isFinite(radius)&&radius>0?Math.min(limit-inset,radius/distance):limit-inset;
  for(let t=start;t>0;t-=inset){
   const point={x:t*dx,z:t*dz};
   if(navigation.clear(point,point,CAMERA_CLEARANCE))return point;
  }
  const [x,,z]=arena.spawnSlots[0];
  return {x,z};
 });
}
