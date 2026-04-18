All 3 tests pass.

# e2e--hydration--hydration.test.ts.start: FIXED

## Root cause

The converted test passed `'%2F%2F'` (URL-encoded `//`) to `next.browser()`, but the `getFullUrl` helper in `test/lib/next-test-utils.ts` already has a special case for the literal string `'//'` (not its URL-encoded form). The URL-encoded value was falling through to `new URL('%2F%2F', fullUrl)` which throws `TypeError: Invalid URL`. The original integration test passed `'//'` directly to `webdriver`.

## Fix applied

- `test/e2e/hydration/hydration.test.ts`: changed `next.browser('%2F%2F')` to `next.browser('//')` in both affected tests, matching the original integration test semantics and the pre-existing `'//'` special case in `getFullUrl`.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/e2e/hydration/hydration.test.ts` → 3 passed, 0 failed.
