All 891 tests pass.

# e2e--file-serving--file-serving.test.ts.start: FIXED

## Root cause

`safeFetch` passed `next.appPort` directly to `fetchViaHTTP`. `next.appPort` returns `this._parsedUrl.port`, which is a **string** (URL ports are strings). In `getFullUrl` (test/lib/next-test-utils.ts:144), the branch `typeof appPortOrUrl === 'string' && url` then ran `new URL(url, fullUrl)` on the deliberately malformed traversal paths, throwing `Invalid URL` before the request could reach the server.

## Fix applied

- `test/e2e/file-serving/file-serving.test.ts`: coerced `next.appPort` to a number (`Number(next.appPort)`) when calling `fetchViaHTTP`, so `getFullUrl` takes the numeric-port branch and skips URL parsing, preserving the original integration test semantics.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/e2e/file-serving/file-serving.test.ts` → 891 passed, 0 failed.
