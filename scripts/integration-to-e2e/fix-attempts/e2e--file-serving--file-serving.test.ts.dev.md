All 891 tests pass.

# e2e--file-serving--file-serving.test.ts.dev: FIXED

## Root cause

`next.appPort` returns a string (from `URL.port`). When `safeFetch` passed it to `fetchViaHTTP(next.appPort, path, ...)`, `getFullUrl` at `test/lib/next-test-utils.ts:144` hit its string branch (`typeof appPortOrUrl === 'string' && url`) and invoked `new URL(url, fullUrl)` on the malformed path, throwing `TypeError: Invalid URL`. That branch was intended for full-URL first args (see the `startsWith('http')` check on line 140), not numeric-port strings.

## Fix applied

- `test/e2e/file-serving/file-serving.test.ts`: coerce `next.appPort` to a number via `Number(next.appPort)` when calling `fetchViaHTTP`, so `getFullUrl` takes the non-string branch and builds the URL via string concat without URL parsing.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/e2e/file-serving/file-serving.test.ts` → 891/891 passing, 0 failures.
