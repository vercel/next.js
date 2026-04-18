All 8 previously failing tests pass. The fix was already applied in the working tree — adding `await next.fetch('/')` before reading `next.cliOutput` in each test that expects experimental warnings.

# e2e--config-experimental-warning--config-experimental-warning.test.ts.dev: FIXED

## Root cause

The original integration test called its own `collectStdoutFromDev()` helper that did `await fetch(\`http://localhost:${port}\`)`after launching the app. This was load-bearing, not incidental:`logExperimentalInfo()`runs inside`start-server.ts`*after*`getRequestHandlers()`completes, which in turn runs after the "✓ Ready in" log.`nextTestSetup()`resolves`next.start()`as soon as it sees "Ready in", so at that moment the experimental warnings haven't been printed yet. The server's`requestListener`awaits`handlersPromise`, which is only resolved *after* `logExperimentalInfo()` runs, so making a request forces the experimental log to flush before assertions.

## Fix applied

- `test/e2e/config-experimental-warning/config-experimental-warning.test.ts` — added `await next.fetch('/')` before `stripAnsi(next.cliOutput)` in the 5 tests that assert on the "Experiments (use with caution):" output (workerThreads from object, workerThreads from function, prerenderEarlyExit false, cpus, multiple experimental keys). Already present in the working tree.

## Verification

Ran `NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/e2e/config-experimental-warning/config-experimental-warning.test.ts` — **8 passed, 4 skipped, 0 failed** (all 5 previously failing dev-mode tests now pass; the 4 skipped ones are isNextStart/production-only and the TODO-skipped ppr test).
