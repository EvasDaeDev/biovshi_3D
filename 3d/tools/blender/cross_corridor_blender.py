# -*- coding: utf-8 -*-
"""ECCEPRY 3D / CROSS — abandoned underground cross corridor.
Standalone Blender 5.x generator. No imports from previous generators.
Run from Scripting > Open > Run Script, or:
  python cross_corridor_blender.py --check-geometry
  blender -b --python cross_corridor_blender.py -- --export-glb /path/cross.glb
  blender -b --python cross_corridor_blender.py -- --save-blend /path/cross.blend
All dimensions are metres, Z up. Geometry-only validation needs no bpy.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from math import sin, cos, sqrt, pi, tau, hypot, atan2, isfinite
from pathlib import Path
import random
import sys

# ========================= USER SETTINGS =========================
SEED = 173
DECAY = 0.78                 # 0 intact; 1 heavily abandoned
WIDTH = 7.0
# Positive/negative X and Y, independently editable. Default: 21 x 21 m.
ARM_ENDS = (10.5, 10.5, 10.5, 10.5)
SPRING = 2.85
CROWN = 4.95
WALL_THICKNESS = 0.28
OCULUS_RADIUS = 0.96
MAX_TRIANGLES = 100000       # hard limit, including all exported meshes
ARCH_SEGMENTS = 32           # even; central and barrel seams share these
CHAIN_LINKS = 13
MATERIAL_MODE = "PREVIEW"    # PREVIEW: procedural gradients; EXPORT: flat colors
GRADIENT_STRENGTH = 0.20
ADD_PREVIEW = True
AUTO_EXPORT_GLB = False
EXPORT_FILE = ""
SCENE_NAME = "ECCEPRY_Cross_Corridor"
# ================================================================

H = WIDTH/2
EPS = 1e-8
DIRECTIONS = ((1.,0.),(0.,1.),(-1.,0.),(0.,-1.))
ARCH = "01_Architecture"
ROOF = "02_Vault_and_oculus"
GATES = "03_Gates_and_recesses"
PIPES = "04_Pipes_and_utilities"
LAMP = "05_Luminaires"
CHAIN = "06_Chains"
DEBRIS = "07_Clutter"
CAMS = "08_Camera_fixtures"
COLLECTIONS = (ARCH, ROOF, GATES, PIPES, LAMP, CHAIN, DEBRIS, CAMS)
rng = random.Random(SEED)
damage = Counter()
audit = Counter()
BUILDERS = []

PALETTE = {
    # sRGB hex -> converted to linear when creating Blender materials.
    "floor": "777674", "floor_alt": "686B6A", "floor_pale": "85817B",
    "floor_dust": "595B57", "grout": "363C3B", "concrete": "73716B",
    "concrete_alt": "656765", "concrete_pale": "8A8376",
    "wainscot": "4B5050", "wainscot_alt": "414746",
    "exposed": "514E47", "spall": "A39A88", "vault": "585A59",
    "vault_dark": "4B5050", "rib": "77746B",
    "iron": "444C4C", "iron_dark": "2C3434", "edge": "727673",
    "rust": "80563E", "rust_dark": "51382D", "red_oxide": "74463F",
    "rubber": "272C2B", "brass": "98815D", "wood": "756353",
    "cloth": "8B8174", "paper": "AAA18B", "glass": "596D72",
    "lamp_warm": "EACB96", "lamp_cold": "C4DBDC", "signal_red": "DF5142",
    "signal_dead": "67433F", "shadow": "242A2A",
}
EMISSION = {"lamp_warm": 1.25, "lamp_cold": 1.05, "signal_red": 1.8}
FLOOR_MATS = {"floor", "floor_alt", "floor_pale", "floor_dust", "grout"}
METAL_MATS = {"iron","iron_dark","edge","rust","rust_dark","red_oxide","brass"}
DOUBLE_SIDED = {"cloth", "paper", "glass"}


def chance(p): return rng.random() < p*DECAY
def add(a,b): return tuple(x+y for x,y in zip(a,b))
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def mul(a,k): return tuple(x*k for x in a)
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a): return sqrt(dot(a,a))
def unit(a):
    n=norm(a)
    if n<EPS: raise ValueError("zero vector")
    return mul(a,1/n)
def near(a,b): return norm(sub(a,b))<EPS
def key(p): return tuple(round(float(x),8) for x in p)
def local(arm,u,v,z=0.):
    x,y=DIRECTIONS[arm]
    return (x*u-y*v,y*u+x*v,z)
def vec(arm,u,v,z=0.): return local(arm,u,v,z)
def avg(points): return tuple(sum(p[i] for p in points)/len(points) for i in range(len(points[0])))
def clamp(v,a,b): return min(b,max(a,v))


# ======================== MESH PRIMITIVES =========================
class Mesh:
    """Welds matching positions; explicit winding; no hidden generic caps."""
    def __init__(self,name,group):
        self.name=name
        self.group=group
        self.v=[]
        self.f=[]
        self.mat=[]
        self.smooth=[]
        self.index={}
        BUILDERS.append(self)
    def face(self,points,material,hint=None,smooth=False):
        if material not in PALETTE: raise KeyError(material)
        p=[]
        for q in points:
            q=key(q)
            if not p or q!=p[-1]: p.append(q)
        if len(p)>1 and p[0]==p[-1]: p.pop()
        if len(p)<3 or len(set(p))!=len(p): return
        n=(0.,0.,0.)
        for a,b in zip(p,p[1:]+p[:1]):
            n=add(n,cross(a,b))
        if norm(n)<EPS: return
        if hint is not None and dot(n,hint)<0: p.reverse()
        ids=[]
        for q in p:
            if q not in self.index:
                self.index[q]=len(self.v)
                self.v.append(q)
            ids.append(self.index[q])
        self.f.append(tuple(ids))
        self.mat.append(material)
        self.smooth.append(bool(smooth))
    def patch(self,points,material,hint=None):
        # Keep collinear split points on boundaries. A triangle fan from the
        # interior is safe for the convex sweep cells used here.
        p=[]
        for q in points:
            if not p or not near(q,p[-1]): p.append(q)
        if len(p)>1 and near(p[0],p[-1]): p.pop()
        if len(p)<3: return
        if len(p)<=4 and all(norm(cross(sub(p[i],p[i-1]),sub(p[(i+1)%len(p)],p[i])))>EPS for i in range(len(p))):
            self.face(p,material,hint)
        else:
            c=avg(p)
            for a,b in zip(p,p[1:]+p[:1]):
                self.face([c,a,b],material,hint)
    @property
    def triangles(self): return sum(len(f)-2 for f in self.f)


def box(g,c,size,mat,angle=0.,omit=()):
    hx,hy,hz=(x/2 for x in size)
    ca,sa=cos(angle),sin(angle)
    v=[(c[0]+x*hx*ca-y*hy*sa,c[1]+x*hx*sa+y*hy*ca,c[2]+z*hz)
       for z in (-1,1) for x,y in ((-1,-1),(1,-1),(1,1),(-1,1))]
    faces={"bottom":(3,2,1,0),"top":(4,5,6,7),"back":(0,1,5,4),
           "right":(1,2,6,5),"front":(2,3,7,6),"left":(3,0,4,7)}
    for side,f in faces.items():
        if side in omit: audit["hidden_triangles_omitted"]+=2
        else: g.face([v[i] for i in f],mat)


def abox(g,arm,u,v,z,du,dv,dz,mat,turn=0.,omit=()):
    # X of box is longitudinal U, Y is transverse V.
    box(g,local(arm,u,v,z),(du,dv,dz),mat,arm*pi/2+turn,omit)


def basis(axis,prior=None):
    if prior is not None and abs(dot(prior,axis))<.96:
        u=unit(sub(prior,mul(axis,dot(prior,axis))))
    else:
        ref=(0.,0.,1.) if abs(axis[2])<.95 else (1.,0.,0.)
        u=unit(cross(ref,axis))
    return u,cross(axis,u)


def tube(g,a,b,r,mat,n=12,r2=None,caps=(True,True),smooth=True):
    if near(a,b): return
    axis=unit(sub(b,a));u,v=basis(axis)
    rr=r if r2 is None else r2
    rings=[[add(p,add(mul(u,s*cos(tau*i/n)),mul(v,s*sin(tau*i/n)))) for i in range(n)]
           for p,s in ((a,r),(b,rr))]
    for i in range(n):
        j=(i+1)%n
        g.face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],mat,smooth=smooth)
    for cap,ring in zip(caps,(rings[0][::-1],rings[1])):
        if cap: g.face(ring,mat)
        else: audit["hidden_triangles_omitted"]+=n-2


def sweep(g,points,r,mat,n=8,caps=(True,True)):
    """Continuous pipe/cable, no coincident interior end caps."""
    rings=[];last=None
    for i,p in enumerate(points):
        axis=unit(sub(points[min(i+1,len(points)-1)],points[max(i-1,0)]))
        u,v=basis(axis,last);last=u
        rings.append([add(p,add(mul(u,r*cos(tau*j/n)),mul(v,r*sin(tau*j/n)))) for j in range(n)])
    for a,b in zip(rings,rings[1:]):
        for i in range(n):
            j=(i+1)%n
            g.face([a[i],a[j],b[j],b[i]],mat,smooth=True)
    for cap,ring in zip(caps,(rings[0][::-1],rings[-1])):
        if cap: g.face(ring,mat)
        else: audit["hidden_triangles_omitted"]+=n-2


def torus(g,c,u,v,rx,ry,r,mat,n=14,k=6):
    """Elliptical chain link or collar; genuinely open central aperture."""
    u=unit(u);v=unit(v);w=unit(cross(u,v))
    rows=[]
    for i in range(n):
        a=tau*i/n
        p=add(c,add(mul(u,rx*cos(a)),mul(v,ry*sin(a))))
        outward=unit(add(mul(u,cos(a)/rx),mul(v,sin(a)/ry)))
        rows.append([add(p,add(mul(outward,r*cos(tau*j/k)),mul(w,r*sin(tau*j/k)))) for j in range(k)])
    for i in range(n):
        j=(i+1)%n
        for a in range(k):
            b=(a+1)%k
            g.face([rows[i][a],rows[j][a],rows[j][b],rows[i][b]],mat,smooth=True)


def circle(cx,cy,r,n=24):
    return [(cx+r*cos(tau*i/n),cy+r*sin(tau*i/n)) for i in range(n)]
def rect(x0,x1,y0,y1): return [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
def edges(poly): return zip(poly,poly[1:]+poly[:1])
def area(poly): return sum(a[0]*b[1]-a[1]*b[0] for a,b in edges(poly))/2
def ccw(poly): return poly if area(poly)>0 else poly[::-1]
def bounds(poly): return (min(x for x,y in poly),max(x for x,y in poly),min(y for x,y in poly),max(y for x,y in poly))
def overlap(a,b):
    return a[0]<b[1]-EPS and a[1]>b[0]+EPS and a[2]<b[3]-EPS and a[3]>b[2]+EPS
def contains(p,poly):
    x,y=p;inside=False
    for a,b in edges(poly):
        if (a[1]>y)!=(b[1]>y):
            if x < a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]): inside=not inside
    return inside
def irregular(cx,cy,rx,ry,n=12):
    return ccw([(cx+rx*rng.uniform(.66,1.)*cos(tau*i/n),
                 cy+ry*rng.uniform(.66,1.)*sin(tau*i/n)) for i in range(n)])


# ==================== CONFORMING CUTOUT TESSELLATOR =================
def cut_surface(domain,holes,xgrid=(),ygrid=()):
    """Planar rectangle minus non-overlapping simple polygonal holes.
    Vertical sweep adds all vertices and crossings with horizontal grid
    lines. At shared vertical boundaries, retain all split points, so
    adjacent patches weld rather than leave T-junctions.
    Each result is a convex cell and an interior material sample.
    """
    x0,x1,y0,y1=domain
    yy=sorted(set(round(y,8) for y in [y0,y1,*ygrid] if y0-EPS<=y<=y1+EPS))
    xx=[x0,x1,*[x for x in xgrid if x0<x<x1]]
    segments=[]
    for poly in holes:
        for a,b in edges(poly):
            xx.extend(p[0] for p in (a,b) if x0<p[0]<x1)
            if abs(a[1]-b[1])>EPS:
                for y in yy:
                    t=(y-a[1])/(b[1]-a[1])
                    if EPS<t<1-EPS:
                        x=a[0]+t*(b[0]-a[0])
                        if x0<x<x1:xx.append(x)
            segments.append((a,b))
    xx=sorted(set(round(x,8) for x in xx))
    sloped=[(a,b) for a,b in segments if abs(a[0]-b[0])>EPS]
    def at(e,x):
        a,b=e
        return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])
    def boundary_y(x):
        values=list(yy)
        for a,b in segments:
            lo,hi=sorted((a[0],b[0]))
            if lo-EPS*2<=x<=hi+EPS*2:
                if abs(a[0]-b[0])<=EPS:
                    values.extend((a[1],b[1]))
                else: values.append(at((a,b),x))
        return sorted(set(round(clamp(v,y0,y1),8) for v in values if y0-EPS*2<=v<=y1+EPS*2))
    ys={x:boundary_y(x) for x in xx}
    for l,r in zip(xx,xx[1:]):
        if r-l<EPS: continue
        mid=(l+r)/2
        lines=[((l,y),(r,y)) for y in yy]
        for e in sloped:
            a,b=e;lo,hi=sorted((a[0],b[0]))
            if lo<mid<hi and y0+EPS<at(e,mid)<y1-EPS:
                lines.append(e)
        lines.sort(key=lambda e:at(e,mid))
        for low,high in zip(lines,lines[1:]):
            yl,yh=at(low,mid),at(high,mid)
            if yh-yl<EPS: continue
            sample=(mid,(yl+yh)/2)
            if any(contains(sample,h) for h in holes):continue
            ll,lr,hl,hr=[round(clamp(y,y0,y1),8) for y in (at(low,l),at(low,r),at(high,l),at(high,r))]
            # Insert the same edge split vertices into both neighboring cells.
            p=[(l,ll),(r,lr)]
            p.extend((r,y) for y in ys[r] if lr+EPS<y<hr-EPS)
            p.extend([(r,hr),(l,hl)])
            p.extend((l,y) for y in reversed(ys[l]) if ll+EPS<y<hl-EPS)
            clean=[]
            for q in p:
                if not clean or q!=clean[-1]:clean.append(q)
            if len(clean)>1 and clean[0]==clean[-1]:clean.pop()
            if len(clean)>=3 and area(clean)>EPS:yield clean,sample


def distance_segment(p,a,b):
    d=sub(b,a);den=dot(d,d)
    return norm(sub(p,add(a,mul(d,clamp(dot(sub(p,a),d)/den,0,1))))) if den>EPS else norm(sub(p,a))


def on_outline(p,poly):
    return any(distance_segment(p,a,b)<3e-7 for a,b in edges(poly))


def flat_cut(g,domain,holes,transform,hint,style,xgrid=(),ygrid=()):
    """Create surface and return exact boundary edges of the cutout."""
    edge_map=defaultdict(list);actual=0.
    for poly,sample in cut_surface(domain,holes,xgrid,ygrid):
        actual+=area(poly)
        mat=style(*sample)
        g.patch([transform(*p) for p in poly],mat,hint)
        for a,b in edges(poly):edge_map[tuple(sorted((key(a),key(b))))].append((a,b))
    if any(len(v)>2 for v in edge_map.values()):
        raise AssertionError("non-manifold planar cut surface: "+g.name)
    border=[v[0] for v in edge_map.values() if len(v)==1]
    return actual,border


def assert_area(actual,domain,holes,label,tolerance=1e-4):
    x0,x1,y0,y1=domain
    expected=(x1-x0)*(y1-y0)-sum(abs(area(h)) for h in holes)
    if abs(actual-expected)>tolerance:
        raise AssertionError("%s cut area %.8f != %.8f"%(label,actual,expected))
    audit["cut_surfaces_verified"]+=1


# ============================== FLOOR ==============================
def plan_bounds():
    return (-ARM_ENDS[2],ARM_ENDS[0],-ARM_ENDS[3],ARM_ENDS[1])


def build_floor():
    x0,x1,y0,y1=plan_bounds()
    domain=(x0,x1,y0,y1)
    # Four corner voids make a true cross, not overlapping slabs.
    corner_voids=[rect(x0,-H,y0,-H),rect(H,x1,y0,-H),
                  rect(x0,-H,H,y1),rect(H,x1,H,y1)]
    drains=[(0.,0.,.55,32)]
    channels=[]
    for arm,end in enumerate(ARM_ENDS):
        u=(H+end)/2
        x,y,_=local(arm,u,0)
        drains.append((x,y,.33,24))
        for lo,hi in ((.60,u-.40),(u+.40,end-.50)):
            if hi-lo<.15:continue
            p=[local(arm,a,b)[:2] for a,b in ((lo,-.085),(hi,-.085),(hi,.085),(lo,.085))]
            channels.append((arm,lo,hi,ccw(p)))
    drain_polys=[circle(x,y,r,n) for x,y,r,n in drains]
    channel_polys=[c[3] for c in channels]
    cutouts=drain_polys+channel_polys
    holes=corner_voids+cutouts
    floor=Mesh("arena_floor",ARCH)
    rim=Mesh("drain_recesses",ARCH)
    bars=Mesh("drain_grates",ARCH)
    tile=.70;gap=.009
    def grid(lo,hi):
        values=[]
        for i in range(int(lo/tile)-2,int(hi/tile)+3):
            values.extend((i*tile-gap,i*tile+gap))
        return values
    xgrid=[-H,H,*grid(x0,x1)]
    ygrid=[-H,H,*grid(y0,y1)]
    styles={}
    def surface(x,y):
        if abs(x/tile-round(x/tile))*tile<gap+1e-7 or abs(y/tile-round(y/tile))*tile<gap+1e-7:
            return ("grout",-.007)
        cell=(int(x//tile),int(y//tile))
        if cell not in styles:
            if chance(.032):
                styles[cell]=("floor_dust",-.019)
                damage["missing_floor_tiles"]+=1
            else:
                styles[cell]=(rng.choices(["floor","floor_alt","floor_pale"],[7,2,1])[0],0.)
        return styles[cell]
    actual=0.;edge_map=defaultdict(list)
    for poly,sample in cut_surface(domain,holes,xgrid,ygrid):
        actual+=area(poly);mat,z=surface(*sample)
        floor.patch([(x,y,z) for x,y in poly],mat,(0,0,1))
        for a,b in edges(poly):edge_map[tuple(sorted((key(a),key(b))))].append((a,b,z))
    assert_area(actual,domain,holes,"cross floor",.002)
    for shared in edge_map.values():
        if len(shared)>2:raise AssertionError("floor non-manifold sweep edge")
        a,b,z=shared[0]
        if len(shared)==2:
            z2=shared[1][2]
            if abs(z-z2)>EPS:
                # A recessed seam or missing tile exposes a real vertical edge.
                high,low=max(z,z2),min(z,z2)
                if z2>z:a,b=b,a
                hint=(b[1]-a[1],a[0]-b[0],0)
                floor.face([(*a,high),(*b,high),(*b,low),(*a,low)],"grout",hint)
        else:
            mid=avg([a,b])
            if any(on_outline(mid,p) for p in cutouts):
                # Exact boundary of the drain, no overlapping dark decal.
                hint=(b[1]-a[1],a[0]-b[0],0)
                rim.face([(*a,z),(*b,z),(*b,-.22),(*a,-.22)],"exposed",hint)
            elif not any(abs(mid[0]-q)<1e-6 for q in (x0,x1,-H,H)) and not any(abs(mid[1]-q)<1e-6 for q in (y0,y1,-H,H)):
                raise AssertionError("unmatched floor interior edge "+str(mid))
    # Bottom of the recess is visible through grating; no buried underside.
    for (x,y,r,n),p in zip(drains,drain_polys):
        rim.patch([(*a,-.22) for a in p],"shadow",(0,0,1))
        inner=circle(x,y,r-.045,n)
        for i in range(n):
            j=(i+1)%n
            bars.face([(*p[i],0),(*p[j],0),(*inner[j],0),(*inner[i],0)],"iron",(0,0,1))
        # Bar endpoints are inside the inscribed polygon.
        ir=(r-.048)*cos(pi/n)
        q=-ir+.045
        while q<ir-.02:
            extent=sqrt(max(0.,ir*ir-(abs(q)+.012)**2))
            if extent>.025 and not chance(.035):
                box(bars,(x,y+q,-.025),(2*extent,.025,.05),"rust_dark" if chance(.40) else "iron")
            else:damage["missing_grate_bars"]+=1
            q+=.068
    for arm,lo,hi,p in channels:
        rim.face([(*a,-.22) for a in p],"shadow",(0,0,1))
        for side in (-1,1):
            abox(bars,arm,(lo+hi)/2,side*.074,-.016,hi-lo,.022,.032,"iron",omit=("bottom",))
        n=max(1,int((hi-lo)/.09))
        for i in range(n):
            if chance(.035):damage["missing_grate_bars"]+=1;continue
            abox(bars,arm,lo+(i+.5)*(hi-lo)/n,0,-.021,.029,.145,.042,
                 "rust_dark" if chance(.30) else "iron")
    audit["floor_plan_area_mm2"]=round((sum(ARM_ENDS)*WIDTH-WIDTH*WIDTH)*1e6)
    return floor


# =========================== SIDE WALLS =============================
NICHES=[]
def reveal(g,poly,transform,depth,border,material,back=True):
    """Use the exact cutout boundary. Rear cap only if this is a recess."""
    c=avg(poly)
    for a,b in border:
        mid=avg([a,b])
        if not on_outline(mid,poly):continue
        if abs(a[1])<EPS and abs(b[1])<EPS:continue # doorway sill is floor
        front=[transform(*p,0.) for p in (a,b)]
        rear=[transform(*p,depth) for p in (a,b)]
        hint=sub(transform(*c,depth/2),avg(front+rear))
        g.face([front[0],front[1],rear[1],rear[0]],material,hint)
    if back:
        # All generated irregular polygons are radial/star shaped.
        for a,b in edges(poly):
            g.face([transform(*c,depth),transform(*a,depth),transform(*b,depth)],
                   "exposed",sub(transform(*c,0),transform(*c,depth)))


def wall_material(u,z,arm,side):
    if z<.12:return "iron_dark"
    if z<1.10:
        return "wainscot_alt" if (int(u*2)+arm+(side>0))%5==0 else "wainscot"
    k=(int(u/.85)*13+int(z*4)*7+arm*3+(side>0)*5)%11
    return "concrete_alt" if k in (0,1,2) else "concrete_pale" if k==9 else "concrete"


def build_sidewalls():
    wall=Mesh("arena_wall",ARCH)
    niches=Mesh("wall_opening_reveals",ARCH)
    lining=Mesh("behind_through_breaches",ARCH)
    supports=Mesh("wall_buttresses",ARCH)
    for arm,end in enumerate(ARM_ENDS):
        for side in (-1,1):
            domain=(H,end,0.,SPRING)
            holes=[];descriptions=[]
            # Recessed service cabinet in the wall itself.
            mid=H+(end-H)*.57
            w=min(.58,(end-H)*.105)
            p=rect(mid-w,mid+w,.32,1.79)
            holes.append(p);descriptions.append((p,.48,True,"concrete_alt"))
            NICHES.append((arm,side,mid,w))
            # Non-overlapping cuts: physical missing plaster and occasional
            # through breach, both with jagged edges and actual reveals.
            for fraction in (.23,.82):
                if not chance(.91):continue
                u=H+(end-H)*fraction
                p=irregular(u,rng.uniform(1.48,2.25),min(.68,(end-H)*.10),rng.uniform(.24,.51),rng.randint(9,13))
                if any(overlap(bounds(p),bounds(q)) for q in holes):continue
                x0,x1,z0,z1=bounds(p)
                if x0<H+.10 or x1>end-.10 or z1>SPRING-.10:continue
                through=chance(.44)
                holes.append(p);descriptions.append((p,WALL_THICKNESS if through else rng.uniform(.085,.18),not through,"spall"))
                damage["through_wall_breaches" if through else "recessed_concrete_spalls"]+=1
                if through:
                    # Distant actual service space behind broken shell, not
                    # a black polygon attached to the front of the wall.
                    x0,x1,z0,z1=bounds(p)
                    pts=[local(arm,u,side*(H+.85),z) for u,z in rect(x0-.32,x1+.32,z0-.25,z1+.25)]
                    lining.face(pts,"shadow",vec(arm,0,-side))
            def transform(u,z,d=0.):
                return local(arm,u,side*(H+d),z)
            xgrid=[H+(end-H)*i/8 for i in range(1,8)]
            ygrid=[.12,1.10,1.85,2.55]
            actual,border=flat_cut(wall,domain,holes,transform,vec(arm,0,-side),
                  lambda u,z:wall_material(u,z,arm,side),xgrid,ygrid)
            assert_area(actual,domain,holes,"wall %d/%d"%(arm,side))
            for p,d,back,mat in descriptions:
                reveal(niches,p,transform,d,border,mat,back)
            # Structural ribs sit beyond the wall plane except for a shallow
            # visible shoulder; no closed blocks hidden behind the wall.
            for t in (.05,.96):
                u=H+(end-H)*t
                abox(supports,arm,u,side*(H-.045),SPRING/2,.16,.09,SPRING,"rib",
                     omit=("bottom","top","front" if side==1 else "back"))
    return wall


# ======================== VAULT AND OCULUS ===========================
def arch_z(v): return SPRING+(CROWN-SPRING)*sqrt(max(0.,1-(v/H)**2))
def arch_sample(i):
    t=-pi/2+pi*i/ARCH_SEGMENTS
    return H*sin(t),SPRING+(CROWN-SPRING)*cos(t)


def build_vault():
    shell=Mesh("groin_and_barrel_vault",ROOF)
    ribs=Mesh("vault_reinforcement_ribs",ROOF)
    well=Mesh("oculus_open_shaft",ROOF)
    grate=Mesh("oculus_grating",ROOF)
    rim_points=[]
    for arm,end in enumerate(ARM_ENDS):
        # Barrel vault, joined exactly to square central groin at U=H.
        cuts=[H+(end-H)*j/7 for j in range(8)]
        for j,(u0,u1) in enumerate(zip(cuts,cuts[1:])):
            for i in range(ARCH_SEGMENTS):
                v0,z0=arch_sample(i);v1,z1=arch_sample(i+1)
                shell.face([local(arm,u0,v0,z0),local(arm,u1,v0,z0),local(arm,u1,v1,z1),local(arm,u0,v1,z1)],
                           "vault_dark" if (j*7+i+arm)%13 in (0,1) else "vault",(0,0,-1),True)
        # Groin is the union of the perpendicular barrel volumes:
        # z = arch(min(abs(x),abs(y))). Four sectors meet on diagonals.
        # Each radial patch begins on the circular opening; no ceiling face
        # exists within the oculus. Outer points match the barrel exactly.
        sector=[]
        for i in range(ARCH_SEGMENTS+1):
            v,z=arch_sample(i)
            length=hypot(H,v)
            ring=[]
            for j in range(7):
                t=j/6
                r=OCULUS_RADIUS+(length-OCULUS_RADIUS)*t
                u=r*H/length;w=r*v/length
                ring.append(local(arm,u,w,arch_z(w)))
            sector.append(ring)
        for i in range(ARCH_SEGMENTS):
            for j in range(6):
                a,b=sector[i],sector[i+1]
                shell.face([a[j],a[j+1],b[j+1],b[j]],"vault",(0,0,-1),True)
        rim_points.extend(a[0] for a in sector[:-1])
        # Reinforcing arches follow the actual barrel profile. Visible
        # inner face + two longitudinal edges; the buried face is absent.
        for fraction in (.055,.38,.72,.96):
            u=H+(end-H)*fraction
            for i in range(ARCH_SEGMENTS):
                theta0=-pi/2+pi*i/ARCH_SEGMENTS
                theta1=-pi/2+pi*(i+1)/ARCH_SEGMENTS
                def p(t,offset,inset):
                    return local(arm,u+offset,(H-inset)*sin(t),SPRING+(CROWN-SPRING-inset)*cos(t))
                a,b=theta0,theta1
                ribs.face([p(a,-.10,.09),p(b,-.10,.09),p(b,.10,.09),p(a,.10,.09)],
                          "rib",(0,0,-1) if abs((a+b)/2)<1.50 else None)
                for off,sgn in ((-.10,-1),(.10,1)):
                    ribs.face([p(a,off,0),p(b,off,0),p(b,off,.09),p(a,off,.09)],"concrete_alt",vec(arm,sgn,0))
                audit["hidden_triangles_omitted"]+=2
    # Actual cylindrical shaft, open above. No fake luminous disk.
    top=CROWN+.34
    n=len(rim_points)
    for i in range(n):
        a=rim_points[i];b=rim_points[(i+1)%n]
        p=(a[0],a[1],top);q=(b[0],b[1],top)
        well.face([a,b,q,p],"spall",(-a[0]-b[0],-a[1]-b[1],0))
    # Grille clipped to the opening, high enough for GoPro to look upward.
    r=OCULUS_RADIUS-.025
    for axis in (0,1):
        for i in range(-5,6):
            w=i*.155
            if abs(w)+.018>=r:continue
            d=sqrt(r*r-(abs(w)+.018)**2)
            center=(0,w,top-.05) if axis==0 else (w,0,top-.09)
            size=(2*d,.036,.045) if axis==0 else (.036,2*d,.045)
            box(grate,center,size,"iron")
    audit["oculus_boundary_points"]=n
    return shell


# ========================= GATES AND ENDS ===========================
def gate_outline(w=1.48,base=2.28,rise=.65,n=20):
    return [(-w,0.),(w,0.)]+[(w*cos(pi*i/n),base+rise*sin(pi*i/n)) for i in range(n+1)]


def gate_top(v,poly):
    found=[]
    for a,b in edges(poly):
        lo,hi=sorted((a[0],b[0]))
        if lo-EPS<=v<=hi+EPS and abs(b[0]-a[0])>EPS:
            found.append(a[1]+(v-a[0])*(b[1]-a[1])/(b[0]-a[0]))
    return max(found) if found else 0.


def build_ends():
    walls=Mesh("end_gables",ARCH)
    frame=Mesh("arched_gate_frames",GATES)
    lattice=Mesh("arched_gate_lattices",GATES)
    passage=Mesh("recessed_passages_behind_gates",GATES)
    for arm,end in enumerate(ARM_ENDS):
        gate=gate_outline()
        # The top exclusions use the exact sampled arch boundary.
        # Build two non-overlapping polygons from arch to crown.
        half=ARCH_SEGMENTS//2
        left=[arch_sample(i) for i in range(half+1)]
        right=[arch_sample(i) for i in range(half,ARCH_SEGMENTS+1)]
        outside=[ccw(left+[(left[0][0],CROWN)]),ccw(right+[(right[-1][0],CROWN)])]
        domain=(-H,H,0.,CROWN)
        holes=[gate,*outside]
        def transform(v,z,d=0.):return local(arm,end+d,v,z)
        actual,border=flat_cut(walls,domain,holes,transform,vec(arm,-1,0),
                     lambda v,z:"wainscot" if z<1.10 else "concrete",[-H/2,0,H/2],[.12,1.1,2.28,SPRING])
        assert_area(actual,domain,holes,"end gable %d"%arm)
        reveal(frame,gate,transform,WALL_THICKNESS,border,"spall",False)
        # Arched frame placed within opening. No rectangular solid covering it.
        w=1.48;spring=2.28;rise=.65;depth=.13
        for v in (-w+.055,w-.055):
            abox(frame,arm,end+.10,v,spring/2,depth,.11,spring,"iron_dark",omit=("bottom",))
        for i in range(20):
            a=pi*i/20;b=pi*(i+1)/20
            outer=[(w*cos(t),spring+rise*sin(t)) for t in (a,b)]
            inner=[((w-.11)*cos(t),spring+(rise-.10)*sin(t)) for t in (a,b)]
            frame.face([transform(*outer[0],.035),transform(*outer[1],.035),
                        transform(*inner[1],.035),transform(*inner[0],.035)],"iron",vec(arm,-1,0))
            frame.face([transform(*inner[0],.035),transform(*inner[1],.035),
                        transform(*inner[1],.165),transform(*inner[0],.165)],"iron_dark",vec(arm,0,-(inner[0][0]+inner[1][0]),-1))
        # Bars are clipped to the actual arched aperture.
        for i in range(-8,9):
            v=i*.155
            z=gate_top(v,gate)-.12
            if z<=.1:continue
            if chance(.055) and i not in (-8,8,0):
                damage["missing_gate_bars"]+=1;continue
            abox(lattice,arm,end+.10,v,z/2,.055,.046,z,"iron",omit=("bottom",))
        for z in (.19,.58,1.00,1.43,1.86,2.23,2.52,2.73):
            q=1.33 if z<=spring else (w-.11)*sqrt(max(0.,1-((z-spring)/(rise-.10))**2))
            if q>.08:abox(lattice,arm,end+.072,0,z,.06,2*q,.046,"rust_dark")
        abox(lattice,arm,end+.02,.08,1.27,.09,.18,.23,"rust")
        # A visible recessed continuation prevents holes showing a bare void.
        far=end+1.6
        passage.face([local(arm,end,-w,0),local(arm,far,-w,0),local(arm,far,w,0),local(arm,end,w,0)],"floor_dark" if "floor_dark" in PALETTE else "floor_dust",(0,0,1))
        for side in (-1,1):
            passage.face([local(arm,end+.24,side*w,0),local(arm,far,side*w,0),local(arm,far,side*w,3.10),local(arm,end+.24,side*w,3.10)],"shadow",vec(arm,0,-side))
        passage.face([local(arm,far,-w,0),local(arm,far,w,0),local(arm,far,w,3.10),local(arm,far,-w,3.10)],"iron_dark",vec(arm,-1,0))
        passage.face([local(arm,end+.24,-w,3.10),local(arm,end+.24,w,3.10),local(arm,far,w,3.10),local(arm,far,-w,3.10)],"shadow",(0,0,-1))
    return walls


# ======================= UTILITY AND LIGHTING =======================
PREVIEW_LIGHTS=[]
def build_utilities():
    main=Mesh("overhead_pipe_runs",PIPES)
    flanges=Mesh("pipe_flanges_and_clamps",PIPES)
    wiring=Mesh("broken_wiring_and_conduits",PIPES)
    panels=Mesh("recessed_electrical_panels",PIPES)
    lamps=Mesh("wall_lamp_housings",LAMP)
    bulbs=Mesh("wall_lamp_bulbs",LAMP)
    signals=Mesh("gate_signal_lights",LAMP)
    for arm,end in enumerate(ARM_ENDS):
        for side in (-1,1):
            v=side*(H-.18);z=2.67
            # The main pipe uses a continuous bent section rather than stacked
            # closed cylinders. Exposed end caps only at free ends.
            u0=H+.16;u1=end-.30
            pts=[local(arm,u0,v,z),local(arm,u1-.32,v,z),
                 local(arm,u1-.14,v,z-.07),local(arm,u1,v,z-.23),
                 local(arm,u1,v,z-.46),local(arm,u1,v,1.96)]
            sweep(main,pts,.113,"iron",12,caps=(True,False))
            for j in range(4):
                u=u0+.42+(u1-u0-.84)*j/3
                p=local(arm,u-.035,v,z);q=local(arm,u+.035,v,z)
                tube(flanges,p,q,.147,"rust" if chance(.60) else "edge",14,caps=(True,True))
                for k in range(4):
                    a=tau*k/4;vv=v+.127*cos(a);zz=z+.127*sin(a)
                    tube(flanges,local(arm,u-.047,vv,zz),local(arm,u+.047,vv,zz),.017,"iron_dark",6)
            # A thin auxiliary conduit above floor and a damaged suspended lead.
            sweep(wiring,[local(arm,H+.12,side*(H-.055),1.16),
                          local(arm,end-.22,side*(H-.055),1.16)],.024,"iron_dark",8,caps=(False,True))
            if chance(.88):
                u=H+(end-H)*.30
                pts=[local(arm,u+.65*t,side*(H-.13-.13*sin(pi*t)),2.66-.72*sin(pi*t/2))
                     for t in (j/12 for j in range(13))]
                sweep(wiring,pts,.013,"rubber",7,caps=(False,True))
                damage["loose_cables"]+=1
            for frac in (.17,.61,.90):
                u=H+(end-H)*frac
                # Offset alternating bays, instead of mirror-perfect lighting.
                u+=.11*side
                z=2.19
                abox(lamps,arm,u,side*(H-.025),z,.23,.05,.28,"iron_dark",
                     omit=("front" if side==1 else "back",))
                sweep(lamps,[local(arm,u,side*(H-.07),z+.08),
                             local(arm,u,side*(H-.22),z+.14),
                             local(arm,u,side*(H-.34),z+.07)],.031,"iron",8,caps=(False,False))
                x,y,_=local(arm,u,side*(H-.34))
                # Open conical shade: no bottom cap covering the light.
                for k in range(16):
                    a,b=tau*k/16,tau*(k+1)/16
                    def p(r,t,h):return (x+r*cos(t),y+r*sin(t),h)
                    lamps.face([p(.075,a,z+.05),p(.075,b,z+.05),p(.22,b,z-.08),p(.22,a,z-.08)],"iron",smooth=True)
                    lamps.face([p(.22,a,z-.08),p(.22,b,z-.08),p(.205,b,z-.08),p(.205,a,z-.08)],"edge",(0,0,-1))
                    lamps.face([p(.205,a,z-.08),p(.205,b,z-.08),p(.066,b,z+.037),p(.066,a,z+.037)],"concrete_pale",smooth=True)
                working=not chance(.31)
                tube(bulbs,(x,y,z-.11),(x,y,z-.035),.078,"lamp_warm" if working else "glass",12,caps=(True,False))
                if working:PREVIEW_LIGHTS.append(("POINT",(x,y,z-.12),None,35,(1.,.72,.42),.25))
                else:damage["dead_wall_lamps"]+=1
        # Red gate indicator, rather than a furnace or central apparatus.
        for side in (-1,1):
            v=side*1.67
            abox(signals,arm,end-.055,v,2.72,.10,.14,.18,"iron_dark",omit=("right",))
            working=not chance(.14)
            abox(signals,arm,end-.114,v,2.72,.02,.095,.095,"signal_red" if working else "signal_dead")
            if working:PREVIEW_LIGHTS.append(("POINT",local(arm,end-.25,v,2.69),None,18,(1.,.09,.035),.22))
    # Recessed wall panels: real internal volume, some covers absent.
    for arm,side,u,w in NICHES:
        center=side*(H+.24)
        abox(panels,arm,u,side*(H+.43),1.03,1.48*w,.035,1.25,"iron_dark")
        for x in (-.70*w,.70*w):
            abox(panels,arm,u+x,center,1.03,.04,.39,1.25,"rust")
        for z in (.42,1.64):
            abox(panels,arm,u,center,z,1.40*w,.39,.045,"iron")
        for j in range(3):
            z=.67+j*.30
            abox(panels,arm,u,side*(H+.30),z,.95*w,.08,.20,"iron")
            for x in (-.30*w,0,.30*w):
                abox(panels,arm,u+x,side*(H+.25),z,.07,.045,.095,"brass" if j==1 else "rubber")
        if not chance(.63):
            # Thin cover, not a solid block filling the recess.
            abox(panels,arm,u,side*(H+.035),1.03,1.37*w,.035,1.20,"iron")
        else:damage["missing_panel_covers"]+=1


# ======================== SUSPENSION CHAINS =========================
def build_chains():
    g=Mesh("hanging_chain_links",CHAIN)
    eyes=Mesh("chain_mounting_eyes",CHAIN)
    torn=Mesh("torn_hanging_canvas",DEBRIS)
    # Central chains hang around the real skylight. Keep lower ring >=3.25 m,
    # leaving gameplay and spectator camera space clear.
    for i in range(6):
        a=tau*i/6+.19+(rng.uniform(-.10,.10) if DECAY else 0)
        r=1.40+rng.uniform(.05,.35)
        x,y=r*cos(a),r*sin(a)
        ceiling=arch_z(min(abs(x),abs(y)))
        length=min(ceiling-3.37,1.12+rng.uniform(0,.35))
        if length<.45:continue
        links=max(4,min(CHAIN_LINKS,round(length/.104)))
        torus(eyes,(x,y,ceiling-.055),(1,0,0),(0,0,1),.065,.070,.013,"iron",12,5)
        for j in range(links):
            t=(j+.5)/links
            p=(x+.09*sin(pi*t),y+.045*sin(pi*t),ceiling-.10-t*(length-.10))
            v=(cos(a),sin(a),0) if j%2==0 else (-sin(a),cos(a),0)
            torus(g,p,(0,0,1),v,.067,.039,.011,"rust_dark" if chance(.42) else "iron",12,5)
        v=(cos(a),sin(a),0)
        torus(eyes,(x,y,ceiling-length-.06),(0,0,1),v,.093,.080,.016,"iron_dark",16,6)
    for arm,end in enumerate(ARM_ENDS):
        # Small wall-side chain, no floor obstacle at crossing.
        if chance(.70):
            u=H+(end-H)*.45;v=(1 if arm%2==0 else -1)*(H-.75)
            z=arch_z(v)-.08
            for j in range(6):
                p=local(arm,u,v,z-j*.103)
                direction=vec(arm,1,0) if j%2==0 else vec(arm,0,1)
                torus(g,p,(0,0,1),direction,.064,.037,.010,"rust_dark",12,5)
        if not chance(.86):continue
        side=1 if arm%2==0 else -1
        u=H+(end-H)*.14;v=side*(H-.55)
        z=arch_z(v)-.035
        verts=[];nx=9;ny=5
        for ix in range(nx):
            x=(ix/(nx-1)-.5)*.51
            length=rng.uniform(.40,1.05)
            for iy in range(ny):
                t=iy/(ny-1)
                verts.append(local(arm,u+x, v-.065*side*sin(ix*1.7+t*2), z-length*t))
        for ix in range(nx-1):
            for iy in range(ny-1):
                if iy==ny-2 and chance(.38):continue
                a=ix*ny+iy;b=(ix+1)*ny+iy
                torn.face([verts[a],verts[b],verts[b+1],verts[a+1]],"cloth")


# ======================== PERIPHERAL CLUTTER ========================
def open_crate(g,arm,u,v,scale):
    w=.48*scale;d=.42*scale;h=.41*scale;t=.045*scale
    # A true hollow damaged container, not a dark rectangle on a closed box.
    abox(g,arm,u,v,t/2,w,d,t,"wood",omit=("bottom",))
    for sign in (-1,1):
        abox(g,arm,u+sign*(w-t)/2,v,h/2,t,d,h,"wood",omit=("bottom",))
        if not chance(.23):
            abox(g,arm,u,v+sign*(d-t)/2,h/2,w-2*t,t,h,"wood",omit=("bottom",))
        else:
            # Partial remaining plank exposes the broken side.
            abox(g,arm,u,v+sign*(d-t)/2,h*.20,w-2*t,t,h*.40,"wood",omit=("bottom",))
            damage["broken_crate_walls"]+=1
    for sign in (-1,1):
        abox(g,arm,u+sign*w*.34,v,h+.006,.04*scale,d,.025*scale,"iron",omit=("bottom",))


def build_debris():
    boxes=Mesh("broken_perimeter_crates",DEBRIS)
    barrels=Mesh("empty_perimeter_canisters",DEBRIS)
    rubble=Mesh("wall_fragment_rubble",DEBRIS)
    paper=Mesh("paper_and_fabric_scraps",DEBRIS)
    coils=Mesh("perimeter_cable_coils",DEBRIS)
    for arm,end in enumerate(ARM_ENDS):
        for side in (-1,1):
            # No cage, furnace, iron chair, human figures or central obstacle.
            u=H+(end-H)*(.10 if side==1 else .89)
            v=side*(H-.29)
            open_crate(boxes,arm,u,v,rng.uniform(.78,1.02))
            u2=u+(.70 if side==1 else -.70)
            if chance(.83):
                p=local(arm,u2,side*(H-.24),.012)
                h=rng.uniform(.32,.54);r=.18
                # Open canister, with real inner shell and visible lip.
                x,y,z=p
                for i in range(14):
                    a,b=tau*i/14,tau*(i+1)/14
                    def pp(rr,t,zz):return (x+rr*cos(t),y+rr*sin(t),z+zz)
                    barrels.face([pp(r,a,0),pp(r,b,0),pp(r,b,h),pp(r,a,h)],"rust_dark",smooth=True)
                    barrels.face([pp(r-.018,a,h),pp(r-.018,b,h),pp(r-.018,b,.045),pp(r-.018,a,.045)],"iron_dark",smooth=True)
                    barrels.face([pp(r,a,h),pp(r,b,h),pp(r-.018,b,h),pp(r-.018,a,h)],"edge",(0,0,1))
                    barrels.face([(x,y,z+.045),pp(r-.018,a,.045),pp(r-.018,b,.045)],"shadow",(0,0,1))
                for zz in (.10,h-.06):
                    torus(barrels,(x,y,z+zz),(1,0,0),(0,1,0),r,r,.015,"iron",14,5)
            if chance(.55):
                p=local(arm,H+(end-H)*.72,side*(H-.32),.025)
                pts=[]
                for j in range(37):
                    t=j/36;a=t*tau*2.7;r=.19-.10*t
                    pts.append((p[0]+r*cos(a),p[1]+r*sin(a),p[2]+.025*t))
                sweep(coils,pts,.014,"rubber",7)
            for j in range(round(22*DECAY)):
                u=rng.uniform(H+.22,end-.25);v=side*rng.uniform(H-.32,H-.10)
                c=local(arm,u,v,.002);r=rng.uniform(.024,.09);h=rng.uniform(.018,.075);n=rng.randint(4,6)
                pts=[add(c,(r*rng.uniform(.66,1.)*cos(tau*i/n),r*rng.uniform(.66,1.)*sin(tau*i/n),0.)) for i in range(n)]
                top=add(c,(r*.12,-r*.17,h))
                for a,b in edges(pts):rubble.face([a,b,top],rng.choice(["exposed","spall","concrete_alt"]))
                audit["hidden_triangles_omitted"]+=n-2
            for j in range(round(6*DECAY)):
                c=local(arm,rng.uniform(H+.25,end-.30),side*(H-.45),.012)
                p=[add(c,(.12*rng.uniform(.65,1.)*cos(tau*i/6),.07*rng.uniform(.65,1.)*sin(tau*i/6),rng.uniform(0,.013))) for i in range(6)]
                for a,b in edges(p):paper.face([avg(p),a,b],"paper",(0,0,1))


# ======================= CAMERA FIXTURES =============================
CAMERA_VIEWS=[]
def build_cameras():
    for arm,end in enumerate(ARM_ENDS):
        g=Mesh("camera_%02d_housing"%(arm+1),CAMS)
        lens=Mesh("camera_%02d_lens"%(arm+1),CAMS)
        u=end-.35;z=3.10
        # Suspended from the crown. The view point is in front of the hood.
        tube(g,local(arm,u,0,z+.15),local(arm,u,0,CROWN-.03),.037,"iron",10,caps=(False,False))
        abox(g,arm,u,0,z,.32,.25,.23,"iron")
        abox(g,arm,u-.045,0,z+.14,.45,.32,.04,"edge")
        tube(g,local(arm,u-.14,0,z),local(arm,u-.225,0,z),.096,"iron_dark",16,caps=(False,True))
        tube(lens,local(arm,u-.225,0,z),local(arm,u-.240,0,z),.070,"glass",16,caps=(False,True))
        CAMERA_VIEWS.append((local(arm,end-.92,0,3.0),(0.,0.,1.15)))


# ======================= PURE GEOMETRY VALIDATION ====================
def validate():
    if not 0<=DECAY<=1:raise ValueError("DECAY must be 0..1")
    if len(ARM_ENDS)!=4 or min(ARM_ENDS)<=H+3:
        raise ValueError("Each arm must extend at least 3m from central square")
    if ARCH_SEGMENTS<16 or ARCH_SEGMENTS%2:raise ValueError("ARCH_SEGMENTS must be even and >=16")
    if not 0<OCULUS_RADIUS<H*.7:raise ValueError("invalid oculus radius")
    total=Counter();names=set()
    for g in BUILDERS:
        if not g.f:continue
        if g.name in names:raise AssertionError("duplicate "+g.name)
        names.add(g.name)
        if len(g.f)!=len(g.mat) or len(g.f)!=len(g.smooth):raise AssertionError("face attributes")
        if not all(isfinite(x) for p in g.v for x in p):raise AssertionError("nonfinite "+g.name)
        for f in g.f:
            if len(f)<3 or len(set(f))!=len(f) or not all(0<=i<len(g.v) for i in f):
                raise AssertionError("invalid polygon "+g.name)
            p=[g.v[i] for i in f]
            n=(0.,0.,0.)
            for a,b in edges(p):n=add(n,cross(a,b))
            if norm(n)<EPS:raise AssertionError("zero area "+g.name)
        total[g.group]+=g.triangles
    floor=next(g for g in BUILDERS if g.name=="arena_floor")
    x0,x1,y0,y1=plan_bounds()
    for axis,lo,hi in ((0,x0,x1),(1,y0,y1)):
        assert abs(min(p[axis] for p in floor.v)-lo)<1e-6
        assert abs(max(p[axis] for p in floor.v)-hi)<1e-6
    assert abs(max(p[2] for p in floor.v))<1e-6
    # Raised debris is confined to the wall-side strip, outside the central
    # intersection. Overhead chains and roof do not cross player height.
    for g in BUILDERS:
        if g.group==DEBRIS:
            for x,y,z in g.v:
                if abs(x)<H-.01 and abs(y)<H-.01 and .02<z<3.1:
                    raise AssertionError("central obstruction "+g.name)
    triangles=sum(total.values())
    if triangles>MAX_TRIANGLES:
        raise RuntimeError("Triangle budget exceeded: %d > %d"%(triangles,MAX_TRIANGLES))
    print("\n=== ECCEPRY CROSS / GEOMETRY AUDIT ===")
    for group,n in sorted(total.items()):print("%-28s %8d triangles"%(group,n))
    print("TOTAL: %d / %d triangles; %d nonempty editable meshes"%(triangles,MAX_TRIANGLES,len(names)))
    print("Plan %.2f x %.2f m; clear corridor width %.2f m; spring %.2f m; crown %.2f m"%(x1-x0,y1-y0,WIDTH,SPRING,CROWN))
    print("Checks:",dict(audit))
    print("Damage:",dict(damage))
    return triangles


def generate():
    if WIDTH<=0 or len(ARM_ENDS)!=4 or min(ARM_ENDS)<=H+3:raise ValueError("invalid plan")
    if ARCH_SEGMENTS<16 or ARCH_SEGMENTS%2:raise ValueError("invalid arch resolution")
    build_floor()
    build_sidewalls()
    build_vault()
    build_ends()
    build_utilities()
    build_chains()
    build_debris()
    build_cameras()
    return validate()


# ========================== BLENDER ADAPTER =========================
def srgb_linear(h):
    x=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in x)


def build_blender(triangles,args):
    import bpy
    from mathutils import Vector
    scene=bpy.data.scenes.new(SCENE_NAME)
    if bpy.context.window:bpy.context.window.scene=scene
    layer=scene.view_layers[0]
    scene.unit_settings.system="METRIC";scene.unit_settings.scale_length=1.
    scene["arena_id"]="cross"
    scene["corridor_width_m"]=WIDTH
    scene["playable_bounds_m"]=list(plan_bounds())
    scene["visual_only"]=True
    scene["no_image_textures"]=True
    scene["no_vertex_colors"]=True
    scene["triangle_budget"]=MAX_TRIANGLES
    scene["decay"]=DECAY
    def coll(name,parent):
        c=bpy.data.collections.new(name);parent.children.link(c);return c
    root=coll("CROSS_GAME",scene.collection)
    groups={k:coll(k,root) for k in COLLECTIONS}
    preview=coll("PREVIEW_ONLY",scene.collection)

    def material(k,gradient):
        color=srgb_linear(PALETTE[k])
        mat=bpy.data.materials.new("CROSS_"+k+("_Gradient" if gradient else "_Flat"))
        mat.use_nodes=True;mat.diffuse_color=(*color,1)
        if hasattr(mat,"use_backface_culling"):mat.use_backface_culling=k not in DOUBLE_SIDED
        nd=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nd.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value=(*color,1)
        bsdf.inputs["Metallic"].default_value=0.
        bsdf.inputs["Roughness"].default_value=.82 if k in METAL_MATS else .93
        if k in EMISSION:
            bsdf.inputs["Emission Color"].default_value=(*color,1)
            bsdf.inputs["Emission Strength"].default_value=EMISSION[k]
            return mat
        if not gradient:return mat
        geo=nd.new("ShaderNodeNewGeometry");geo.location=(-720,100)
        xyz=nd.new("ShaderNodeSeparateXYZ");xyz.location=(-510,100)
        links.new(geo.outputs["Position"],xyz.inputs["Vector"])
        mapping=nd.new("ShaderNodeMapRange");mapping.clamp=True
        mapping.interpolation_type="SMOOTHSTEP";mapping.location=(-275,100)
        if k in FLOOR_MATS:
            # Soft edge darkening based on distance to the closer corridor axis.
            ax=nd.new("ShaderNodeMath");ax.operation="ABSOLUTE"
            ay=nd.new("ShaderNodeMath");ay.operation="ABSOLUTE"
            nearest=nd.new("ShaderNodeMath");nearest.operation="MINIMUM"
            links.new(xyz.outputs["X"],ax.inputs[0]);links.new(xyz.outputs["Y"],ay.inputs[0])
            links.new(ax.outputs[0],nearest.inputs[0]);links.new(ay.outputs[0],nearest.inputs[1])
            links.new(nearest.outputs[0],mapping.inputs["Value"])
            mapping.inputs["From Min"].default_value=0.
            mapping.inputs["From Max"].default_value=H
            factors=(1.03,1-GRADIENT_STRENGTH)
        else:
            links.new(xyz.outputs["Z"],mapping.inputs["Value"])
            mapping.inputs["From Min"].default_value=0.
            mapping.inputs["From Max"].default_value=CROWN
            factors=(1-GRADIENT_STRENGTH,1.04)
        ramp=nd.new("ShaderNodeValToRGB");ramp.location=(-10,100)
        ramp.color_ramp.interpolation="EASE"
        for e,f in zip(ramp.color_ramp.elements,factors):
            e.color=(*[clamp(c*f,0.,1.) for c in color],1)
        links.new(mapping.outputs["Result"],ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"],bsdf.inputs["Base Color"])
        return mat

    flat={k:material(k,False) for k in PALETTE}
    mats={k:material(k,True) for k in PALETTE} if MATERIAL_MODE=="PREVIEW" else flat
    objects={};actual=0
    for g in BUILDERS:
        if not g.f:continue
        mesh=bpy.data.meshes.new(g.name+"_mesh")
        mesh.from_pydata(g.v,[],g.f)
        if mesh.validate(verbose=False):raise RuntimeError("Blender altered invalid mesh "+g.name)
        mesh.update()
        keys=list(dict.fromkeys(g.mat))
        for k in keys:mesh.materials.append(mats[k])
        ids={k:i for i,k in enumerate(keys)}
        for p,k,s in zip(mesh.polygons,g.mat,g.smooth):p.material_index=ids[k];p.use_smooth=s
        mesh.calc_loop_triangles();actual+=len(mesh.loop_triangles)
        if len(mesh.color_attributes):raise AssertionError("unexpected vertex colors")
        ob=bpy.data.objects.new(g.name,mesh);groups[g.group].objects.link(ob)
        ob["asset_name"]=g.name;ob["render_only"]=True
        objects[g.name]=(ob,keys)
    if actual>MAX_TRIANGLES:raise RuntimeError("Blender triangle budget exceeded")
    if actual!=triangles:raise RuntimeError("Unexpected triangulation: %d != %d"%(actual,triangles))
    scene["triangle_count"]=actual
    scene["editable_meshes"]=len(objects)

    if ADD_PREVIEW:
        world=bpy.data.worlds.new("CROSS_PreviewWorld");world.use_nodes=True
        bg=world.node_tree.nodes.get("Background")
        bg.inputs["Color"].default_value=(.17,.19,.23,1)
        bg.inputs["Strength"].default_value=.26
        scene.world=world
        def light(name,kind,p,target,energy,color,size):
            data=bpy.data.lights.new(name,kind);data.energy=energy;data.color=color
            if kind=="AREA":data.shape="DISK";data.size=size
            else:data.shadow_soft_size=size
            ob=bpy.data.objects.new(name,data);preview.objects.link(ob);ob.location=p
            if target is not None:ob.rotation_euler=(Vector(target)-ob.location).to_track_quat("-Z","Y").to_euler()
        light("preview_oculus","AREA",(0,0,CROWN+.42),(0,0,0),1350,(.72,.82,1.),1.55)
        for i,(kind,p,target,power,color,size) in enumerate(PREVIEW_LIGHTS):
            light("preview_practical_%02d"%i,kind,p,target,power,color,size)
        for arm,end in enumerate(ARM_ENDS):
            light("preview_bounce_%02d"%arm,"AREA",local(arm,H+.4,0,3.65),local(arm,end-.7,0,1.4),110,(.73,.78,.85),2.3)
        def camera(name,pos,target,lens):
            data=bpy.data.cameras.new(name);data.lens=lens;data.clip_end=100
            ob=bpy.data.objects.new(name,data);preview.objects.link(ob);ob.location=pos
            ob.rotation_euler=(Vector(target)-ob.location).to_track_quat("-Z","Y").to_euler()
            return ob
        # Diagonal view from the open central square toward two arms.
        scene.camera=camera("preview_crossing",(-3.05,-3.05,1.62),(2.6,2.6,2.5),17)
        for i,(p,t) in enumerate(CAMERA_VIEWS):
            camera("preview_surveillance_%02d"%(i+1),p,t,19)
        camera("preview_reverse",(3.05,3.05,1.65),(-2.6,-2.6,2.4),17)
        top=camera("preview_floor_plan",(0,0,30),(0,0,0),45)
        top.data.type="ORTHO";top.data.ortho_scale=max(ARM_ENDS[0]+ARM_ENDS[2],ARM_ENDS[1]+ARM_ENDS[3])+3
        top["note"]="Hide 02_Vault_and_oculus and 06_Chains for unobstructed plan"
        scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100

    layer.update()
    def export_glb(filepath):
        filepath=str(Path(filepath).expanduser())
        Path(filepath).parent.mkdir(parents=True,exist_ok=True)
        old_names={};displaced={};old_mats={}
        selection={ob:ob.select_get(view_layer=layer) for ob in layer.objects}
        old_active=layer.objects.active
        try:
            for ob in layer.objects:ob.select_set(False,view_layer=layer)
            for name,(ob,keys) in objects.items():
                old_names[ob]=ob.name;old_mats[ob]=list(ob.data.materials)
                other=bpy.data.objects.get(name)
                if other is not None and other!=ob:
                    displaced[other]=other.name
                    other.name="__CROSS_RESERVED_"+name
                ob.name=name
                for i,k in enumerate(keys):ob.data.materials[i]=flat[k]
                ob.select_set(True,view_layer=layer)
            layer.objects.active=objects["arena_floor"][0]
            options=dict(filepath=filepath,export_format="GLB",use_selection=True,
                         export_yup=True,export_cameras=False,export_lights=False,
                         export_extras=True,export_materials="EXPORT")
            props=bpy.ops.export_scene.gltf.get_rna_type().properties
            if "export_vertex_color" in props:
                values={v.identifier for v in props["export_vertex_color"].enum_items}
                if "NONE" in values:options["export_vertex_color"]="NONE"
            with bpy.context.temp_override(scene=scene,view_layer=layer):
                result=bpy.ops.export_scene.gltf(**{k:v for k,v in options.items() if k in props})
            if "FINISHED" not in result:raise RuntimeError("GLB export failed")
        finally:
            for ob,matlist in old_mats.items():
                for i,mat in enumerate(matlist):ob.data.materials[i]=mat
            for ob in old_names:ob.name="__CROSS_RESTORE_"+old_names[ob]
            for ob,name in displaced.items():ob.name=name
            for ob,name in old_names.items():ob.name=name
            for ob,selected in selection.items():ob.select_set(selected,view_layer=layer)
            layer.objects.active=old_active
        # Validate the actual binary, not just Blender's triangle estimate.
        import json,struct
        with open(filepath,"rb") as f:
            magic,version,length=struct.unpack("<4sII",f.read(12))
            chunk,kind=struct.unpack("<I4s",f.read(8))
            if magic!=b"glTF" or version!=2 or kind!=b"JSON":raise RuntimeError("invalid GLB header")
            doc=json.loads(f.read(chunk).decode("utf-8"))
        count=0
        for mesh in doc.get("meshes",[]):
            for primitive in mesh.get("primitives",[]):
                if primitive.get("mode",4)!=4:raise RuntimeError("unexpected primitive mode")
                if "COLOR_0" in primitive["attributes"]:raise RuntimeError("unexpected exported vertex color")
                index=primitive.get("indices",primitive["attributes"]["POSITION"])
                count+=doc["accessors"][index]["count"]//3
        if count>MAX_TRIANGLES or count!=actual:raise RuntimeError("unexpected GLB triangle count %d (Blender %d)"%(count,actual))
        if doc.get("images") or doc.get("textures"):raise RuntimeError("unexpected GLB image texture")
        print("GLB VERIFIED:",filepath,count,"triangles; zero textures, zero vertex colors")

    path=args.export_glb or (EXPORT_FILE if AUTO_EXPORT_GLB else "")
    if AUTO_EXPORT_GLB and not path:
        path=str((Path(bpy.data.filepath).parent if bpy.data.filepath else Path.home())/"eccepry_cross_corridor.glb")
    if path:export_glb(path)
    for screen in bpy.data.screens:
        for a in screen.areas:
            if a.type=="VIEW_3D":
                a.spaces.active.shading.color_type="MATERIAL"
                if ADD_PREVIEW:a.spaces.active.region_3d.view_perspective="CAMERA"
    if args.save_blend:
        with bpy.context.temp_override(scene=scene,view_layer=layer):
            bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.save_blend).expanduser().resolve()))
    if args.render_preview:
        if not ADD_PREVIEW:raise RuntimeError("Preview disabled")
        scene.render.filepath=str(Path(args.render_preview).expanduser().resolve())
        with bpy.context.temp_override(scene=scene,view_layer=layer):
            bpy.ops.render.render(write_still=True)
    print("CROSS ready. Preview lights/cameras are excluded from GLB.")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-geometry",action="store_true")
    parser.add_argument("--export-glb",default="")
    parser.add_argument("--save-blend",default="")
    parser.add_argument("--render-preview",default="")
    # Blender arguments are before --; Scripting workspace has no --.
    argv=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else (
        sys.argv[1:] if "--check-geometry" in sys.argv else [])
    args=parser.parse_args(argv)
    triangles=generate()
    if not args.check_geometry:build_blender(triangles,args)


if __name__=="__main__":
    main()
