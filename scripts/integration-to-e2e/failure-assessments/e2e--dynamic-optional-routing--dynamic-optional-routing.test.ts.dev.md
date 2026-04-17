# dynamic-optional-routing: CONVERSION-BUG

## Summary

The failure is caused by improper test isolation in the converted test. The build validation tests are running in sequence without proper cleanup, causing files patched in earlier tests to still be present during later tests, leading to route conflicts that mask the intended error messages.

## Evidence

Looking at the test output, the failing tests are encountering multiple accumulated routing conflicts:

1. `"/` and `/[[...optionalName]]"` conflict
2. `"/nested"` and `"/nested[[...optionalName]]"` conflict
3. `"[...param]"` and `"[[...optionalName]]"` conflict at same level

The tests expect specific error messages:

- "Optional route parameters are not yet supported"
- "A required parameter (slug) was not provided as an array received undefined in getStaticPaths"

But instead get generic routing conflict errors because multiple invalid route files are present simultaneously.

In the original test (lines 284-286), each build validation test runs independently with `runInvalidPagesTests()`. In the converted test, all validation tests share the same `next` instance in a single describe block, allowing file state to accumulate between tests.

## Fix suggestion

The build validation tests need proper isolation. Either:

1. Add cleanup (`next.deleteFile()`) at the end of each test, or
2. Restructure to use separate `next` instances for each validation test, or
3. Modify the test to properly reset state between tests

The core issue is that `next.patchFile()` calls from earlier tests are leaving files in place that interfere with later tests' expected error scenarios.
