All 49 previously failing tests now pass.

# e2e--api-support--api-support.test.ts.start: FIXED

## Root cause

The e2e fixture uses `node-fetch` in `pages/api/test-res-pipe.js`, but `node-fetch` was not declared in the converted test's `nextTestSetup` `dependencies`. In the original integration test, `node-fetch` resolved via the monorepo's root `package.json`, but `nextTestSetup` isolates dependencies per test. Since Turbopack's production build traces all pages at `next build` time, the missing module caused `next build` to fail with `Module not found: Can't resolve 'node-fetch'`, breaking every test (all ran in start mode and needed a successful build).

## Fix applied

- `test/e2e/api-support/api-support.test.ts`: added `'node-fetch': '2.6.7'` (matching the root repo's version) to the `dependencies` of both `nextTestSetup` calls (the main `API routes` suite and the `skipStart` `API routes output export error` suite).

## Verification

Ran `NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/e2e/api-support/api-support.test.ts`. Result: 49 passed, 1 skipped (the pre-existing `it.skip` test), 0 failed, in 13.1s.
