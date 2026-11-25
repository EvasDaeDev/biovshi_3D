# P1 — mass-driven single-leg balance correction

User observed that after losing a leg the remaining foot moved inward and the upper body barely reacted. The support calculation already weighted the surviving capsule volumes; the defect was the pose response: a fixed 12 cm pelvis shift with progressively smaller chest/head offsets and a generic translation capped at 5.5 cm.

The new single-support solver retains the actual world foot anchor, rotates the connected pelvis/trunk/head/arms toward that support, recalculates the center of mass from all surviving capsule volumes (missing segments carry no mass), and solves the legs with fixed bone lengths. Four bounded angular corrections, up to .52 rad, precede a small residual pelvis translation; unreachable vertical targets lower the body. The same balanced pose is used before applying the one-leg hop lift. Biped gait and prone movement are unchanged. Uniform density remains provisional: no actual patient-specific material masses or dynamic angular momentum yet. The existing support debug marker uses the same mass formula.

New tests cover mass exclusion, mirrored stance/yaw, ground anchor, nominal lengths, a real damage transition and asymmetric arm mass; benchmark adds eight single-support patients. Oil/impact behavior unchanged. CI and visual validation pending.
