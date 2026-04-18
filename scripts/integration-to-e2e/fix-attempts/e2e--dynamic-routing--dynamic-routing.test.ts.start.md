The test already passes — the fix (`disableAutoSkewProtection: true`) is present in the test file as an unstaged change. Full run: 73/73 pass.

# e2e--dynamic-routing--dynamic-routing.test.ts.start: FIXED

## Root cause

With `IS_TURBOPACK_TEST=1`, `NextStartInstance` auto-injects `NEXT_DEPLOYMENT_ID=test-dpl-id-1234` and `__NEXT_SUPPORTS_IMMUTABLE_ASSETS=1` env vars to exercise skew protection (see `test/lib/next-modes/next-start.ts:21-24`). That adds `deploymentId` and `onMatchHeaders` entries to `routes-manifest.json`, which the inline snapshot (carried over from the original integration test that never had this auto-injection) did not account for. Passing `disableAutoSkewProtection: true` to `nextTestSetup` suppresses the injection and restores the original manifest shape.

## Fix applied

- `test/e2e/dynamic-routing/dynamic-routing.test.ts`: added `disableAutoSkewProtection: true` to the `nextTestSetup` options (already present as an unstaged modification when I inspected the repo).

## Verification

Ran `NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/e2e/dynamic-routing/dynamic-routing.test.ts` — result: `Tests: 73 passed, 73 total`, `Snapshots: 2 passed, 2 total`. The previously failing `should output a routes-manifest correctly` test now passes along with the rest of the suite.
