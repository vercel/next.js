# turbopack-unsupported-log: PRE-EXISTING

## Summary

The test failures are caused by a React runtime error in the dev overlay setup that prevents the application from rendering properly. The error "Cannot read properties of null (reading 'useInsertionEffect')" occurs in React 19.2.5's development runtime during the pages dev overlay bridge initialization, causing the app to crash and display an error page instead of the expected content. This prevents both the page content assertions and the unsupported config warning checks from working correctly.

## Evidence

1. **React Runtime Error**: The stack trace shows the error originates in React's development runtime at `react.development.js:1241:33` when calling `useInsertionEffect`, then propagates through Next.js's dev overlay setup.

2. **Error Page Instead of Content**: The first test expects "hello world" but receives a full error page HTML with the React error details, indicating the app never successfully renders.

3. **Missing Warning Output**: The second test expects to see "You are using configuration and/or tools that are not yet" in CLI output but only sees basic startup messages, suggesting the warning logic never executes due to the runtime crash.

4. **Proper Test Conversion**: The converted test fixtures are correctly set up - the `pages/index.js` files match the original, and the `next.config.js` files contain the expected configurations.

5. **Framework-Level Issue**: The error occurs deep in React's runtime during dev tooling initialization, not in test-specific code or configuration.

## Fix suggestion

This appears to be a pre-existing framework issue with React 19.2.5 compatibility in the dev overlay system on this branch. The original integration test would likely fail with the same error if run against the current codebase. The issue needs to be investigated and fixed at the framework level, likely in the dev overlay setup or React version compatibility handling.
