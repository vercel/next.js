Both tests pass. The conversion bug fix (using `getClientBuildManifestLoaderChunkUrlPath` instead of naive string match) was already applied in the test file.

# production--middleware-prefetch--middleware-prefetch.test.ts.start: FIXED

## Root cause

The converted test originally used a naive `src.includes('/ssg-page')` string check to detect the prefetched script, but prefetched scripts are loaded as hashed chunk filenames (e.g. `pages/ssg-page-abc123.js`) referenced from the client build manifest. The literal `/ssg-page` substring never appeared in the script `src` attributes, so the assertion always failed.

## Fix applied

- `test/production/middleware-prefetch/middleware-prefetch.test.ts`: already imports `getClientBuildManifestLoaderChunkUrlPath` and uses it to look up the real chunk URL for `/ssg-page`, matching the original integration test's logic.

## Verification

Ran `NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/production/middleware-prefetch/middleware-prefetch.test.ts` — both tests pass (2 passed, 0 failed, 5.5s).
