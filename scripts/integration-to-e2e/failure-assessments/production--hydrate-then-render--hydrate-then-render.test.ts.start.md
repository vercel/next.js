# hydrate-then-render: PRE-EXISTING

## Summary

The test fails during `next build` with "window is not defined" when executing `_app.js` server-side during the "Collecting page data" phase. The fixture files are identical between the converted and original tests, but the error indicates a framework regression where client-side code in `_app.js` is being evaluated in a server context during build. The bug is in the fixture code that checks `typeof navigator !== 'undefined'` but then unconditionally accesses `window`, however this same code existed in the working integration test.

## Evidence

1. **Identical fixture files**: The `pages/_app.js` files in both converted and original tests are byte-for-byte identical, including the problematic code that accesses `window` without proper guards.

2. **Build-time error**: The failure occurs during `next build` in the "Collecting page data" phase, not during test execution:

   ```
   unhandledRejection ReferenceError: window is not defined
   at module evaluation (.next/server/chunks/ssr/[root-of-the-server]__0vbdw3z._.js:1:3417)
   ```

3. **Server-side evaluation**: The stack trace shows the error originates from server chunks (`ssr/[root-of-the-server]`) being evaluated during build.

4. **Working integration test**: The original integration test with identical fixtures suggests this configuration worked previously, indicating a framework behavior change.

## Fix suggestion

This appears to be a regression in Next.js where `_app.js` code is being evaluated server-side during build when it previously wasn't. The fixture code should be updated to properly guard `window` access:

```javascript
if (typeof navigator !== 'undefined' && typeof window !== 'undefined') {
  window.__BEACONS = window.__BEACONS || []
  // ...
}
```

However, since this represents a behavior change from when the integration test worked, it should be investigated as a potential framework regression in how client-side app code is processed during build.
