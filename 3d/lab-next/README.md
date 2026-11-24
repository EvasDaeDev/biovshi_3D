# Root diagnostics (P1.0)

Temporary dependency-free Canvas map for testing the TypeScript core in a browser. This is not a replacement for the Three.js lab and does not display skeletons or run collisions.

From repository root:
```sh
npm --prefix 3d/core install
npm --prefix 3d/core test
python3 -m http.server 8000
```
Open http://localhost:8000/3d/lab-next/. W/S moves, A/D turns, Shift sprints. Pause freezes ticks; reset restores the seeded starting state. The old lab remains at /3d/lab/.

Verification: 13 core tests passed locally with Node 22.16 and TypeScript 5.8.3; JavaScript syntax check and HTTP response succeeded. Chromium navigation was blocked by environment policy and CDN DNS was unavailable. Browser behavior and performance parity are not yet verified.
