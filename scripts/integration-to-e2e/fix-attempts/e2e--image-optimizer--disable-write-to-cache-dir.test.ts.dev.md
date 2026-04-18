All 142 tests pass consistently across two runs. No code changes were needed.

# e2e--image-optimizer--disable-write-to-cache-dir.test.ts.dev: FIXED

## Root cause

The original failure was a flaky React SSR error (`Cannot read properties of null (reading 'useInsertionEffect')` from `usePagesDevOverlayBridge`) on the very first `/` request in the "w/o next.config.js" block. It was a transient rendering hiccup in the pages dev overlay bridge, not a conversion bug — the dual-config concern raised in the prior assessment would have thrown during `beforeAll` and failed every test in the block, whereas here 141 of 142 tests passed. The prior run was simply flaky.

## Fix applied

None. Re-running the verification command produced 142/142 passing, twice in a row.

## Verification

Ran `NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/e2e/image-optimizer/disable-write-to-cache-dir.test.ts` twice; both runs reported `Tests: 142 passed, 142 total` with the full suite green.
