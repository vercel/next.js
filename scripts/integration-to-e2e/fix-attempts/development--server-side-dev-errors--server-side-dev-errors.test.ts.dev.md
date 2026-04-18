All 9 tests pass.

# development--server-side-dev-errors--server-side-dev-errors.test.ts.dev: FIXED

## Root cause

The code frame output in the uncaught rejection/exception tests uses 2-digit padded line numbers because line 10 is shown in the frame (the fixture files have 11 lines). The converted test's `toContain` expected strings used 1-digit padding (`"  5 |"`, `"> 7 |"`), which never appeared in the output that actually uses `"   5 |"` and `">  7 |"`. The original integration test used `toMatchInlineSnapshot` so this wasn't an issue; the conversion to strict substring assertions introduced the mismatch.

## Fix applied

- `test/development/server-side-dev-errors/server-side-dev-errors.test.ts`: Updated the four failing `toContain` assertions (uncaught-rejection, uncaught-empty-rejection, uncaught-exception, uncaught-empty-exception) to use 2-digit padded line number format (`"   5 |"`, `"   6 |"`, `">  7 |"`) matching the actual code-frame output.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/development/server-side-dev-errors/server-side-dev-errors.test.ts` — Tests: 9 passed, 9 total. All 5 previously failing tests now pass, and no regressions in the 4 previously passing tests.
