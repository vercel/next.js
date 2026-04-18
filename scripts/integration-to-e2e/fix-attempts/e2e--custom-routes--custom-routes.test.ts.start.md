All 107 tests pass.

# e2e--custom-routes--custom-routes.test.ts.start: FIXED

## Root cause

Three conversion bugs conspired: (1) the `beforeAll` ran `next.build()` to capture CLI output, then `next.start()` which ran a **second** build — overwriting `.next/BUILD_ID` with a different value than the one captured in the `buildId` variable, so the routes-manifest snapshot's `BUILD_ID` replacement didn't match and the data-route fetch used a stale id. (2) The `pages/overridden/[slug].js` fixture was altered to say "this page is overridden" and (3) the afterFiles rewrite `/overridden/:path*` → `/overridden` was removed from `next.config.js`, which broke the actual semantics of the "should not rewrite for \_next/data route when a match is found" and "should match /\_next file after rewrite" tests.

## Fix applied

- `test/e2e/custom-routes/custom-routes.test.ts`: pass `{ skipBuild: true }` to `next.start()` after the explicit build so BUILD_ID stays consistent.
- `test/e2e/custom-routes/next.config.js`: restored missing afterFiles rewrite `/overridden/:path*` → `/overridden`.
- `test/e2e/custom-routes/pages/overridden/[slug].js`: reverted page text to `/overriden/[slug]` matching the original fixture.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/e2e/custom-routes/custom-routes.test.ts` → 107 passed, 1 snapshot passed, 0 failed (44s).
