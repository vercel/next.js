The test already passes with the current state.

# e2e--dist-dir--dist-dir.test.ts.start: FIXED

## Root cause

The converted test placed `should throw error with invalid distDir` and `should handle undefined distDir` inside the main describe block that used `nextTestSetup()` without `skipStart: true`. Those tests call `next.build()`, which throws when a server is already running. The original integration test ran `nextBuild()` standalone without a running server.

## Fix applied

The fix was already present in `test/e2e/dist-dir/dist-dir.test.ts`: the two validation tests are wrapped in `if (isNextStart)` and placed in a separate `describe('distDir config validation')` block using `nextTestSetup({ files: __dirname, skipStart: true })`. With `skipStart: true`, no server is running when `next.build()` is invoked.

Files changed: none (prior fix was already in place; verified by running the test).

## Verification

```
PASS Turbopack test/e2e/dist-dir/dist-dir.test.ts (8.978 s)
  distDir
    ✓ should render the page
    ✓ should build the app within the given `dist` directory
    ✓ should not build the app within the default `.next` directory
  distDir config validation
    ✓ should throw error with invalid distDir (633 ms)
    ✓ should handle undefined distDir (3568 ms)

Tests: 5 passed, 5 total
```
