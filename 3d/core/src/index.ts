export { ReferenceCore } from './reference-core.js';
export { LabSimulationCore } from './lab-core.js';
export { createLabConfig,createArenaCombatConfig } from './lab-config.js';
export { FixedClock, FIXED_DT } from './fixed-clock.js';
export type {
  FighterId, SegmentId, Vec3, FighterCommand, InputFrame, FighterDefinition,
  WorldConfig, WorldSnapshot, SimulationEvent, SimulationCore, DamageRequest, PhysicsSegmentPose
} from './types.js';

export { DAMAGE, DamageState } from './combat/damage.js';
export type { HealthSnapshot,SegmentHealth,IncapacitationCause,DamageResult } from './combat/damage.js';

export { OIL,OilState,hasWorkingLimb } from './combat/oil.js';
export { IMPACT,ImpactState } from './combat/impact.js';
export type { OilSnapshot,OilMark } from './combat/oil.js';

export {STRIKE,StrikeState,punchPose,usableStrike,strikeSource} from './combat/strike.js';
export {sweptContact,firstStrikeContact} from './combat/swept-contact.js';
export type {Punch,StrikePhase,StrikeSnapshot,StrikeKind} from './combat/strike.js';

export {PatientBehavior,patientTraits,statMultiplier,critChance} from './combat/patient-profile.js';
export type {PatientProfile,PatientTraits} from './combat/patient-profile.js';

export {CombatTactics} from './combat/tactics.js';
export type {TacticalSnapshot,Opponent} from './combat/tactics.js';

export {EscapeState,ESCAPE,tacticalEscape,pincerThreats,pincerGoal} from './combat/escape.js';

export {PatientPerception,VISION,notices} from './combat/perception.js';
export type {VisionBody,VisionMemory,PerceptionSnapshot,SightClear} from './combat/perception.js';
