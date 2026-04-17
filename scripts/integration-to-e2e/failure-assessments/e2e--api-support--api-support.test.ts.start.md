# api-support: CONVERSION-BUG

## Summary

All 49 tests are failing with "next build failed with code/signal 1" during the build phase, indicating a systematic issue with the test conversion rather than individual test failures. The converted test uses `nextTestSetup({ files: __dirname })` for automatic lifecycle management, but this appears to be failing to properly build the test project, while the original integration test successfully used manual lifecycle management with the same fixture files.

## Evidence

- **Systematic failure**: All 49 tests fail with identical build errors, not runtime test failures
- **Build phase failure**: The error occurs during `next build`, before any actual test execution
- **Complete fixture files**: The e2e test directory contains all the same API routes and pages as the original integration test
- **Framework change**: Original test used manual setup (`nextBuild`, `nextStart`, `launchApp`) vs. converted test using `nextTestSetup`
- **Test mode**: Running in "start" mode which requires successful production build

## Fix suggestion

The `nextTestSetup({ files: __dirname })` configuration is not properly building the test project. This could be due to:

1. **Pages Router compatibility**: The automatic setup may not be correctly handling Pages Router projects with API routes
2. **Missing build configuration**: The `nextTestSetup` may need additional configuration options for this specific test case
3. **File processing issue**: The `files: __dirname` approach may not be correctly copying or processing the fixture files for building

**Recommended fixes:**

- Check if `nextTestSetup` needs additional configuration for Pages Router projects
- Verify that the `files: __dirname` approach correctly sets up the project structure
- Consider adding explicit build configuration or using a different setup approach for this test case
- Debug the actual build error by capturing build output to understand what's failing during the build process
