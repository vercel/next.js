# edge-runtime-configurable-guards: CONVERSION-BUG

## Summary

The converted test is trying to read and preserve original content from `lib/index.js` in `beforeAll`, but this file is just a placeholder (`// populated by tests`) in the fixture. The original integration test dynamically wrote content to this lib file during each test run using the `File` utility, rather than reading and restoring pre-existing content. The conversion misunderstood this pattern and incorrectly assumes there's meaningful original content to preserve.

## Evidence

1. **Error shows missing lib file**: `ENOENT: no such file or directory, open '.../lib/index.js'` at line 320 where it tries to read `originalLib`

2. **Original test used dynamic File management**: The original test used `context.lib = new File(...)` and called `context.lib.write()` in each test's `init()` function to dynamically populate the lib file content, then `context.lib.restore()` in cleanup.

3. **Fixture file is just a placeholder**: The actual fixture file contains only `// populated by tests` - there's no meaningful original content to preserve.

4. **Conversion pattern mismatch**: The converted test tries to read original content in `beforeAll` and restore it in `afterEach`, but should instead manage the lib file content dynamically per test like the original did.

## Fix suggestion

The converted test should:

1. Remove the `originalLib` variable and the `beforeAll`/`afterEach` logic for reading/restoring lib content
2. Instead, ensure the lib file gets written with appropriate content when tests need it (similar to how `libContent` is conditionally written in the test parameterization)
3. The lib file should be treated as a dynamic test artifact that gets created/modified during test execution, not as a fixture file with content to preserve

The file management pattern should match how the original integration test dynamically managed the lib file content using the `File` utility's `write()` method.
