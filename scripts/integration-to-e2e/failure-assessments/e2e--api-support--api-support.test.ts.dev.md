# api-support: CONVERSION-BUG

## Summary

The test conversion has multiple issues that prevent it from running correctly. The main problem is that the converted e2e test is missing the `http-proxy` dependency installation, causing module resolution failures for several API routes that depend on it. Additionally, the test has a structural issue where multiple `nextTestSetup` instances are created without proper cleanup, causing test infrastructure conflicts.

## Evidence

1. **Missing dependency**: The main error shows `Module not found: Can't resolve 'http-proxy'` for the `proxy-self.js` API route. While `http-proxy` is listed in the root `package.json`, the e2e test framework appears to run in an isolated environment where this dependency is not available.

2. **Multiple failing tests**: 9 out of 54 tests fail, with several showing 500 status codes instead of expected status codes (204, 200, 404), and HTML error pages instead of expected text content like "User error".

3. **Test setup conflict**: The "output export error" test fails with `createNext called without destroying previous instance`, indicating improper test isolation when creating multiple `nextTestSetup` instances.

4. **Working counterexamples**: Other e2e tests like `test/e2e/css-client-nav/css-client-nav.test.ts` successfully use `import httpProxy from 'http-proxy'` with the same syntax, suggesting the issue is specific to this test's setup.

5. **Import syntax consistency**: Both the original integration test and converted e2e test use identical `import httpProxy from 'http-proxy'` syntax, ruling out a conversion syntax error.

## Fix suggestion

1. **Add package.json with dependencies**: Create a `package.json` file in the `test/e2e/api-support/` directory with `http-proxy` as a dependency, or configure the test environment to make the root dependency available.

2. **Fix test structure**: Refactor the "output export error" test to either use the same `nextTestSetup` instance or properly isolate it in a separate test file to avoid the "createNext called without destroying previous instance" error.

3. **Alternative approach**: Consider using `next/dist/compiled/http-proxy` instead of the direct `http-proxy` import, as seen in working examples like `test/e2e/next-font/with-proxy/server.js`.
