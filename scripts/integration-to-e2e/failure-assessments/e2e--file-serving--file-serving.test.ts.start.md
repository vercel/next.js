# file-serving: CONVERSION-BUG

## Summary

The test failures are caused by a conversion bug in how URLs are handled. The original integration test used `fetchViaHTTP()` which was more lenient with malformed URLs, while the converted e2e test uses `next.fetch()` which goes through `getFullUrl()` in the test utilities. This function tries to create valid URL objects using the `new URL()` constructor, which throws "Invalid URL" errors when given paths containing invalid characters like `/\\\\\\%2e%2e%5ctest-file.txt`.

## Evidence

1. **Error pattern**: All failures show `TypeError: Invalid URL` at `getFullUrl (lib/next-test-utils.ts:146:29)` where `new URL(url, fullUrl)` is called.

2. **Failing test patterns**: Tests with invalid URL characters like:
   - `////%2e%2e%2ftest-file.txt`
   - `/\\\\\\%2e%2e%5ctest-file.txt`
   - `/\\..%2f` patterns

3. **Code comparison**:
   - Original: `await fetchViaHTTP(appPort, path, undefined, { redirect: 'manual' })`
   - Converted: `await next.fetch(path, { redirect: 'manual' })`

4. **Root cause**: The `getFullUrl` function at line 146 calls `new URL(url, fullUrl)` which validates URL structure, but these tests intentionally use malformed URLs to test path traversal protection.

## Fix suggestion

The test conversion changed the URL handling behavior. The fix should either:

1. Modify the converted test to use a more lenient HTTP fetch method that doesn't validate URLs (similar to how `fetchViaHTTP` worked)
2. Add error handling in the test to catch and handle invalid URL cases gracefully
3. Modify the `getFullUrl` function to handle invalid URLs without throwing errors for security testing scenarios

The tests are designed to verify that the server properly rejects malformed path traversal attempts, so the test infrastructure shouldn't fail on these invalid URLs - it should pass them through to test the server's security behavior.
