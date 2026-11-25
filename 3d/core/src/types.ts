import type { HealthSnapshot,IncapacitationCause } from './combat/damage.js';
import type { BalancePhase } from './rig/knockdown.js';
import type { ResidualTraction } from './rig/residual-traction.js';
import type { CrawlAnchor } from './rig/crawl-anchors.js';
import type { SupportState } from './rig/support.js';
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

export interface DamageRequest {readonly fighterId:FighterId;readonly segmentId:SegmentId;readonly amount:number;readonly attackerId?:FighterId}

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
  /** Lab stress-test only, not product combat balance. */
  readonly labContactFracture?: boolean;
  /** Lab-only collision-induced temporary knockdown. */
  readonly labDynamicBalance?: boolean;
}

/** Snapshot ownership belongs to the caller: buffers may be safely retained. */
export interface WorldSnapshot {
  /** Optional lab locomotion modes, in fighterIds order. */
  readonly mobilityModes?: readonly ('biped'|'single-support'|'arm-crawl'|'head-crawl'|'torso-crawl'|'unsupported')[];
  readonly residualTraction?: readonly (ResidualTraction|null)[];
  readonly crawlAnchors?: readonly (readonly CrawlAnchor[])[];
  readonly supports?: readonly SupportState[];
  /** True when a settled body is represented only by walkable terrain. */
  readonly bodyTerrainStates?: readonly boolean[];
  readonly health?: readonly HealthSnapshot[];
  readonly lifeStates?: readonly ('active'|'incapacitated')[];
  readonly balanceStates?: readonly BalancePhase[];
  readonly stepCounts?: readonly number[];
  readonly footStates?: readonly (readonly {readonly moving:boolean;readonly target:Vec3;readonly point:Vec3}[])[];
  readonly hopHeights?: readonly number[];
  readonly hopPhases?: readonly ('idle'|'flight'|'pause')[];
  readonly postures?: readonly ('upright'|'falling'|'prone')[];
  readonly damageStats?: Readonly<{hits:number; detached:number}>;
  readonly collisionStats?: Readonly<{tests:number; contacts:number; wallContacts:number}>;
  /** Optional procedural rig snapshot; world-space capsule endpoints, metres. */
  readonly rigVersion?: 1 | 2;
  readonly rigSegments?: readonly (readonly {readonly id: SegmentId; readonly a: Vec3; readonly b: Vec3; readonly radius: number}[])[];
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly fighterIds: Uint32Array;
  /** xyz + yaw per fighter in same index order as fighterIds. */
  readonly roots: Float32Array;
  /** Stable string IDs for segment anatomy; not a GPU mesh layout. */
  readonly segmentIds: readonly (readonly SegmentId[])[];
}

export interface PhysicsSegmentPose {readonly id:SegmentId;readonly a:Vec3;readonly b:Vec3;readonly radius:number}

export interface SimulationEvent {
  readonly tick: number;
  readonly type: string;
  readonly fighterId: FighterId;
  readonly segmentId?: SegmentId;
  readonly attackerId?: FighterId;
  readonly damage?: number;
  readonly remainingHP?: number;
  readonly critical?: boolean;
  readonly cause?: IncapacitationCause;
  readonly bodyPose?: readonly PhysicsSegmentPose[];
  /** One severed connected branch, root first; geometry captured before removal. */
  readonly detachedParts?: readonly PhysicsSegmentPose[];
  readonly detachedPose?: {readonly id:SegmentId;readonly a:Vec3;readonly b:Vec3;readonly radius:number};
}

/** No DOM, Three.js, Rapier, or Rust-specific types cross this boundary. */
export interface SimulationCore {
  initialize(config: WorldConfig): void;
  step(dtSeconds: number, input: InputFrame): void;
  getSnapshot(): WorldSnapshot;
  drainEvents(): readonly SimulationEvent[];
  dispose(): void;
}
