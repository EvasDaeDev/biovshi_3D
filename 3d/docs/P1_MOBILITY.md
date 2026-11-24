# P1 — articulated girdles and lab mobility

The pelvis and shoulder girdle now have independent procedural roll and opposite axial twist during walking. Their lengths remain fixed and leg/arm roots use their actual endpoints. Abdomen and neck retain the existing connecting geometry. This is not a full biomechanical spine solver.

Mobility is derived from intact upperLeg/lowerLeg/foot chains. Two intact legs: existing locomotion. One intact leg: provisional low-speed single-support shuffle (30% normal walk speed, sprint disabled), only the available foot takes steps and the torso shifts toward it. No intact leg: self-propelled translation stops immediately, torso lowers modestly; collision corrections still apply. Arms do not affect these modes. These values are laboratory defaults, not approved combat balance. Falling, hopping dynamics, crawling and support via stumps are not implemented; single-support motion is a kinematic approximation.

Three regression tests cover modes, sprint gating, unsupported movement, girdle lengths and attachment. Visual acceptance and comparative profiling remain open. Original 04.1 untouched.
