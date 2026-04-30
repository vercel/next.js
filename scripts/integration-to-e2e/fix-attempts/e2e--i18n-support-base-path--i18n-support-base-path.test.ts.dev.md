All tests pass (82 passed, 86 skipped — skipped are prod-only tests).

# e2e--i18n-support-base-path--i18n-support-base-path.test.ts.dev: FIXED

## Root cause

The converted test had two bugs: (1) it shadowed `ctx` with `curCtx = { ...ctx, isDev: ... }` at describe-block evaluation time, capturing undefined values for `appPort`/`appDir`/`buildId` that were only populated later in `beforeAll`; (2) `ctx.isDev` was assigned inside `beforeAll`, but shared.ts uses `if (!ctx.isDev)` at describe-evaluation time to gate prod-only tests, so prod-only tests were registered and then failed in dev mode (missing `.next/routes-manifest.json`, undefined `ctx.buildPagesDir`, etc.).

## Fix applied

- `test/e2e/i18n-support-base-path/i18n-support-base-path.test.ts`: removed the shadowed `curCtx` spread (now calls `runTests(ctx)` by reference, matching sibling `i18n-support.test.ts`); moved `ctx.isDev = isNextDev` from `beforeAll` to the initial ctx literal so describe-time guards in shared.ts see the correct value.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/e2e/i18n-support-base-path/i18n-support-base-path.test.ts` → Test Suites: 1 passed. Tests: 82 passed, 86 skipped (prod-only), 0 failed. Down from 63 failed → 0 failed.
