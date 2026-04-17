# ssg-dynamic-routes-404-page: PRE-EXISTING

## Summary

The test failure is caused by a pre-existing framework issue with React hook compatibility during 404 handling. While the test correctly expects `/post/2` to return a 404 status (since it's not in the static paths and `fallback: false`), the server crashes with React hook errors related to `useInsertionEffect` instead of properly serving the custom 404 page.

## Evidence

1. **Test conversion is correct**: The converted test logic and fixture files are identical to the original integration test
2. **Expected 404 behavior**: The dynamic route `pages/post/[id].js` has `getStaticPaths` returning only `/post/1` with `fallback: false`, so `/post/2` should trigger a 404
3. **React hook errors**: The output shows `TypeError: Cannot read properties of null (reading 'useInsertionEffect')` and warnings about invalid hook calls and multiple React instances
4. **NoFallbackError handling**: The error occurs during proper NoFallbackError processing for `/post/2`, but React hooks are failing during the 404 page rendering

## Fix suggestion

This is a pre-existing framework bug in the current branch where the 404 page rendering process has React hook compatibility issues, likely related to multiple React instances or version mismatches during the error boundary/404 handling flow. The NoFallbackError should result in serving the custom 404 page, not crashing with React hook errors.
