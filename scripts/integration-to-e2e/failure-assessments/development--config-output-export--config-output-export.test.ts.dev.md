# config-output-export: CONVERSION-BUG

## Summary

The test failures are caused by the conversion approach using dynamic file patching with a shared dev server instance instead of launching separate dev servers for each test configuration. The converted test expects error messages to appear in `next.cliOutput` when files are dynamically patched, but the original integration test launched fresh dev servers with different configs and checked `stderr/stdout` directly. This fundamental difference means error messages that should be triggered during server startup are not being captured properly.

## Evidence

1. **Missing error messages**: Tests expecting messages like "Middleware cannot be used with "output: export"." in `next.cliOutput` are failing because these messages don't appear during dynamic file patching.

2. **Server restart failures**: Multiple tests fail with "Server has not finished restarting" and "No child process available" errors, indicating the dynamic patching approach is causing server instability.

3. **Different error capture mechanisms**: The original test used `runDev()` to capture `stderr` from fresh server launches, while the converted test relies on `next.cliOutput` from a shared server instance with dynamic patching.

4. **Test output shows successful server starts**: The middleware test output shows the server starting successfully multiple times but never displays the expected validation error messages.

## Fix suggestion

The conversion needs to be rewritten to match the original test's approach more closely:

1. Each test that expects configuration validation errors should use a separate `nextTestSetup` instance with the problematic config pre-configured, rather than dynamic patching.

2. Alternatively, modify the tests to check for errors at the right time - immediately after patching and during the server restart process, not just in accumulated CLI output.

3. Consider using `skipStart: true` and manual server control to better replicate the original test's server lifecycle management.

The current dynamic patching approach fundamentally changes when and how configuration validation occurs, making it incompatible with tests that depend on server startup-time validation.
