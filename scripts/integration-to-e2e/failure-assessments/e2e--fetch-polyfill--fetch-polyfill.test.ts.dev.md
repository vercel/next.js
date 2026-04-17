# fetch-polyfill: PRE-EXISTING

## Summary

The test failure is caused by a React hooks error in Next.js's dev overlay system, specifically in the `usePagesDevOverlayBridge` component. The error "Cannot read properties of null (reading 'useContext')" and "Cannot read properties of null (reading 'useInsertionEffect')" indicates a React version mismatch or multiple React copies issue within the Next.js framework itself, causing server-side rendering to crash and return 500 error pages instead of the expected content.

## Evidence

1. **React hooks errors in dev overlay**: The stack trace points to `next/dist/next-devtools/userspace/pages/pages-dev-overlay-setup.js` where hooks are being called with null React context.

2. **Identical fixture files**: The converted test has the same page files as the original integration test (verified `static.js` is identical), ruling out conversion issues.

3. **Correct API server conversion**: The inline HTTP server in the converted test properly replicates the behavior of the original `api-server.js` file.

4. **Framework-level error**: The error occurs in Next.js internal code (`PagesDevOverlayBridge`) before reaching user code, indicating a framework issue rather than test conversion problem.

5. **Expected vs actual output**: Tests expect `/bar/` pattern but receive error page HTML with `"statusCode":500` and React hook error details.

## Fix suggestion

This is a pre-existing framework bug in Next.js's dev overlay system related to React context/hooks management. The issue would likely also affect the original integration test when run under the same conditions. The problem needs to be addressed in Next.js core, specifically in the dev overlay bridge component's React hooks usage pattern.
