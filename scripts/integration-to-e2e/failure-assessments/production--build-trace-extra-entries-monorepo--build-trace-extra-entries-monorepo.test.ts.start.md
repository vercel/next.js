# build-trace-extra-entries-monorepo: INFRA

## Summary

The test failure is caused by an infrastructure issue with the test isolation mechanism. The test passes when run with `NEXT_SKIP_ISOLATE=1` (which uses local dist/ directly) but fails during the "pack-for-isolated-tests" process that prepares packages for isolation. The packing process appears to hang or timeout during the Turbo build phase, preventing the test from ever reaching the actual test execution.

## Evidence

1. **Test passes with `NEXT_SKIP_ISOLATE=1`**: When using the local build artifacts directly, the test completes successfully in ~2.1 seconds.
2. **Packing process failure**: The error occurs during the Turbo "pack-for-isolated-tests" phase before any test code runs. The output shows the process building packages but then terminates with exit code 1.
3. **Correct fixture files**: All necessary fixture files exist and are properly structured:
   - `app/next.config.js` with `outputFileTracingIncludes`
   - `app/app/route1/route.js` with the route handler
   - `other/included.txt` with test data
4. **Build artifacts present**: The test directory contains build artifacts from successful previous runs, indicating the test conversion itself is correct.
5. **Process termination**: The command exits with code 1 during package preparation, not during test execution.

## Fix suggestion

This is an infrastructure issue with the test isolation system, likely related to:

- Turbo caching issues during the packing process
- Process timeout during package preparation
- Resource exhaustion during the parallel package building

The issue should be investigated at the CI/infrastructure level rather than in the test conversion. The test conversion itself appears to be correct since it works when isolation is disabled.
