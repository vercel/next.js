# jsconfig-paths: CONVERSION-BUG

## Summary

The test failure is caused by how the converted test handles jsconfig.json modification in the "without baseurl" test suite. While the original integration test uses the `File` utility for proper file management and restoration, the converted test uses `next.patchFile()` which appears to cause React rendering issues during server-side rendering, specifically "Cannot read properties of null (reading 'useInsertionEffect')" errors in the dev overlay bridge.

## Evidence

1. **Selective failure pattern**: Only the "jsconfig paths without baseurl" tests fail (4 failed), while the regular "jsconfig paths" tests pass (6 passed), indicating the issue is specific to the jsconfig modification logic.

2. **React hook error**: The error shows "Invalid hook call. Hooks can only be called inside of the body of a function component" originating from `usePagesDevOverlayBridge` during server-side rendering, suggesting a React rendering issue triggered by the configuration change.

3. **Different file modification approaches**:
   - Original test: Uses `File` utility with proper `restore()` cleanup
   - Converted test: Uses `next.patchFile()` which may not handle jsconfig changes properly

4. **Fixture files present**: All necessary fixture files exist in the test directory, ruling out missing files as the cause.

## Fix suggestion

The conversion needs to properly handle jsconfig.json modification. Consider:

1. **Use proper file restoration**: Ensure the jsconfig.json is properly restored after modification, similar to how the original test uses `File.restore()`

2. **Handle Next.js restart**: The jsconfig modification may require a Next.js restart to properly reload the configuration without causing React rendering issues

3. **Alternative approach**: Use a separate test fixture directory for the "without baseurl" tests instead of modifying the jsconfig.json at runtime, which would avoid the configuration change complications entirely

The core issue is that the runtime modification of jsconfig.json in the converted test is causing React rendering problems that the original test's file management approach avoided.
