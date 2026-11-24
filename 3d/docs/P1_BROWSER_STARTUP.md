# Lab Next browser startup

Reported symptom: HUD stays at the generic Three.js loading line. Previous CI only tested Node core, so a green deployment did not prove browser startup. Exact user-side cause not confirmed. Lab Next now stages pinned Three.js and Rapier modules on Pages rather than fetching from external CDNs, shows initialization stages, catches frame errors and reports stalled startup after 20 seconds. The Pages workflow stages the exact site and runs a headless Chromium smoke test with external network blocked, checking first WebGL frame, advancing ticks, pause and reset. The old Lab 04.1 is unchanged and still uses its original CDN imports.

Local preview: npm install --prefix 3d/core; npm --prefix 3d/core test; npm --prefix 3d/core run preview:stage; serve _site using an HTTP server. The source rig.html needs staged vendor assets. Browser tests require Chromium installed using Playwright. No claim of actual browser success until CI completes.
