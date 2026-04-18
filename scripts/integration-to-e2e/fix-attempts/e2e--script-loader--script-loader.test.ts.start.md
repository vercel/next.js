All 12 tests pass.

# e2e--script-loader--script-loader.test.ts.start: FIXED

## Root cause

The converted test replaced the original `nextBuild()` call with `createNext({ skipStart: true })` in the "Partytown not installed locally" test. This created a second Next.js instance while `nextTestSetup()`'s main instance was still active, triggering the `createNext called without destroying previous instance` guard in `test/lib/e2e-utils/index.ts`. When that guard destroyed the existing instance, the remaining tests (`onReady …`) lost access to `next` and failed with "Next.js is no longer available".

## Fix applied

- `test/e2e/script-loader/script-loader.test.ts`: Replaced the `createNext({ files: '…/partytown-missing', skipStart: true })` / `partytownNext.build()` flow with `nextBuild(join(__dirname, 'partytown-missing'), [], { stdout: true, stderr: true })`, matching the original integration test's approach. Swapped the `createNext` import for `nextBuild` from `next-test-utils`.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/e2e/script-loader/script-loader.test.ts` → `Tests: 12 passed, 12 total`. The three previously failing tests all pass now.
