import {Group,Mesh,PlaneGeometry,SphereGeometry} from 'three';

const unitSphere=new SphereGeometry(1,24,16),unitPortrait=new PlaneGeometry(1,1);

/** Local Y follows the segment axis. For the chest and pelvis that axis
 * runs across the body. The group moves with the owning segment. */
export function createSegmentVisual(id,radius,length,material,portrait){
 const group=new Group();
 const add=(name,scale,position=[0,0,0])=>{
  const mesh=new Mesh(unitSphere,material);
  mesh.name=name;
  mesh.userData.segment=id;
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  group.add(mesh);
 };
 const type=id.split('.').at(-1);
 const radii={
  head:[.91*radius,.91*radius,.91*radius],
  neck:[.76*radius,.56*length,.81*radius],
  chest:[1.48*radius,.85*(.50*length),.91*radius],
  abdomen:[.87*radius,.78*length,.83*radius],
  pelvis:[.82*radius,.90*(.5*length+.48*radius),.85*radius],
  upperArm:[.69*radius,.56*length,.68*radius],
  lowerArm:[.74*radius,.59*length,.66*radius],
  upperLeg:[.76*radius,.56*length,.80*radius],
  lowerLeg:[.53*radius,.56*length,.60*radius],
  hand:[.96*radius,1.07*radius,.76*radius],
  foot:[.91*radius,.78*radius,1.13*radius],
 };
 add('segment',radii[type]??[radius,Math.max(length/2,radius),radius]);
 if(type==='chest')for(const side of [-1,1]){
  add('clavicle',[.515*radius,.51*radius,.44*radius],[.56*radius,side*.42*length,0]);
 }
 if(type==='head'&&portrait){
  const face=new Mesh(unitPortrait,portrait);
  const image=portrait.map.image,height=1.68*radius;
  face.name='portrait';
  face.userData.segment=id;
  face.scale.set(height*image.width/image.height,height,1);
  // The head frame points local +Z along the gaze. Keep the plane just
  // outside the sphere so the nose of the sphere never clips the texture.
  face.position.z=radii.head[2]+.001;
  group.add(face);
 }
 if(type==='upperArm'||type==='upperLeg'){
  add(type==='upperArm'?'elbow':'knee',[.78*radius,.73*radius,.76*radius],[0,length/2,0]);
 }
 return group;
}
