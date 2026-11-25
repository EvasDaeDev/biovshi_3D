import {createHash} from 'node:crypto';
import {gradeHeight,validateGradeSurface} from '../dist/arena/graded-surface.js';
import {PolygonNavigation} from '../dist/arena/polygon-navigation.js';

const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const point=([x,,z])=>({x,z});
const key=p=>JSON.stringify([p[0],p[2]]);
const side=(a,b,c)=>Math.sign((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]));

/** Validate native heights at the build boundary, using the same polygons
 * as navigation. The geometry hash scopes saved remains to their floor. */
export function applyLocationTerrain(catalog,manifest){
 if(!isRecord(manifest)||manifest.schemaVersion!==1||!isRecord(manifest.locations))
  throw new RangeError('Invalid 3D terrain manifest');
 const result={...catalog};
 for(const [id,source] of Object.entries(manifest.locations)){
  const location=catalog[id];
  if(!Object.hasOwn(catalog,id)||!Array.isArray(source)||source.length===0)
   throw new RangeError('Invalid 3D terrain location: '+id);
  const triangles=validateGradeSurface(source);
  const nav=new PolygonNavigation(location);
  const edges=new Map();
  for(const triangle of triangles){
   for(let i=0;i<3;i++){
    const a=triangle[i],b=triangle[(i+1)%3];
    if(!nav.clear(point(a),point(b),.10))
     throw new RangeError('3D terrain crosses arena geometry: '+id);
    const [first,second]=key(a)<key(b)?[a,b]:[b,a];
    const edge=key(first)+'|'+key(second);
    const heights=first[1]+'|'+second[1];
    const orientation=side(first,second,triangle[(i+2)%3]);
    const previous=edges.get(edge);
    if(previous&&(previous.paired||previous.heights!==heights||previous.orientation===orientation))
     throw new RangeError('3D terrain has a mismatched or duplicate seam: '+id);
    edges.set(edge,{orientation,heights,raised:a[1]>0||b[1]>0,paired:!!previous});
   }
   // An obstacle can be entirely enclosed without crossing an edge.
   if(location.objects.some(o=>o.points.some(p=>gradeHeight(p.x,p.z,[triangle])>0)))
    throw new RangeError('3D terrain encloses an obstacle: '+id);
  }
  if([...edges.values()].some(e=>e.raised&&!e.paired))
   throw new RangeError('3D terrain has an open raised edge: '+id);
  const revision=createHash('sha256').update(JSON.stringify([manifest.schemaVersion,location.boundary,location.objects,triangles])).digest('hex');
  result[id]={...location,terrain:{revision,triangles}};
 }
 return result;
}
