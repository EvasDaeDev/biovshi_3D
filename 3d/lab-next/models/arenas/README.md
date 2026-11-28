# Arena visual assets

Place the authored ring model here as `eccepry_ring_9m.glb`. The stage script generates the catalog automatically. No source changes are necessary to replace this file.

Contract: glTF 2.0, metres, Y-up, floor top Y=0, centered X/Z, diameter 9 m; named meshes `arena_floor` and `arena_wall`. Preserve the authored wall height (5.314 m); physics stays at 3.1 m. Static meshes with positive transforms, one material per primitive; embedded textures. Do not export functional cameras/lights or physics. Decorative elements have no colliders. Without the file the native visual is used.


Surveillance camera fixtures should use `camera_XX_*` names (housing, hood, lens, bracket etc.). The loader derives each game camera's radial limit from their actual world-space vertices in the corresponding quadrant, with an additional 0.18 m clearance; game camera height remains 3 m. Do not rely on Blender numbering for in-game corner ordering.
