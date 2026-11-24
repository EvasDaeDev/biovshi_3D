/** World units: metres; orientation: radians; Y is vertical. */
export type FighterId = number;
export type SegmentId = string;
export type Vec3 = readonly [number, number, number];

/** An input is a command, not a pose or a Three.js object. */
export interface FighterCommand {
  readonly fighterId: FighterId;
  /** Forward/back in the fighter's local forward direction, [-1, 1]. */
  readonly forward: number;
  /** Turn speed request, [-1, 1], positive = right. */
  readonly turn: number;
  readonly sprint: boolean;
}

export interface InputFrame {
  readonly commands: readonly FighterCommand[];
}

export interface FighterDefinition {
  readonly id: FighterId;
  readonly origin: Vec3;
  readonly yawRad: number;
  readonly segmentIds: readonly SegmentId[];
}

export interface WorldConfig {
  readonly fighters: readonly FighterDefinition[];
  readonly seed: number;
}

/** Snapshot ownership belongs to the caller: buffers may be safely retained. */
export interface WorldSnapshot {
  /** Optional procedural rig snapshot; world-space capsule endpoints, metres. */
  readonly rigVersion?: 1;
  readonly rigSegments?: readonly (readonly {readonly id: SegmentId; readonly a: Vec3; readonly b: Vec3; readonly radius: number}[])[];
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly fighterIds: Uint32Array;
  /** xyz + yaw per fighter in same index order as fighterIds. */
  readonly roots: Float32Array;
  /** Stable string IDs for segment anatomy; not a GPU mesh layout. */
  readonly segmentIds: readonly (readonly SegmentId[])[];
}

export interface SimulationEvent {
  readonly tick: number;
  readonly type: string;
  readonly fighterId: FighterId;
  readonly segmentId?: SegmentId;
}

/** No DOM, Three.js, Rapier, or Rust-specific types cross this boundary. */
export interface SimulationCore {
  initialize(config: WorldConfig): void;
  step(dtSeconds: number, input: InputFrame): void;
  getSnapshot(): WorldSnapshot;
  drainEvents(): readonly SimulationEvent[];
  dispose(): void;
}
