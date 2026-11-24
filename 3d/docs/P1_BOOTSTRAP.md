# P1.0 — bootstrap

The original lab remains the executable reference. First increment: fixed clock and capsule narrow phase. Second increment: LabSimulationCore, root locomotion only, with eight-patient configuration and seeded wandering.

Public yaw is positive right from -Z; the original lab uses the opposite sign (Three.js rotation.y). Convert at the renderer boundary. Commands override autonomous movement for their fighter; absent commands stop player 0 and let other fighters wander. Root speed, damping, turn limits and arena clamp follow Lab 04.1. Seeded random sequence intentionally differs from Math.random. Flat ground only; no IK, collision resolution, damage or Rapier integration yet.

Run from 3d/core: npm install, npm test. From repository root, build core before running root tests (Node test discovery may include nested core tests).

Next: browser input adapter and isolated root preview, then rig snapshot and parity tests. Keep reference core and original lab unchanged. No browser or performance equivalence claim.
