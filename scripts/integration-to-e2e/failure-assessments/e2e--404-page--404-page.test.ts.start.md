# 404-page: PRE-EXISTING

## Summary

The test failures are primarily caused by a framework behavior change where `getStaticProps` in `pages/404` now triggers the same validation error as `getInitialProps`/`getServerSideProps`. The original integration test expected `getStaticProps` to be allowed, but the current framework rejects it with the error "`pages/404` can not have getInitialProps/getServerSideProps". Additionally, there are test setup issues where the server isn't properly stopped between tests.

## Evidence

1. **Framework behavior change**: The test "does not show error with getStaticProps in pages/404 build" expects:
   - Build to succeed (`exitCode` should be 0)
   - CLI output should NOT match the error pattern

   But the actual output shows:

   ```
   > Build error occurred
   Error: `pages/404` can not have getInitialProps/getServerSideProps
   ```

2. **Test setup issues**: The other two failed tests show "can not run export while server is running, use next.stop() first" - indicating the converted test isn't properly managing server lifecycle between test cases.

3. **Original vs converted behavior**: The original integration test (lines 294-310) expected `getStaticProps` to be valid in pages/404, but the current framework behavior treats it as an error alongside `getInitialProps`/`getServerSideProps`.

## Fix suggestion

This is a **PRE-EXISTING** framework behavior change. The validation logic for pages/404 appears to have been expanded to also reject `getStaticProps`, not just `getInitialProps`/`getServerSideProps`. The test expectations need to be updated to reflect the current framework behavior - either the test should be removed if this is intentional, or the framework validation should be adjusted if `getStaticProps` should be allowed in pages/404.

The server lifecycle issues in the other two tests could be fixed by adding proper `next.stop()` calls, but those are secondary to the core behavioral difference.
