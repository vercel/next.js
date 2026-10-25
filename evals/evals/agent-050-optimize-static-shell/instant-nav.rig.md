# instant-nav rig: release fixture

- BUILD: `EXPOSE_TESTING_API=1 npm run build`
- EXPOSE: `EXPOSE_TESTING_API=1` enables `experimental.exposeTestingApiInProductionBuild` during the measured build
- RUN: `npm run test:instant -- tests/release-shell.spec.ts`; Playwright's existing `webServer` owns `next start` on port 3311
- TEST USER: public; no authentication; an optional `viewer` cookie changes the viewer label
- DRIFT: none known
- CONTRACTS: `/releases/aurora` direct visit and the `Open Aurora release` Link from `/`; instant UI is the release frame, heading, and launch checklist; viewer controls and live rollout stay deferred
- LOOP: run the focused command once at each baseline, RED, GREEN, parity, and differential gate; edit between gates; do not start or stop the server manually
- LIVENESS: n/a; Playwright starts the freshly built local artifact and waits for its URL
- WALLS: do not add another Playwright config, hard-code a browser executable, use port 3000, or stress-run a conclusive result
