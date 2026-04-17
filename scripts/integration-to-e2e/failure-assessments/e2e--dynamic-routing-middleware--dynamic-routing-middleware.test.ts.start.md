# dynamic-routing-middleware: PRE-EXISTING

## Summary

The failure is caused by a pre-existing framework behavior difference, not the test conversion. The e2e test framework automatically sets `NEXT_DEPLOYMENT_ID=test-dpl-id-1234` in the environment, which causes Next.js to include additional deployment-specific fields in the routes manifest (`deploymentId` and `onMatchHeaders` with deployment headers). The original integration test framework did not set this environment variable, so its snapshot expects these fields to be absent or empty.

## Evidence

1. **Snapshot mismatch shows extra fields**: The actual output includes `"deploymentId": "test-dpl-id-1234"` and populated `onMatchHeaders` with deployment ID headers, while the expected snapshot has `"onMatchHeaders": []`

2. **Environment variable difference**: Found in `test/lib/next-test-utils.ts` lines 541, 569, and `test/lib/next-modes/next-start.ts` line 22 that the e2e test framework automatically sets `NEXT_DEPLOYMENT_ID = 'test-dpl-id-1234'`

3. **Similar issues already documented**: There are existing failure assessments for the same root cause in `scripts/integration-to-e2e/failure-assessments/e2e--dynamic-routing--dynamic-routing.test.ts.start.md` and `e2e--dynamic-routing-middleware--dynamic-routing-middleware.test.ts.start.md`

4. **Original test logic is correctly ported**: The middleware setup in the converted test (`next.patchFile('middleware.js', ...)`) mirrors the original integration test's middleware setup, and the test execution path through `runTests({ next, isNextDev, isTurbopack, middlewareEnabled: true })` correctly handles the middleware-enabled case.

## Fix suggestion

This is a framework-level difference between test harnesses that affects multiple tests. The original integration test would also fail if run with the same environment variables. The snapshot needs to be updated to reflect the current Next.js behavior when `NEXT_DEPLOYMENT_ID` is set, or the test environment needs to be modified to not set this variable for tests that expect the old behavior.
