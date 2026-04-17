# config-experimental-warning: CONVERSION-BUG

## Summary

The converted test is failing because it's not properly capturing the experimental configuration warnings that were shown in the original test. The original integration test used a custom `collectStdoutFromDev()` function that launched the app with explicit stdout capture and made a fetch request to ensure full server startup, but the converted e2e test relies on `next.cliOutput` from `nextTestSetup()` which only captures the basic startup message and not the experimental warnings.

## Evidence

1. **Expected vs Actual Output**: All failing tests expect to see `"- Experiments (use with caution):"` but only receive the basic Next.js startup message: `"▲ Next.js 16.2.1-canary.45 (Turbopack) - Local: http://localhost:56091 - Network: http://192.168.2.173:56091 ✓ Ready in 421ms"`

2. **Different Output Capture Methods**:
   - Original test: Used `collectStdoutFromDev()` with custom stdout capturing and `await fetch()` to trigger full startup
   - Converted test: Uses `stripAnsi(next.cliOutput)` from `nextTestSetup()`

3. **Missing Server Request**: The original test made a `fetch()` request to `http://localhost:${port}` after launching the app, which may be necessary to trigger the experimental warnings display. The converted test doesn't make any requests.

4. **Consistent Pattern**: All 5 failing tests have the same issue - they expect experimental warnings but only see the basic startup message, while tests that expect NOT to see the warnings (like "should not show warning with default config") are passing.

## Fix suggestion

The conversion needs to be fixed by either:

1. **Add a request to trigger full startup**: Modify the failing test cases to make an HTTP request to the Next.js server (similar to `await fetch()` in the original) to ensure the experimental warnings are displayed

2. **Use a different output capture method**: Investigate if `nextTestSetup()` has options to capture more verbose CLI output or if there's an alternative way to access the full stdout that includes experimental warnings

3. **Wait for experimental warnings**: Add a retry mechanism to wait for the experimental warnings to appear in the CLI output, as they might be displayed after the initial "Ready" message

The core issue is that the converted test is not replicating the same conditions that caused the experimental warnings to be displayed in the original test.
