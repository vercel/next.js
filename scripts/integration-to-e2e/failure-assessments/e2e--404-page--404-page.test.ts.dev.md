# 404-page: CONVERSION-BUG

## Summary

The test failures are caused by conversion issues related to test lifecycle management and state isolation. The converted test improperly handles server lifecycle in the "404 Page build validation" suite, leading to attempts to run builds while servers are running, and doesn't properly isolate file modifications between tests, causing state contamination.

## Evidence

1. **Server lifecycle errors**: Two tests fail with "can not run build while server is running, use next.stop() first" - this is a clear conversion bug where the test setup doesn't properly manage server state between tests.

2. **State contamination**: The getStaticProps tests that should pass are failing because `next.cliOutput` contains error messages from previous tests. The converted test uses `skipStart: true` for the build validation suite but doesn't properly reset state between tests.

3. **Test isolation differences**: The original test used manual file operations (`fs.move()`, `fs.writeFile()`) with proper backup/restore and individual server management per test. The converted test uses shared `nextTestSetup` instances but doesn't account for the different requirements of the build validation tests.

4. **Cache control expectation mismatch**: The cache control headers are different (`"no-cache, must-revalidate"` vs expected `"private, no-cache, no-store, max-age=0, must-revalidate"`), suggesting either incomplete test setup or framework behavior changes, but this appears secondary to the lifecycle issues.

## Fix suggestion

1. **Fix server lifecycle**: Ensure the build validation tests properly stop any running servers before calling `next.build()`, or restructure to use separate test instances.

2. **Add proper file cleanup**: Between tests that modify `pages/404.js`, ensure the file is reset to its original state to prevent contamination.

3. **Consider separate test suites**: The build validation tests may need their own isolated `nextTestSetup` instance or different lifecycle management than the dev server tests.

4. **Verify cache control expectations**: Check if the cache control header expectations need updating to match current framework behavior.
