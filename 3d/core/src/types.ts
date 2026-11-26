import type {HeadFrame} from './rig/head-frame.js';
import type {PoseDocument} from './rig/pose-editor.js';
import type { ArenaWall } from './arena/navigation.js';
import type { NativeLocation } from './arena/location-adapter.js';
import type { GradeSurface } from './arena/graded-surface.js';
import type { PointXZ } from './combat/escape.js';
import type { PerceptionSnapshot } from './combat/perception.js';
import type { EscapePlan } from './combat/escape.js';
import type {RaidSnapshot} from './combat/raid-state.js';
import type {HuntSnapshot} from './combat/hunt-state.js';
import type { TacticalSnapshot } from './combat/tactics.js';
import type { PatientProfile,PatientTraits } from './combat/patient-profile.js';
import type { StrikeSnapshot,StrikeKind } from './combat/strike.js';
import type { OilMark,OilSnapshot } from './combat/oil.js';
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
  readonly jump?:boolean;
  readonly attack?: boolean;
  readonly attackKind?: StrikeKind;
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
  /** Optional native effective points and behavioral temperament. */
  readonly profile?: PatientProfile;
}

export interface WorldConfig {
  readonly patientScale?:number;
  readonly patientPoses?:PoseDocument;
  readonly fighters: readonly FighterDefinition[];
  readonly seed: number;
  /** Lab stress-test only, not product combat balance. */
  readonly labContactFracture?: boolean;
  /** Lab-only collision-induced temporary knockdown. */
  readonly labDynamicBalance?: boolean;
  /** Opt-in product strike path; omitted commands use simple combat AI. */
  readonly combatEnabled?: boolean;
  /** Opt-in extended source selection, retaining the arm-only regression mode. */
  readonly expandedStrikes?: boolean;
  /** Opt-in persistent targets and reactive behavior in group combat. */
  readonly tacticalCombat?: boolean;
  readonly escapeCombat?: boolean;
  readonly perceptionCombat?: boolean;
  /** Opaque tall walls; low terrain cones use the separate height field. */
  readonly walls?: readonly ArenaWall[];
  /** Original convex geometry and perimeter for native P4 navigation. */
  readonly location?: NativeLocation;
  /** Optional native walkable inclines above the flat base floor. */
  readonly gradedSurface?: GradeSurface;
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
  readonly oil?: readonly OilSnapshot[];
  readonly oilMarks?: readonly OilMark[];
  readonly impacts?: readonly {readonly active:boolean;readonly remainingSeconds:number;readonly slow:number}[];
  readonly routes?: readonly (readonly PointXZ[])[];
  readonly perception?: readonly PerceptionSnapshot[];
  readonly escapes?: readonly {readonly stationaryTicks:number;readonly plan:EscapePlan|null}[];
  readonly tactics?: readonly TacticalSnapshot[];
  readonly hunts?: readonly HuntSnapshot[];
  readonly raids?: readonly RaidSnapshot[];
  readonly patientTraits?: readonly (PatientTraits & {readonly targetId:number|null;readonly noticedAt:number;readonly nextAttack:number})[];
  readonly strikes?: readonly StrikeSnapshot[];
  readonly fight?: Readonly<{ended:boolean;winnerId:number|null}>;
  readonly health?: readonly HealthSnapshot[];
  readonly distress?: readonly import('./combat/distress.js').DistressSnapshot[];
  readonly lifeStates?: readonly ('active'|'incapacitated')[];
  readonly balanceStates?: readonly BalancePhase[];
  readonly stepCounts?: readonly number[];
  readonly footStates?: readonly (readonly {readonly moving:boolean;readonly target:Vec3;readonly point:Vec3}[])[];
  readonly hopHeights?: readonly number[];
  readonly hopPhases?: readonly ('idle'|'prepare'|'flight'|'pause')[];
  readonly postures?: readonly ('upright'|'falling'|'prone')[];
  readonly damageStats?: Readonly<{hits:number; detached:number}>;
  readonly collisionStats?: Readonly<{tests:number; contacts:number; wallContacts:number}>;
  /** Optional procedural rig snapshot; world-space capsule endpoints, metres. */
  readonly rigVersion?: 1 | 2;
  /** World-space presentation frame; null for absent heads or inactive actors. */
  readonly headFrames?: readonly (HeadFrame|null)[];
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

/** Captured world-space motion at a terminal animation-to-physics handoff. */
export interface SegmentMotion {readonly id:SegmentId;readonly linear:Vec3;readonly angular:Vec3}

export interface SimulationEvent {
  readonly tick: number;
  readonly type: string;
  readonly fighterId: FighterId;
  readonly segmentId?: SegmentId;
  readonly attackerId?: FighterId;
  readonly targetId?: FighterId;
  readonly strikeKind?: StrikeKind;
  readonly proneStrike?: boolean;
  readonly crouchStrike?: boolean;
  readonly pounceStrike?: boolean;
  readonly sourceSegment?: SegmentId;
  readonly secondaryTargetId?: FighterId;
  readonly secondarySourceSegment?: SegmentId;
  readonly damage?: number;
  readonly remainingHP?: number;
  readonly critical?: boolean;
  readonly point?: Vec3;
  readonly cause?: IncapacitationCause;
  readonly fallDirection?: Vec3;
  readonly bodyPose?: readonly PhysicsSegmentPose[];
  readonly bodyMotion?: readonly SegmentMotion[];
  /** One severed connected branch, root first; geometry captured before removal. */
  readonly detachedParts?: readonly PhysicsSegmentPose[];
  readonly flightId?: number;
  readonly flightParts?: readonly PhysicsSegmentPose[];
  readonly flightVelocity?: Vec3;
  readonly accurate?: boolean;
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
