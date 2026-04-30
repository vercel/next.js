# development--trailing-slash-dist--trailing-slash-dist.test.ts.dev: FIXED

## Root cause

The converted test was trying to directly read `.next/build-manifest.json` which only exists after production builds, not in development mode. The original integration test used `getPageFileFromBuildManifest()` utility function from `next-test-utils` that properly handles both development and production modes, but this was lost during the conversion to the e2e-utils style.

## Fix applied

- **test/development/trailing-slash-dist/trailing-slash-dist.test.ts**:
  - Added import of `getPageFileFromBuildManifest` from `next-test-utils`
  - Replaced the direct build manifest reading logic with `getPageFileFromBuildManifest(next.testDir, '/')`
  - Simplified the test to match the original integration test's approach
  - Removed the unnecessary build manifest parsing steps that were causing the failure

## Verification

The test now passes successfully:

```
PASS Turbopack test/development/trailing-slash-dist/trailing-slash-dist.test.ts
  trailing-slash-dist
    ✓ supports trailing slash in distDir (736 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

The fix correctly handles the development mode by using the appropriate utility function that can extract page file information without requiring build artifacts that don't exist in dev mode.
