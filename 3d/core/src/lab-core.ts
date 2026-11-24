import { FIXED_DT } from './fixed-clock.js';
import type { FighterCommand, InputFrame, SimulationCore, SimulationEvent, WorldConfig, WorldSnapshot } from './types.js';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
const damp = (a: number, b: number, k: number) => a + (b - a) * (1 - Math.exp(-k * FIXED_DT));

interface Actor {
  id: number; x: number; y: number; z: number; yaw: number;
  speed: number; wanderTimer: number; wanderAngle: number; wanderSpeed: number;
  segments: string[];
}

/** Root locomotion only. No rig, collisions or debris yet.
 * Public yaw is positive right (towards +X from -Z).
 * Lab Three.js heading is the negative of this yaw.
 */
export class LabSimulationCore implements SimulationCore {
  private actors: Actor[] = [];
  private tick = 0;
  private rng = 0;
  private ready = false;

  initialize(config: WorldConfig): void {
    if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff)
      throw new RangeError('seed must be uint32');
    const ids = new Set<number>();
    const actors = config.fighters.map(f => {
      if (!Number.isInteger(f.id) || f.id < 0 || f.id > 0xffffffff || ids.has(f.id))
        throw new RangeError('Invalid or duplicate fighter ID');
      ids.add(f.id);
      const [x,y,z] = f.origin;
      if (f.origin.length !== 3 || ![x,y,z,f.yawRad].every(Number.isFinite))
        throw new RangeError('Invalid transform');
      if (new Set(f.segmentIds).size !== f.segmentIds.length || f.segmentIds.some(s => !s))
        throw new RangeError('Invalid segment IDs');
      return {id:f.id,x,y,z,yaw:f.yawRad,speed:0,wanderTimer:1+f.id*.3,
        wanderAngle:f.yawRad,wanderSpeed:.35,segments:[...f.segmentIds]};
    }).sort((a,b)=>a.id-b.id);
    this.actors = actors;
    this.tick = 0;
    this.rng = config.seed;
    this.ready = true;
  }

  private random(): number {
    // Mulberry32; seed zero is valid.
    this.rng = (this.rng + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.rng ^ (this.rng >>> 15), 1 | this.rng);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  step(dt: number, input: InputFrame): void {
    this.requireReady();
    if (dt !== FIXED_DT) throw new RangeError('Lab requires exactly 1/60 s');
    const commands = new Map<number,FighterCommand>();
    for (const c of input.commands) {
      if (commands.has(c.fighterId) || !this.actors.some(a=>a.id===c.fighterId) ||
          !Number.isFinite(c.forward) || Math.abs(c.forward)>1 ||
          !Number.isFinite(c.turn) || Math.abs(c.turn)>1 || typeof c.sprint !== 'boolean')
        throw new RangeError('Invalid or duplicate command');
      commands.set(c.fighterId,c);
    }
    for (const a of this.actors) {
      const c = commands.get(a.id);
      let target = 0;
      if (c || a.id === 0) {
        a.yaw += (c?.turn ?? 0) * 2.15 * dt;
        target = (c?.forward ?? 0) * (c?.sprint ? 1.9 : .9);
      } else {
        a.wanderTimer -= dt;
        if (a.wanderTimer <= 0) {
          a.wanderTimer = 1.5 + this.random()*2.5;
          a.wanderAngle += 1 - this.random()*2;
          a.wanderSpeed = .24 + this.random()*.43;
        }
        if (Math.abs(a.x)>4.2 || Math.abs(a.z)>4.2)
          a.wanderAngle = -Math.atan2(a.x,a.z);
        a.yaw += clamp(wrap(a.wanderAngle-a.yaw),-1.1*dt,1.1*dt);
        target = a.wanderSpeed;
      }
      a.speed = damp(a.speed,target,3);
      a.x = clamp(a.x+Math.sin(a.yaw)*a.speed*dt,-5.65,5.65);
      a.z = clamp(a.z-Math.cos(a.yaw)*a.speed*dt,-5.65,5.65);
    }
    this.tick++;
  }

  getSnapshot(): WorldSnapshot {
    this.requireReady();
    const fighterIds = new Uint32Array(this.actors.length);
    const roots = new Float32Array(this.actors.length*4);
    this.actors.forEach((a,i)=>{
      fighterIds[i]=a.id;
      roots.set([a.x,a.y,a.z,a.yaw],i*4);
    });
    return {tick:this.tick,elapsedSeconds:this.tick*FIXED_DT,fighterIds,roots,
      segmentIds:this.actors.map(a=>Object.freeze([...a.segments]))};
  }
  drainEvents(): readonly SimulationEvent[] { this.requireReady(); return []; }
  dispose(): void { this.ready=false; this.actors=[]; this.tick=0; this.rng=0; }
  private requireReady(): void { if (!this.ready) throw new Error('Simulation core is not initialized'); }
}
