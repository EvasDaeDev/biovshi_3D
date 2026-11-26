import type {Vec3} from '../types.js';
import type {MotionProfile} from './motion-profile.js';
const clamp=(x:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
const follow=(x:number,target:number,dt:number,tau:number)=>x+(target-x)*(1-Math.exp(-dt/tau));
const rad=(deg:number)=>deg*Math.PI/180;
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const length=(v:Vec3,n:number):Vec3=>{const d=Math.hypot(...v);return d>1e-8?[v[0]*n/d,v[1]*n/d,v[2]*n/d]:[0,-n,0];};
/** Interpolate angular coordinates rather than normalizing a linear
 * blend of nearly opposed arm directions. Signed sagittal pitch passes
 * through the hanging-down pose, not over the head, when changing from
 * guard to a sprint. Lateral inclination remains continuous.
 * Each result has unit length even at the middle of a 180-degree change. */
function blendDirection(from:Vec3,to:Vec3,t:number):Vec3{
 const a=length(from,1),b=length(to,1);
 const pa=Math.atan2(-a[2],-a[1]),pb=Math.atan2(-b[2],-b[1]);
 const la=Math.asin(clamp(a[0],-1,1)),lb=Math.asin(clamp(b[0],-1,1));
 const pitch=pa+(pb-pa)*t,lateral=la+(lb-la)*t,c=Math.cos(lateral);
 return [Math.sin(lateral),-Math.cos(pitch)*c,-Math.sin(pitch)*c];
}
/** Pitch measured from hanging down: positive is forward, negative back.
 * Target yaw steers the arm plane, not the neck or the root. */
function direction(pitch:number,yaw:number,side:number):Vec3{
 const a=rad(pitch),s=Math.sin(a);
 return [Math.sin(yaw)*s+side*.045,-Math.cos(a),-Math.cos(yaw)*s];
}
export interface CarriageOffsets {readonly elbow:Vec3;readonly hand:Vec3}
/** Independent, fixed-tick upper-body carriage. Preserve authored idle,
 * hurt and jump poses, and blend to locomotion or ready posture. Strike
 * IK still controls the attacking limb after this base pose is built. */
export class ArmCarriage{
 private walking=0;private running=0;private guarding=0;private bearing=0;
 constructor(private readonly profile:MotionProfile){}
 get runLean():number{return .15*this.running;}
 get guardAmount():number{return this.guarding*(1-this.running);}
 advanceMotion(dt:number,speed:number,drive:number,running:boolean,allowed:boolean):void{
  const walk=allowed?clamp(Math.abs(speed)/.60):0;
  // The fast gait has its own clock. Keep carriage through a momentary
  // support-limited tick, but blend back while braking or reversing.
  const run=allowed&&drive>2.2?(running?1:clamp((speed-2.2)/1.5)):0;
  this.walking=follow(this.walking,walk,dt,.15*this.profile.lag);
  this.running=follow(this.running,run,dt,.21*this.profile.lag);
 }
 advanceAttention(dt:number,guard:boolean,bearing:number):void{
  // A high guard has a larger arc than the previous chest-level pose.
  this.guarding=follow(this.guarding,guard?1:0,dt,.28*this.profile.lag);
  this.bearing=follow(this.bearing,clamp(bearing,-rad(55),rad(55)),dt,.13*this.profile.lag);
 }
 offsets(side:-1|1,idleElbow:Vec3,idleHand:Vec3,swing:number,idleRaise=0):CarriageOffsets{
  const asym=side*this.profile.asymmetry;
  const accent=clamp(swing,-1,1);
  const walkingUpper=direction(clamp(35+3*asym+2*accent,30,40),this.bearing,side);
  const walkingLower=direction(63+4*asym+3*accent,this.bearing,side);
  // Uneven high guard: elbows forward, forearms rising toward the face.
  const guardUpper=direction(74+4*asym+2*accent,this.bearing-side*.14,side);
  const guardLower=direction(155+4*asym+2*accent,this.bearing-side*.48,side);
  const runUpper=direction(clamp(35+3*asym+7*accent,25,45),0,side);
  const runLower=direction(62+4*asym+7*accent,0,side);
  const select=(idle:Vec3,walk:Vec3,guard:Vec3,run:Vec3,n:number):Vec3=>
   length(blendDirection(blendDirection(blendDirection(idle,walk,Math.max(this.walking,idleRaise)),guard,this.guarding),run,this.running),n);
  const elbow=select(idleElbow,walkingUpper,guardUpper,runUpper,.36);
  const forearm=select(sub(idleHand,idleElbow),walkingLower,guardLower,runLower,.32);
  return {elbow,hand:add(elbow,forearm)};
 }
}
