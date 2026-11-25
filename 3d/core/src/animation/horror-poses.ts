import type {Vec3} from '../types.js';
/** Original patient silhouettes, not motion capture or borrowed game assets.
 * Local joint rotations in radians. Feet remain under the locomotion IK. */
export const HORROR_POSES = {
 "stance": {
  "pelvis": [
   0,
   -0.1,
   0.04
  ],
  "abdomen": [
   -0.17,
   0.06,
   -0.055
  ],
  "chest": [
   -0.08,
   -0.04,
   0.07
  ],
  "neck": [
   0.08,
   0.03,
   -0.12
  ],
  "L.upperLeg": [
   -0.08,
   0.05,
   -0.045
  ],
  "L.lowerLeg": [
   0.2,
   0,
   0
  ],
  "R.upperLeg": [
   -0.16,
   -0.04,
   0.04
  ],
  "R.lowerLeg": [
   0.27,
   0,
   0
  ],
  "L.upperArm": [
   0.11,
   0.04,
   -0.11
  ],
  "L.lowerArm": [
   0.19,
   -0.09,
   0.1
  ],
  "R.upperArm": [
   -0.08,
   -0.07,
   0.15
  ],
  "R.lowerArm": [
   0.39,
   0.12,
   -0.08
  ]
 },
 "aggressive": {
  "pelvis": [
   0,
   -0.15,
   0.05
  ],
  "abdomen": [
   -0.24,
   0.12,
   -0.03
  ],
  "chest": [
   -0.12,
   0.12,
   0.1
  ],
  "neck": [
   0.16,
   -0.12,
   -0.05
  ],
  "L.upperLeg": [
   -0.23,
   0.03,
   -0.1
  ],
  "L.lowerLeg": [
   0.38,
   0,
   0
  ],
  "R.upperLeg": [
   -0.34,
   -0.05,
   0.1
  ],
  "R.lowerLeg": [
   0.49,
   0,
   0
  ],
  "L.upperArm": [
   0.34,
   0.1,
   -0.23
  ],
  "L.lowerArm": [
   0.52,
   -0.25,
   0.09
  ],
  "R.upperArm": [
   0.05,
   -0.12,
   0.19
  ],
  "R.lowerArm": [
   0.25,
   0.15,
   -0.13
  ]
 },
 "stalk": {
  "pelvis": [
   0,
   0.09,
   -0.035
  ],
  "abdomen": [
   -0.28,
   -0.06,
   0.04
  ],
  "chest": [
   -0.1,
   0.03,
   -0.08
  ],
  "neck": [
   0.18,
   0.07,
   0.09
  ],
  "L.upperLeg": [
   -0.22,
   0.04,
   -0.05
  ],
  "L.lowerLeg": [
   0.38,
   0,
   0
  ],
  "R.upperLeg": [
   -0.31,
   -0.06,
   0.06
  ],
  "R.lowerLeg": [
   0.46,
   0,
   0
  ],
  "L.upperArm": [
   -0.1,
   0.08,
   -0.14
  ],
  "L.lowerArm": [
   0.23,
   -0.1,
   0.09
  ],
  "R.upperArm": [
   0.22,
   -0.04,
   0.12
  ],
  "R.lowerArm": [
   0.48,
   0.1,
   -0.09
  ]
 },
 "freeze": {
  "pelvis": [
   0,
   0.06,
   -0.055
  ],
  "abdomen": [
   -0.13,
   -0.08,
   0.065
  ],
  "chest": [
   -0.1,
   0.06,
   -0.11
  ],
  "neck": [
   -0.07,
   0.12,
   0.18
  ],
  "L.upperLeg": [
   -0.12,
   0.02,
   -0.03
  ],
  "L.lowerLeg": [
   0.24,
   0,
   0
  ],
  "R.upperLeg": [
   -0.18,
   -0.04,
   0.03
  ],
  "R.lowerLeg": [
   0.29,
   0,
   0
  ],
  "L.upperArm": [
   0.07,
   0.04,
   -0.08
  ],
  "L.lowerArm": [
   0.12,
   -0.05,
   0.12
  ],
  "R.upperArm": [
   -0.13,
   -0.06,
   0.13
  ],
  "R.lowerArm": [
   0.31,
   0.09,
   -0.12
  ]
 }
} as const satisfies Record<string,Record<string,Vec3>>;
export type HorrorPose = keyof typeof HORROR_POSES;
