export function configureGoProShadow(THREE,renderer,light){
 renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFShadowMap;
 light.castShadow=true;
 light.shadow.mapSize.set(1024,1024);
 light.shadow.camera.near=.12;
 light.shadow.bias=-.0002;
 light.shadow.normalBias=.015;
}

export function segmentShadow(group,cast=true){
 for(const mesh of group.children){
  mesh.castShadow=cast&&mesh.name!=='portrait';
  mesh.receiveShadow=true;
 }
 return group;
}
