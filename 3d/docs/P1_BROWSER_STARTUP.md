# Lab Next browser startup

Reported symptom: HUD stays at the generic Three.js loading line. Previous CI only tested Node core, so a green deployment did not prove browser startup. Exact user-side cause not confirmed. Lab Next now stages pinned Three.js and Rapier modules on Pages rather than fetching from external CDNs, shows initialization stages, catches frame errors and reports stalled startup after 20 seconds. The Pages workflow stages the exact site and runs a headless Chromium smoke test with external network blocked, checking first WebGL frame, advancing ticks, pause and reset. The old Lab 04.1 is unchanged and still uses its original CDN imports.

Local preview: npm install --prefix 3d/core; npm --prefix 3d/core test; npm --prefix 3d/core run preview:stage; serve _site using an HTTP server. The source rig.html needs staged vendor assets. Browser tests require Chromium installed using Playwright. No claim of actual browser success until CI completes.

## Release consistency and scenario regressions

User reported `Cannot read properties of undefined (reading '0')` with the one-arm scenario selected. Previous CI was green; exact browser stack unavailable, mixed cached module versions are a plausible but unconfirmed cause. Stage the complete Lab Next import graph under a content-addressed release path, while retaining stable HTML entry points. The rig validates required snapshot fields and displays a build ID and error stack. Reset restarts the animation loop after a caught frame error. Chromium smoke exercises all scenario switches and direct startup with one arm, and checks that script requests use the same release prefix. Browser and actual user-device confirmation remain pending.
