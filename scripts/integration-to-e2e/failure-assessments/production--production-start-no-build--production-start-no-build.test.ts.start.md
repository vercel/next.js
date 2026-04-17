# production-start-no-build: CONVERSION-BUG

## Summary

The test conversion introduced a fundamental behavior change in how missing production builds are handled. The original integration test expects `nextServer().prepare()` to throw an error when no build exists, but the converted test using `nextTestSetup()` and `next.start({ skipBuild: true })` allows the server to start successfully and expects an error message in CLI output that never appears.

## Evidence

1. **Original test behavior**: Uses `nextServer({ dev: false })` and `await srv.prepare()` with `expect(...).rejects.toThrow(/Could not find a production build in the/)` - expects an error to be thrown during server preparation.

2. **Converted test behavior**: Uses `next.start({ skipBuild: true }).catch(() => {})` and checks `next.cliOutput` for the error message.

3. **Actual output shows successful startup**:

   ```
   ✓ Ready in 345ms
   ```

   Instead of an error, the server starts normally.

4. **Missing error pattern**: The test expects `/Could not find a production build in the/` in CLI output, but receives normal startup messages instead.

## Fix suggestion

The conversion incorrectly changed both the error handling mechanism and expectation. The fix should:

1. **Remove the `.catch(() => {})` suppression** and expect `next.start({ skipBuild: true })` to throw an error, matching the original test's behavior
2. **Change the assertion** from checking `next.cliOutput` to using `expect(...).rejects.toThrow()`
3. **Alternatively**, investigate whether the new `nextTestSetup()` infrastructure has different behavior for missing builds and adjust the test accordingly

The core issue is that the original test verified that server preparation fails when no build exists, while the converted test assumes the server starts but logs an error - a fundamentally different behavior.
