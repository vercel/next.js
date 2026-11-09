# instant-nav rig: release fixture

- BUILD: Run `EXPOSE_TESTING_API=1 npm run build`.
- EXPOSE: Enable `experimental.exposeTestingApiInProductionBuild` with `EXPOSE_TESTING_API=1` during the build and server startup. Playwright sets the variable through `webServer.env`.
- RUN: Run `npm run test:instant -- tests/release-shell.spec.ts`. Playwright's existing `webServer` starts the server on port 3311.
- TEST USER: Use the public route without authentication. An optional `viewer` cookie changes the viewer label.
- DRIFT: None known.
- CONTRACTS: Test a direct visit to `/releases/aurora` and navigation through the `Open Aurora release` Link from `/`. Expect the release frame, heading, and launch checklist to appear immediately. Keep viewer controls and live rollout deferred.
- LOOP: Run the focused command once at each baseline, RED, GREEN, parity, and differential gate. Edit between gates and let Playwright manage the server.
- LIVENESS: No commit probe is needed for a local build. Playwright starts the freshly built artifact and waits for its URL.
- WALLS: Use the existing Playwright config and port 3311. Let Playwright select the browser executable and avoid repeating a conclusive test run.
