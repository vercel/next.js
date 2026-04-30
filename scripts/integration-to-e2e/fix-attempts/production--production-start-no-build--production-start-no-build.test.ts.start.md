Test passes.

# production--production-start-no-build--production-start-no-build.test.ts.start: FIXED

## Root cause

`next.start({ skipBuild: true })` resolves as soon as the "Ready in X" log appears, but the "Could not find a production build" error is logged slightly later when `getRequestHandlers` → `setupFsCheck` fails and the child process exits with code 1. The converted test checked `next.cliOutput` after a fixed 1s sleep — which wasn't reliably long enough, and didn't handle `start()` rejecting on the subsequent child-process exit.

## Fix applied

- `test/production/production-start-no-build/production-start-no-build.test.ts`: swallowed the start() rejection (subprocess exits with code 1 after the error) and replaced the fixed `setTimeout` with `retry()` polling `next.cliOutput` for the expected error message.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/production/production-start-no-build/production-start-no-build.test.ts` → 1 passed, 0 failed.
