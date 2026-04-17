# i18n-support-base-path: CONVERSION-BUG

## Summary

The converted e2e test is calling `runTests(ctx)` from the shared test module without the conditional logic that separated development and production modes in the original integration test. This causes production-mode tests to run in development mode, leading to timeouts and rendering failures because the shared test suite contains tests designed for both modes but expects different runtime behavior.

## Evidence

1. **Missing conditional logic**: The original integration test had separate `describe` blocks for development and production modes with environment-based skipping (`TURBOPACK_BUILD ? describe.skip : describe`), but the converted test calls `runTests(ctx)` unconditionally.

2. **Mode mismatch errors**: Test failures show timeouts waiting for elements like `#router-locale`, `#props`, `#to-another`, and JSON parsing errors on empty content, suggesting pages aren't rendering as expected when production tests run in dev mode.

3. **Shared test runner**: Both tests import from the same shared module (`runTests` from `i18n-support/shared`), but the integration test used it within mode-specific contexts while the e2e test runs it globally.

4. **Page structure is correct**: The fixture files like `pages/index.js` contain the expected elements (`#router-locale`, `#props`, etc.), indicating the issue isn't missing fixtures but runtime behavior differences.

## Fix suggestion

The converted test needs to be restructured to separate development and production mode tests, similar to the original integration test. Either:

1. Split into separate test files for dev/production modes, or
2. Add conditional `describe` blocks with proper mode detection and skip logic around the `runTests(ctx)` call, matching the original pattern.

The `runTests()` call should only execute tests appropriate for the current test mode (dev vs production).
