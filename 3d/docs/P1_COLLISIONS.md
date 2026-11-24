# P1.2 — kinematic contacts, first increment

Three horizontal correction passes, actor broad phase (4.7 m), capsule bounding sphere filter, sloping wall correction and bounded displacement. Gait advances once per tick; geometry is sampled again after corrections, without moving foot anchors. Unlike 04.1, near-vertical contacts are filtered before the zero-horizontal fallback. Root room clamp is retained from LabSimulationCore. No hit counting, damage, Rapier or debris yet.

Four regression tests cover separation, coincident roots, broad phase, wall correction and live diagnostics. Performance and visual equivalence are not yet verified. Pages workflow runs core tests before deployment.
