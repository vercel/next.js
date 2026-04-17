# tsconfig-verifier: PRE-EXISTING

## Summary

The test failures are caused by a change in Next.js's behavior where it now prints more verbose information about tsconfig.json modifications during the build process. The tests expect that when users explicitly configure TypeScript options like `moduleResolution`, Next.js should not mention these options in its CLI output since no modification is needed. However, Next.js is now including these option names in its informational messages, causing the `expect(next.cliOutput).not.toContain('moduleResolution')` assertions to fail.

## Evidence

1. **Test Logic is Sound**: The tests set explicit TypeScript compiler options (e.g., `moduleResolution: "node16"`) and expect Next.js not to mention these in its output since they're already properly configured.

2. **Framework Behavior Change**: From the test output, Next.js prints detailed messages like:

   ```
   The following suggested values were added to your tsconfig.json...
   The following mandatory changes were made to your tsconfig.json:
     - esModuleInterop was set to true (requirement for SWC / babel)
     - resolveJsonModule was set to true (to match webpack resolution)
   ```

3. **Multiple Failing Tests**: All failing tests follow the same pattern - they set TypeScript options explicitly but still see those option names mentioned in Next.js output.

4. **Test Fixtures Are Valid**: The fixture files contain proper TypeScript code with correct structure.

## Fix suggestion

This appears to be a framework issue where Next.js has become more verbose in its tsconfig.json modification reporting. The original integration test would likely also fail with the current Next.js behavior. The framework should be updated to not mention TypeScript compiler options in its output when those options are already properly configured by the user.
