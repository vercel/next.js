Both tests pass. The fix (adding `deleteFile('next.config.js')` before patching `.mjs`) was already applied and works correctly.

# production--config-syntax-error--config-syntax-error.test.ts.start: FIXED

## Root cause

The converted test used `next.patchFile()` to create both `next.config.js` and `next.config.mjs` across two tests, but without cleanup. Because Next.js prioritizes `.js` over `.mjs` when both exist, the second test's build still loaded the leftover `next.config.js` from the first test, producing "Failed to load next.config.js" instead of the expected ".mjs" error.

## Fix applied

`test/production/config-syntax-error/config-syntax-error.test.ts` — before patching `next.config.mjs`, call `await next.deleteFile('next.config.js').catch(() => {})` so Next.js picks up the `.mjs` config. (Fix was already in place per prior assessment.)

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/production/config-syntax-error/config-syntax-error.test.ts` → 2 passed, 0 failed.
