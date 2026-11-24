# P1 — detached body physics, first increment

Lab Next now consumes detachment events at every fixed tick. Rapier 0.17.3 owns detached bodies only, with explicit mass, damping, modest deterministic launch velocity, floor and perimeter colliders, and debris-debris filtering. The adapter owns its world and resets it on simulation reset. Rendering consumes plain body snapshots. This is a browser-side adapter, not yet a SimulationCore-owned physics subsystem; static mound baking and patient/obstacle interaction are next. Perimeter collision walls are vertical in this increment. No visual parity or performance claim.

CI installs the pinned Rapier package and runs a real falling-body/reset test before Pages deployment.

## Static mounds

At rest for 60 ticks, or after 720 ticks with estimated ground contact, a detached body is removed and replaced by one fixed Rapier cone. Sleeping bodies are also considered for rest detection to handle debris settling on other static geometry. Cone dimensions follow Lab 04.1 (height 0.08–0.30 m, radius 0.30–0.77 m). The renderer removes the old mesh and displays the cone. A pure TypeScript height function is ready for gait integration, but patient locomotion does not yet sample it. Integration tests exercise falling, baking, snapshot isolation and reset. Browser visual acceptance and performance remain pending.

## Settled-height correction

Mound height now equals the actual upper extent of the Rapier shape above the arena floor at the conversion tick: centerY + radius + length/2 * abs(worldAxisY), limited to 0.30 m. Sphere length is zero. The 0.001 m numerical minimum is solely for a valid cone. Horizontal capsules of different lengths but equal radius produce equal heights on flat ground; different radii and tilted poses produce different heights. Existing radius rules are unchanged. When a body settles on another mound, its top is measured relative to the arena floor, still capped at 0.30 m. Rapier, Three.js and gait terrain use the same mound snapshot. The original 04.1 reference is unchanged.
