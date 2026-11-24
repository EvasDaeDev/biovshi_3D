# P1 — detached body physics, first increment

Lab Next now consumes detachment events at every fixed tick. Rapier 0.17.3 owns detached bodies only, with explicit mass, damping, modest deterministic launch velocity, floor and perimeter colliders, and debris-debris filtering. The adapter owns its world and resets it on simulation reset. Rendering consumes plain body snapshots. This is a browser-side adapter, not yet a SimulationCore-owned physics subsystem; static mound baking and patient/obstacle interaction are next. Perimeter collision walls are vertical in this increment. No visual parity or performance claim.

CI installs the pinned Rapier package and runs a real falling-body/reset test before Pages deployment.
