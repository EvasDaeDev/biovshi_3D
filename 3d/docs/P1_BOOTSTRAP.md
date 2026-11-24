# P1.0 — bootstrap (first increment)

The original lab remains the executable reference. This increment extracts the fixed-clock policy and capsule narrow phase into engine-independent TypeScript, preserving the original equations and timing caps. An epsilon compensates for floating-point accumulation at exact tick boundaries. No integration into the live lab yet; no performance equivalence claim.

Run from 3d/core: npm install, npm test. From repository root, build core before running root tests (Node test discovery may include nested core tests).

Next: command adapter, seeded movement core with explicit yaw convention, snapshot parity, then browser integration. Keep the existing reference core unchanged.
