# hydration: CONVERSION-BUG

## Summary

The test failure is caused by the conversion from integration test format to e2e test format. The original integration test successfully tested Next.js handling of double-slash URLs (`//`) using `webdriver(appPort, '//')`, but the converted test uses `next.browser('//')` which has stricter URL validation and throws "Invalid URL" when trying to construct a URL object from the `'//'` path.

## Evidence

1. **Original test worked**: The original integration test in `test/integration/hydration/test/index.test.ts` lines 25 and 30 successfully used `webdriver(appPort, '//')` to test the same functionality.

2. **Error location**: The error occurs in `lib/next-test-utils.ts:146` when `new URL(url, fullUrl)` is called with `url = '//'`, which is not a valid URL constructor parameter.

3. **Test infrastructure change**: The conversion replaced `webdriver(appPort, '//')` with `next.browser('//')`, and the latter has stricter URL validation.

4. **Fixtures are correct**: All necessary fixture files (`pages/*.js`) are present in the converted test directory, matching the original integration test structure.

## Fix suggestion

The `next.browser()` method in the e2e test infrastructure needs to be updated to handle edge case URLs like `'//'` that the original `webdriver` function could handle. Alternatively, the URL validation logic in `getFullUrl` should be made more permissive to match the behavior of the original integration test framework. The test itself is correctly converted and the fixtures are in place - only the URL handling in the test infrastructure needs adjustment.
