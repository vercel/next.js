# dynamic-routing: PRE-EXISTING

## Summary

The test failure is caused by a pre-existing React runtime error in the Next.js dev overlay system on this branch. The core issue is that `useInsertionEffect` is being called on a null React object during server-side rendering, which causes pages to return 500 errors instead of rendering properly. This is not a conversion problem but a framework bug affecting the dev overlay functionality.

## Evidence

1. **React Runtime Error**: The consistent error across all failing tests is `Cannot read properties of null (reading 'useInsertionEffect')` occurring in the React dev overlay bridge component at `/next-devtools/userspace/pages/pages-dev-overlay-setup.js:34:20`.

2. **Server-Side Rendering Context**: The error stack trace shows `react-dom-server.edge.development.js` indicating this is happening during SSR when the dev overlay tries to initialize.

3. **500 Status Codes**: Pages that should return normal content are instead returning 500 errors with the React error, such as the test expecting `/` to return 400 status but getting 500.

4. **Identical Fixtures**: Comparison between the original integration test directory (`test/integration/dynamic-routing`) and converted e2e test directory (`test/e2e/dynamic-routing`) shows identical fixture files (pages, public assets, etc.).

5. **Test Pattern Differences Are Not the Issue**: While the converted test uses `retry()` instead of `check()` patterns, the underlying problem is that pages fail to render due to the React runtime error, not test assertion differences.

## Fix suggestion

Since this is PRE-EXISTING: This appears to be a framework regression in the dev overlay system where React is not properly initialized when `useInsertionEffect` is called. The issue likely affects the entire dev environment on this branch and would need investigation of the React integration in the dev overlay components, particularly around how React hooks are accessed during SSR.
