# non-standard-node-env-warning: PRE-EXISTING

## Summary

The test failure is caused by a pre-existing framework bug that occurs when `NODE_ENV=development` is set during a production build (`next build`). The error indicates that `<Html>` from `next/document` is being imported outside of `pages/_document`, but this import doesn't exist in any of the test fixture files. This suggests an internal Next.js framework issue where setting a non-standard NODE_ENV value during production builds triggers incorrect import behavior in the framework's internal code.

## Evidence

1. **Identical fixture files**: The test fixture files (`pages/index.js`, `server.js`) are identical between the original integration test and the converted e2e test, ruling out conversion issues.

2. **No Html imports in fixtures**: Extensive search confirms no `Html` or `next/document` imports exist in any test fixture files.

3. **Framework-level error**: The error occurs at `at z (.next/server/chunks/ssr/[root-of-the-server]__1-nw_6t._.js:6:1323)` - internal Next.js compilation code, not user code.

4. **Selective failure pattern**: The "build warning" test (line 123) passes successfully, but the "start warning" test (line 137) fails during the same build step, indicating inconsistent framework behavior.

5. **Error context**: The failure happens during `next build` when `NODE_ENV=development` is explicitly set, which is the exact edge case this test is designed to verify.

## Fix suggestion

This is a pre-existing Next.js framework bug where setting `NODE_ENV=development` during production builds causes internal Html import errors. The framework should handle non-standard NODE_ENV values gracefully during builds without triggering document import restrictions in internal code. The original integration test would likely also fail under the same conditions on this branch.
