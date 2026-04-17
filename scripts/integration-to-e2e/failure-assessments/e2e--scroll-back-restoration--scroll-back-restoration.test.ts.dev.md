Looking at the error details from the test output, this appears to be a **PRE-EXISTING** framework issue in Next.js itself.

# scroll-back-restoration: PRE-EXISTING

## Summary

The test failure is caused by a React runtime error in Next.js's development overlay system for Pages Router. The error `Cannot read properties of null (reading 'useInsertionEffect')` occurs in `usePagesDevOverlayBridge` during server-side rendering, where React hooks are being called in an invalid context. This causes the page to fail with a 500 error, preventing the scroll restoration test from running properly.

## Evidence

1. **React SSR Hook Error**: The stack trace shows `useInsertionEffect` being called on `null` during server-side rendering in `react-dom-server.edge.development.js`:

   ```
   TypeError: Cannot read properties of null (reading 'useInsertionEffect')
   at usePagesDevOverlayBridge (pages-dev-overlay-setup.js:34:20)
   ```

2. **Server 500 Error**: The page fails to render with "GET / 500 in 851ms", indicating a server-side rendering failure.

3. **Test Logic Unchanged**: Comparing the converted test to the original shows identical test logic - only the test runner setup changed from manual `launchApp`/`nextStart` to `nextTestSetup`.

4. **Fixture Files Present**: All required fixture files exist in the converted test directory (`pages/index.js`, `pages/another.js`, `next.config.js`).

5. **Dev Overlay Context**: The error occurs specifically in Next.js's development overlay bridge system, which is framework code, not test code.

## Fix suggestion

This is a framework bug in Next.js where the Pages Router development overlay is attempting to use React hooks (`useInsertionEffect`) in a server-side rendering context where they are not available or properly initialized. The issue needs to be fixed in Next.js core by:

1. Adding proper environment checks before calling React hooks in the dev overlay bridge
2. Ensuring the dev overlay components only run in client-side contexts
3. Adding guards around hook usage in `pages-dev-overlay-setup.js`

The original integration test would likely also fail with this same error on this branch.
