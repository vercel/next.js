# gssp-redirect-base-path: PRE-EXISTING

## Summary

The test failures appear to be caused by pre-existing framework behavior related to client-side redirect history handling. Four of the five failing tests involve client-side navigation to redirect pages where `history.back()` is not returning to the expected location, suggesting the redirect mechanism may be replacing history entries instead of pushing new ones. One additional test fails due to a conversion bug where `next.build()` is called while the test server is running.

## Evidence

1. **History navigation failures (4 tests)**: All failing history tests have identical logic between original and converted versions:
   - Start at `/docs/another?mark_as=root`
   - Navigate to `/docs/`
   - Navigate to redirect page (e.g., `/gssp-blog/redirect-dest-_another`)
   - Call `history.back()`
   - **Expected**: `/docs` **Received**: redirect destination like `/docs/another`

2. **Build test failure (1 test)**: Clear conversion bug at line 417:

   ```
   can not run export while server is running, use next.stop() first
   ```

   The original test uses `nextBuild(appDir)` in isolation, but the converted test calls `await next.build()` on a running test server instance.

3. **Fixture files match**: All fixture files are identical between original (`test/integration/gssp-redirect-base-path/`) and converted versions (`test/e2e/gssp-redirect-base-path/`).

## Fix suggestion

**PRE-EXISTING**: The primary issue appears to be that client-side redirects in GSSP/GSP pages are replacing browser history entries instead of pushing new ones, causing `history.back()` to skip over intermediate navigation steps. This behavior may have existed in the original codebase but wasn't caught by the integration test setup. The framework's redirect history handling should be investigated.

**Secondary CONVERSION-BUG**: The build test needs to be fixed by either calling `await next.stop()` before `next.build()`, or restructuring the test to run the build in isolation similar to the original test pattern.
