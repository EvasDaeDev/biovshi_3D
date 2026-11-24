import type {
  FighterCommand, FighterDefinition, InputFrame, SimulationCore,
  SimulationEvent, WorldConfig, WorldSnapshot
} from './types.js';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
};
interface ReferenceFighter {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  segments: readonly string[];
}

/**
 * Minimal, deterministic adapter to exercise the ABI and lifecycle.
 * This is NOT the lab's segment solver, IK, Rapier integration, or production combat.
 */
export class ReferenceCore implements SimulationCore {
  private fighters: ReferenceFighter[] = [];
  private tick = 0;
  private elapsedSeconds = 0;
  private initialized = false;
  private events: SimulationEvent[] = [];

  initialize(config: WorldConfig): void {
    finite(config.seed, 'seed');
    const ids = new Set<number>();
    this.fighters = config.fighters.map((fighter: FighterDefinition) => {
      if (!Number.isInteger(fighter.id) || fighter.id < 0 || ids.has(fighter.id)) {
        throw new RangeError('Fighter IDs must be unique nonnegative integers');
      }
      ids.add(fighter.id);
      if (fighter.origin.length !== 3) throw new RangeError('Origin must have three coordinates');
      const [x, y, z] = fighter.origin;
      const segments = [...fighter.segmentIds];
      if (new Set(segments).size !== segments.length || segments.some(s => !s)) {
        throw new RangeError('Segment IDs must be nonempty and unique per fighter');
      }
      return {
        id: fighter.id,
        x: finite(x, 'x'), y: finite(y, 'y'), z: finite(z, 'z'),
        yaw: finite(fighter.yawRad, 'yawRad'), segments
      };
    });
    this.fighters.sort((a, b) => a.id - b.id);
    this.tick = 0;
    this.elapsedSeconds = 0;
    this.events = [];
    this.initialized = true;
  }

  step(dtSeconds: number, input: InputFrame): void {
    this.requireReady();
    // Clock is owned by the caller. Reject variable or unbounded steps.
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || dtSeconds > 1 / 30) {
      throw new RangeError('step requires a fixed positive dt <= 1/30 s');
    }
    const commands = new Map<number, FighterCommand>();
    for (const command of input.commands) {
      if (!this.fighters.some(f => f.id === command.fighterId) || commands.has(command.fighterId)) {
        throw new RangeError('Unknown or duplicate fighter command');
      }
      finite(command.forward, 'forward');
      finite(command.turn, 'turn');
      if (Math.abs(command.forward) > 1 || Math.abs(command.turn) > 1) {
        throw new RangeError('Input values must be normalized to [-1,1]');
      }
      commands.set(command.fighterId, command);
    }
    for (const fighter of this.fighters) {
      const command = commands.get(fighter.id);
      if (!command) continue;
      fighter.yaw += clamp(command.turn, -1, 1) * 2.1 * dtSeconds;
      const speed = (command.sprint ? 2.2 : 1.2) * command.forward * dtSeconds;
      fighter.x += Math.sin(fighter.yaw) * speed;
      fighter.z -= Math.cos(fighter.yaw) * speed;
    }
    this.elapsedSeconds += dtSeconds;
    this.tick++;
  }

  getSnapshot(): WorldSnapshot {
    this.requireReady();
    const fighterIds = new Uint32Array(this.fighters.length);
    const roots = new Float32Array(this.fighters.length * 4);
    this.fighters.forEach((fighter, index) => {
      fighterIds[index] = fighter.id;
      roots.set([fighter.x, fighter.y, fighter.z, fighter.yaw], index * 4);
    });
    return {
      tick: this.tick,
      elapsedSeconds: this.elapsedSeconds,
      fighterIds,
      roots,
      segmentIds: this.fighters.map(f => Object.freeze([...f.segments]))
    };
  }

  drainEvents(): readonly SimulationEvent[] {
    this.requireReady();
    const drained = this.events;
    this.events = [];
    return drained;
  }

  dispose(): void {
    this.fighters = [];
    this.events = [];
    this.initialized = false;
  }

  private requireReady(): void {
    if (!this.initialized) throw new Error('Simulation core is not initialized');
  }
}
