/** Present a wide rectilinear render with an equidistant lens projection. */
export class FisheyeView {
 constructor(T,renderer){
  this.renderer=renderer;
  this.size=new T.Vector2();
  this.target=new T.WebGLRenderTarget(1,1);
  this.scene=new T.Scene();
  this.camera=new T.Camera();
  this.material=new T.ShaderMaterial({
   depthTest:false,depthWrite:false,toneMapped:false,
   uniforms:{image:{value:this.target.texture},aspect:{value:1},projectionScale:{value:new T.Vector2()}},
   vertexShader:`
    varying vec2 uvAtPixel;
    void main(){
     uvAtPixel=uv;
     gl_Position=vec4(position.xy,0.0,1.0);
    }
   `,
   fragmentShader:`
    uniform sampler2D image;
    uniform float aspect;
    uniform vec2 projectionScale;
    varying vec2 uvAtPixel;
    void main(){
     vec2 pixel=(uvAtPixel*2.0-1.0)*vec2(aspect,1.0);
     float distanceFromCenter=length(pixel);
     float angle=distanceFromCenter/length(vec2(aspect,1.0))*radians(72.0);
     vec2 ray=pixel/max(distanceFromCenter,0.00001)*tan(angle);
     gl_FragColor=texture2D(image,0.5+0.5*ray*projectionScale);
     #include <colorspace_fragment>
    }
   `,
  });
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),this.material);
  quad.frustumCulled=false;
  this.scene.add(quad);
 }
 draw(scene,camera){
  const {renderer,target}=this;
  renderer.getDrawingBufferSize(this.size);
  if(target.width!==this.size.x||target.height!==this.size.y)target.setSize(this.size.x,this.size.y);
  this.material.uniforms.aspect.value=camera.aspect;
  this.material.uniforms.projectionScale.value.set(camera.projectionMatrix.elements[0],camera.projectionMatrix.elements[5]);
  renderer.setRenderTarget(target);
  try{renderer.render(scene,camera);}
  finally{renderer.setRenderTarget(null);}
  renderer.render(this.scene,this.camera);
 }
}
