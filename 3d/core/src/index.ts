export { ReferenceCore } from './reference-core.js';
export { LabSimulationCore } from './lab-core.js';
export { createLabConfig } from './lab-config.js';
export { FixedClock, FIXED_DT } from './fixed-clock.js';
export type {
  FighterId, SegmentId, Vec3, FighterCommand, InputFrame, FighterDefinition,
  WorldConfig, WorldSnapshot, SimulationEvent, SimulationCore, DamageRequest, PhysicsSegmentPose
} from './types.js';

export { DAMAGE, DamageState } from './combat/damage.js';
export type { HealthSnapshot,SegmentHealth,IncapacitationCause,DamageResult } from './combat/damage.js';
