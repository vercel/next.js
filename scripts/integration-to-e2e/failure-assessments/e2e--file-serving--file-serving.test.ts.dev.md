# file-serving: CONVERSION-BUG

## Summary

The failure is caused by the test conversion changing from `fetchViaHTTP` to `next.fetch`, which uses stricter URL validation. The failing tests involve intentionally malformed URLs with backslashes and percent-encoded characters (e.g., `/\\\%2e%2e%5ctest-file.txt`) that Node.js's URL constructor rejects as invalid. The original integration test framework was more permissive with these malformed URLs, allowing the security tests to reach the Next.js server for proper path traversal prevention testing.

## Evidence

1. **Error location**: All failures occur at `getFullUrl (lib/next-test-utils.ts:146:29)` when executing `new URL(url, fullUrl)`
2. **Test pattern**: All 24 failing tests involve malformed URLs with backslashes and percent-encoded path traversal attempts
3. **URL validation difference**: The converted test uses `next.fetch(path)` which calls `getFullUrl()` and applies strict Node.js URL validation, while the original used `fetchViaHTTP(appPort, path)` which was more permissive
4. **Same test logic**: Both original and converted tests have identical expectStatus function logic and test case structures

## Fix suggestion

The test framework needs to handle malformed URLs that are intentionally invalid but still need to be tested for security purposes. Options include:

1. **Modify the test framework**: Update `getFullUrl()` in `test/lib/next-test-utils.ts` to catch URL constructor errors and fall back to a more permissive URL construction method for intentionally malformed test URLs
2. **Use raw HTTP requests**: For these specific malformed URL tests, bypass the `next.fetch()` method and use a raw HTTP client that doesn't validate URLs (similar to the original `fetchViaHTTP` behavior)
3. **URL encoding fix**: Properly encode the malformed paths before passing them to the URL constructor, though this might change the security test's intent

The preferred approach would be option 1, as it maintains the intent of testing malformed URLs while allowing the E2E test framework to handle them gracefully.
