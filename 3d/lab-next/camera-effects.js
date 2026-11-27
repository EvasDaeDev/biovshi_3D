export const EFFECT_DEFAULTS=Object.freeze({
 corner:Object.freeze({darkness:.34,vignette:.56,grain:.15,haze:.48,signal:.42}),
 gopro:Object.freeze({darkness:.24,vignette:.48,grain:.18,haze:.30,signal:.55}),
});
const previousDefaults={
 corner:{darkness:.14,vignette:.30,grain:.045},
 gopro:{darkness:.08,vignette:.19,grain:.065},
};
const STORAGE_KEY='eccepry:camera-effects:v1';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export function readCameraEffects(){
 const settings={version:2,enabled:true,corner:{...EFFECT_DEFAULTS.corner},gopro:{...EFFECT_DEFAULTS.gopro}};
 try{
  const saved=JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  if(typeof saved?.enabled==='boolean')settings.enabled=saved.enabled;
  for(const mode of ['corner','gopro'])for(const name of Object.keys(EFFECT_DEFAULTS[mode])){
   const value=saved?.[mode]?.[name];
   if(!Number.isFinite(value)||saved.version!==2&&value===previousDefaults[mode][name])continue;
   settings[mode][name]=clamp(value,0,1);
  }
 }catch{
  // A blocked store leaves both camera profiles usable for the current page.
 }
 return settings;
}
export function saveCameraEffects(settings){
 try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));return true;}
 catch{return false;}
}

export class CameraEffects {
 constructor(T,renderer){
  this.renderer=renderer;
  this.size=new T.Vector2();
  this.target=new T.WebGLRenderTarget(1,1,{depthTexture:new T.DepthTexture(1,1)});
  this.scene=new T.Scene();
  this.camera=new T.Camera();
  this.material=new T.ShaderMaterial({
   depthTest:false,depthWrite:false,toneMapped:false,
   uniforms:{
    image:{value:this.target.texture},sceneDepth:{value:this.target.depthTexture},
    amounts:{value:new T.Vector3()},atmosphere:{value:new T.Vector3()},
    depthRange:{value:new T.Vector3()},pixelSize:{value:new T.Vector2()},frame:{value:0},
   },
   vertexShader:`
    varying vec2 uvAtPixel;
    void main(){
     uvAtPixel=uv;
     gl_Position=vec4(position.xy,0.0,1.0);
    }
   `,
   fragmentShader:`
    uniform sampler2D image;
    uniform sampler2D sceneDepth;
    uniform vec3 amounts;
    uniform vec3 atmosphere;
    uniform vec3 depthRange;
    uniform vec2 pixelSize;
    uniform float frame;
    varying vec2 uvAtPixel;
    float cameraLuma(vec3 color){return dot(color,vec3(.2126,.7152,.0722));}
    float noise(vec2 pixel){
     vec3 hash=fract(vec3(pixel.xyx)*vec3(.1031,.11369,.13787));
     hash+=dot(hash,hash.yzx+19.19);
     return fract((hash.x+hash.y)*hash.z)-.5;
    }
    void main(){
     vec2 uv=uvAtPixel,offset=2.0*uv-1.0;
     float radius=length(offset);
     float head=atmosphere.z,signal=atmosphere.y;
     vec3 raw=texture2D(image,uv).rgb;
     vec2 fringe=offset*pixelSize*(1.0+4.0*radius)*signal;
     vec3 red=texture2D(image,uv+fringe).rgb;
     vec3 blue=texture2D(image,uv-fringe).rgb;
     raw=mix(raw,vec3(red.r,raw.g,blue.b),head*smoothstep(.35,1.25,radius));
     float level=cameraLuma(raw);
     float depth=texture2D(sceneDepth,uv).r;
     float near=depthRange.x,far=depthRange.y;
     float distanceToSurface=mix(near+depth*(far-near),near*far/(far-depth*(far-near)),depthRange.z);
     float haze=smoothstep(1.4,9.5,distanceToSurface)*atmosphere.x;
     if(depth>=.99999)haze*=.45;

     // Independent shadow and highlight tints. Hold back blacks while
     // allowing a brighter edge on the lit side of a patient's silhouette.
     vec3 shadows=mix(vec3(.20,.68,.64),vec3(.20,.43,.56),head);
     vec3 highlights=mix(vec3(.67,1.10,.91),vec3(1.25,.89,.59),head);
     float tone=level/(.70+level);
     vec3 grade=mix(shadows,highlights,smoothstep(.045,.69,level));
     vec3 details=raw/(.20+level)-vec3(level/(.20+level));
     vec3 color=grade*tone+details*.25;
     float beam=1.0-smoothstep(.25,1.33,length(offset*vec2(.87,1.08)));
     color*=1.0-amounts.x*mix(.96,.38,beam*head);
     vec3 mist=mix(vec3(.035,.085,.070),vec3(.050,.061,.065),head);
     color=mix(color,mist,.75*haze);
     color*=1.0-amounts.y*smoothstep(.34,1.30,radius)*.96;

     float spill=max(0.0,(cameraLuma(red)+cameraLuma(blue))*.50-.46);
     color+=spill*signal*mix(vec3(.21,.32,.22),vec3(.49,.26,.10),head);
     float line=.5+.5*cos(gl_FragCoord.y*2.094395);
     color*=1.0-(1.0-head)*signal*(.12+.16*(1.0-level))*line;
     vec2 pixel=gl_FragCoord.xy+vec2(29.0,71.0)*frame;
     color+=noise(floor(pixel*mix(.83,.68,head)))*amounts.z*(.075+.13*sqrt(tone));
     gl_FragColor=vec4(max(color,0.0),1.0);
     #include <colorspace_fragment>
    }
   `,
  });
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),this.material);
  quad.frustumCulled=false;
  this.scene.add(quad);
 }
 draw(scene,camera,settings,time,profile){
  const {renderer,target,material}=this;
  renderer.getDrawingBufferSize(this.size);
  if(target.width!==this.size.x||target.height!==this.size.y)target.setSize(this.size.x,this.size.y);
  material.uniforms.amounts.value.set(settings.darkness,settings.vignette,settings.grain);
  material.uniforms.atmosphere.value.set(settings.haze,settings.signal,profile==='gopro'?1:0);
  material.uniforms.depthRange.value.set(camera.near,camera.far,camera.isPerspectiveCamera?1:0);
  material.uniforms.pixelSize.value.set(1/this.size.x,1/this.size.y);
  material.uniforms.frame.value=Math.floor(time/45)%256;
  renderer.setRenderTarget(target);
  try{renderer.render(scene,camera);}
  finally{renderer.setRenderTarget(null);}
  renderer.render(this.scene,this.camera);
 }
}
