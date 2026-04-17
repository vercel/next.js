# dynamic-routing: CONVERSION-BUG

## Summary

The test failure is caused by a difference in how the converted e2e test sets up the Next.js environment compared to the original integration test. The new test framework (`nextTestSetup()`) appears to enable deployment ID injection features by default, which adds `deploymentId` and `onMatchHeaders` entries to the routes manifest, while the original integration test setup did not include these features.

## Evidence

1. The snapshot mismatch shows two key additions not expected by the original test:
   - `"deploymentId": "test-dpl-id-1234"` field at the root level
   - `onMatchHeaders` array populated with deployment ID injection rules instead of being empty

2. The original integration test (lines 1468, 1290) explicitly expected `"onMatchHeaders": []` as an empty array

3. The deployment ID value `"test-dpl-id-1234"` appears to be a test environment default, suggesting the new test framework enables deployment features

4. The original integration test used manual app setup (`launchApp`, `nextStart`) while the converted test uses `nextTestSetup()`, which likely has different environment defaults

## Fix suggestion

The converted test needs to be configured to match the original test environment. This could be done by:

1. **Option 1**: Configure `nextTestSetup()` to disable deployment ID features if such an option exists
2. **Option 2**: Update the snapshot expectation to account for the new default behavior if this is intentional framework behavior
3. **Option 3**: Investigate if there's an environment variable or configuration option that can disable the deployment ID injection to match the original test setup

The fix should ensure the routes manifest output matches what the original integration test expected, or update the test to explicitly handle the environment differences between the old and new test frameworks.
