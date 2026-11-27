export const EFFECT_DEFAULTS=Object.freeze({
 corner:Object.freeze({darkness:.14,vignette:.30,grain:.045}),
 gopro:Object.freeze({darkness:.08,vignette:.19,grain:.065}),
});
const STORAGE_KEY='eccepry:camera-effects:v1';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export function readCameraEffects(){
 const settings={enabled:true,corner:{...EFFECT_DEFAULTS.corner},gopro:{...EFFECT_DEFAULTS.gopro}};
 try{
  const saved=JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  if(typeof saved?.enabled==='boolean')settings.enabled=saved.enabled;
  for(const mode of ['corner','gopro'])for(const name of ['darkness','vignette','grain']){
   const value=saved?.[mode]?.[name];
   if(Number.isFinite(value))settings[mode][name]=clamp(value,0,1);
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
  this.target=new T.WebGLRenderTarget(1,1);
  this.scene=new T.Scene();
  this.camera=new T.Camera();
  this.material=new T.ShaderMaterial({
   depthTest:false,depthWrite:false,toneMapped:false,
   uniforms:{image:{value:this.target.texture},amounts:{value:new T.Vector3()},frame:{value:0}},
   vertexShader:`
    varying vec2 uvAtPixel;
    void main(){
     uvAtPixel=uv;
     gl_Position=vec4(position.xy,0.0,1.0);
    }
   `,
   fragmentShader:`
    uniform sampler2D image;
    uniform vec3 amounts;
    uniform float frame;
    varying vec2 uvAtPixel;
    void main(){
     vec3 color=texture2D(image,uvAtPixel).rgb;
     float edge=smoothstep(0.28,1.22,length(2.0*uvAtPixel-1.0));
     vec2 pixel=gl_FragCoord.xy+vec2(29.0,71.0)*frame;
     float grain=fract(52.9829189*fract(dot(pixel,vec2(0.06711056,0.00583715))))-0.5;
     color=color*(1.0-0.86*amounts.x)*(1.0-edge*0.86*amounts.y);
     color+=grain*amounts.z;
     gl_FragColor=vec4(max(color,0.0),1.0);
     #include <colorspace_fragment>
    }
   `,
  });
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),this.material);
  quad.frustumCulled=false;
  this.scene.add(quad);
 }
 draw(scene,camera,settings,time){
  const {renderer,target,material}=this;
  renderer.getDrawingBufferSize(this.size);
  if(target.width!==this.size.x||target.height!==this.size.y)target.setSize(this.size.x,this.size.y);
  material.uniforms.amounts.value.set(settings.darkness,settings.vignette,settings.grain);
  material.uniforms.frame.value=Math.floor(time/45)%256;
  renderer.setRenderTarget(target);
  try{renderer.render(scene,camera);}
  finally{renderer.setRenderTarget(null);}
  renderer.render(this.scene,this.camera);
 }
}
