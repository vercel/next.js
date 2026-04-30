All 5 tests pass.

# production--production-config--production-config.test.ts.start: FIXED

## Root cause

The converted test's `generateBuildId` suite pointed `nextTestSetup` at a fixture directory with a `next.config.js` that returns `custom-buildid`. However, in turbopack mode `NextStartInstance` automatically enables skew protection by setting `NEXT_DEPLOYMENT_ID=test-dpl-id-1234`, which caused Next.js to generate a hashed `build-…` buildId instead of using `custom-buildid`. The original integration test explicitly opted out via `disableAutoSkewProtection: true`, but the conversion dropped that option.

## Fix applied

- `test/production/production-config/production-config.test.ts`: added `disableAutoSkewProtection: true` to the `nextTestSetup` call in the `with generateBuildId` describe, matching the original integration test's semantics.

## Verification

Ran `NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/production/production-config/production-config.test.ts` — all 5 tests pass (previously 1 failed, 4 passed).
