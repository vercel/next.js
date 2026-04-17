# 500-page: CONVERSION-BUG

## Summary

The test failure is caused by improper server lifecycle management in the converted test. The converted test uses two separate `nextTestSetup` instances in different describe blocks, but the dev server from the first block continues running when the second block tries to execute build commands, causing "can not run build while server is running" errors. The original integration tests carefully managed separate server instances for different modes with explicit lifecycle hooks, but the conversion didn't properly replicate this isolation.

## Evidence

1. **Multiple build failures with server conflict**: All tests in the "500 Page build validation" describe block fail with:

   ```
   can not run build while server is running, use next.stop() first
   ```

2. **Test structure mismatch**: The converted test has:
   - First describe block: `nextTestSetup({ files: __dirname })` (starts dev server by default)
   - Second describe block: `nextTestSetup({ files: __dirname, skipStart: true })` (should allow manual builds)

   But the dev server from the first block interferes with build operations in the second block.

3. **Original test had proper isolation**: The original integration tests used completely separate describe blocks with their own `beforeAll`/`afterAll` hooks to manage server lifecycle, ensuring no interference between dev and production test modes.

4. **Dev/build mode confusion**: Tests that should run in different modes are now conflicting, as evidenced by the error output showing build commands being attempted while a dev server is active.

## Fix suggestion

The conversion needs to properly isolate the two test suites to prevent server lifecycle interference. Options include:

1. **Split into separate test files**: Create `500-page-dev.test.ts` and `500-page-build.test.ts` with their own isolated `nextTestSetup` instances.

2. **Use proper lifecycle management**: Ensure the dev server from the first describe block is completely stopped before the second block runs, possibly by adding explicit cleanup between blocks.

3. **Restructure test setup**: Follow the original pattern more closely by having completely separate test environments for dev and build validation scenarios.
