All 29 tests pass, 4 skipped (mode-specific skips).

# e2e--image-optimizer--image-optimizer.test.ts.start: FIXED

## Root cause

The "External rewrite support" test used `nextTestSetup` with the default config, then patched `next.config.js` in `beforeAll` to add a `rewrites()` function. In `start` mode, rewrites are baked into `routes-manifest.json` at build time, so patching the config after the build/start has already happened has no effect. When the test then fetched `/_next/image?url=/next-js/next-js-bg.png`, no rewrite was in effect and the image optimizer couldn't resolve the local URL, returning 400. (The original integration test explicitly rebuilt and restarted after replacing the config; the converted test omitted that step.)

## Fix applied

- `test/e2e/image-optimizer/image-optimizer.test.ts`: moved the `rewrites()` function into the `nextConfig` option of `nextTestSetup` for the "External rewrite support" describe block, and removed the now-unnecessary `beforeAll`/`afterAll` `patchFile` calls. This ensures the rewrite is present during the build that `nextTestSetup` performs. Matches the existing `trailingSlash` test pattern in the same file and the original integration test's build-time semantics.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/e2e/image-optimizer/image-optimizer.test.ts` → Tests: 4 skipped, 29 passed, 33 total (0 failed). Previously failing test "should return response when image is served from an external rewrite" now passes in 185 ms.
