All 9 dev tests pass; 6 build-validation tests correctly skipped in dev.

# e2e--404-page--404-page.test.ts.dev: FIXED

## Root cause

Two conversion issues: (1) The "404 Page build validation" describe was run in every mode, but its tests require `next.build()` + `next.start()` which can't run alongside the persistent dev server managed by `nextTestSetup`. These tests are production-only in the original (`TURBOPACK_DEV ? describe.skip`). (2) The "does not show error with getStaticProps in pages/404 dev" test asserted on the full `next.cliOutput`, which contained the `gip404Err` message left by the preceding `getInitialProps` test — in the original, each test got a fresh app so stderr was isolated.

## Fix applied

- `test/e2e/404-page/404-page.test.ts`:
  - Gated the entire `404 Page build validation` describe with `isNextStart ? describe : describe.skip` (matches original production-mode gating).
  - Replaced the nested `nextTestSetup` hack in the getStaticProps dev test with `next.getCliOutputFromHere()` to scope the `not.toMatch(gip404Err)` assertion to output produced after the patch, eliminating cross-test contamination.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/e2e/404-page/404-page.test.ts` → `Tests: 6 skipped, 9 passed, 15 total`. All previously failing dev-mode tests now pass; the five build-validation tests are correctly skipped outside start mode.
