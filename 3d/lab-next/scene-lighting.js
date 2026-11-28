import {configureGoProShadow} from './gopro-shadow.js';

export const LIGHTING_STORAGE='eccepry:scene-lighting:v1';
export const LIGHTING_CONTROLS=Object.freeze({
 flashlight:{label:'Яркость фонарика',initial:8,min:0,max:35,step:.1},
 range:{label:'Дальность фонарика, м',initial:9,min:1,max:20,step:.1},
 angle:{label:'Угол луча, °',initial:75.6,min:10,max:120,step:.5},
 softness:{label:'Мягкость края',initial:.78,min:0,max:1,step:.01},
 ambient:{label:'Рассеянный свет',initial:.85,min:0,max:4,step:.05},
 fill:{label:'Направленный свет',initial:1.55,min:0,max:6,step:.05},
});
export const LIGHTING_DEFAULTS=Object.freeze({
 ...Object.fromEntries(Object.entries(LIGHTING_CONTROLS).map(([name,{initial}])=>[name,initial])),
 flashlightColor:'#ffd6ad',ambientColor:'#c5dacb',
});

export function readSceneLighting(storage){
 const settings={...LIGHTING_DEFAULTS};
 try{
  const saved=JSON.parse((storage??globalThis.localStorage).getItem(LIGHTING_STORAGE));
  for(const [name,{min,max}] of Object.entries(LIGHTING_CONTROLS))
   if(Number.isFinite(saved?.[name]))settings[name]=Math.min(max,Math.max(min,saved[name]));
  for(const name of ['flashlightColor','ambientColor'])
   if(/^#[0-9a-f]{6}$/i.test(saved?.[name]??''))settings[name]=saved[name];
 }catch{}
 return settings;
}

export function saveSceneLighting(settings,storage){
 try{(storage??globalThis.localStorage).setItem(LIGHTING_STORAGE,JSON.stringify(settings));return true;}
 catch{return false;}
}

export function createSceneLighting(T,renderer,scene){
 const ambient=new T.HemisphereLight(0xc5dacb,0x263229);
 const fill=new T.DirectionalLight(0xe0c9af);fill.position.set(-3,6,4);
 const flashlight=new T.SpotLight(0xffd6ad,8,9,Math.PI*.21,.78,1);
 flashlight.visible=false;
 configureGoProShadow(T,renderer,flashlight);
 scene.add(ambient,fill,flashlight,flashlight.target);
 return {ambient,fill,flashlight};
}

export function applySceneLighting({ambient,fill,flashlight},settings,profile,mounted){
 const ambientFactor=profile==='corner'?1.25/.85:mounted?1:2/.85;
 const fillFactor=profile==='corner'?3.6/1.55:mounted?1:3/1.55;
 ambient.intensity=settings.ambient*ambientFactor;
 ambient.color.set(settings.ambientColor);
 fill.intensity=settings.fill*fillFactor;
 fill.color.setHex(profile==='corner'?0xbacec2:0xe0c9af);
 flashlight.visible=mounted&&settings.flashlight>0;
 flashlight.intensity=settings.flashlight;
 flashlight.distance=settings.range;
 flashlight.angle=settings.angle*Math.PI/360;
 flashlight.penumbra=settings.softness;
 flashlight.color.set(settings.flashlightColor);
}
