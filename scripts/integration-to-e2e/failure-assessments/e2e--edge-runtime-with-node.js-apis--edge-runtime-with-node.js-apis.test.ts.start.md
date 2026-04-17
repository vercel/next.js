# edge-runtime-with-node.js-apis: PRE-EXISTING

## Summary

The test failure is caused by a framework behavior change where using Node.js APIs in edge runtime now causes build failures (exit code 1) instead of just producing warnings. All 42 tests fail because the `next build` command is crashing when it encounters unsupported Node.js APIs in edge runtime code, rather than completing the build with warnings as the test expects.

## Evidence

1. **Consistent build failures**: All tests fail with the identical error `next build failed with code/signal 1`, indicating the build process itself is crashing, not individual test logic failures.

2. **Fixture files are correct**: The conversion properly copied all necessary files (`middleware.js`, `pages/api/route.js`, `lib/utils.js`) from the original integration test.

3. **Test expects warnings, not build failures**: The test logic checks for warning messages in the build output (`expect(next.cliOutput).toContain('A Node.js API is used')`), but the build is failing before completing.

4. **Edge runtime configuration present**: The API route has `export const config = { runtime: 'edge' }` and the middleware uses Node.js APIs that should trigger warnings according to the test's intent.

5. **Framework behavior change**: The original test was designed when using unsupported Node.js APIs in edge runtime produced build warnings. Current Next.js appears to treat these as build-breaking errors.

## Fix suggestion

This is a framework issue where Next.js has changed its behavior for edge runtime + Node.js API usage from warnings to build failures. The test needs to be updated to match current framework behavior, or the framework behavior needs to be reverted to only produce warnings. This would require investigation of when this behavior changed and whether it was intentional.
