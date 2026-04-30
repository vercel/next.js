All 7 previously-failing dev tests now pass.

# e2e--edge-runtime-configurable-guards--edge-runtime-configurable-guards.test.ts.dev: FIXED

## Root cause

HMR timing. The converted test uses a single shared dev server across tests (unlike the original which launched a fresh app per test). After `patchFile` updates middleware/api/lib, Turbopack needs to recompile before the next request sees the new code. The tests were fetching immediately after patching and the response was served by the previously-compiled module, so the expected `eval`-warning never appeared (and in one case the in-flight HMR returned 500).

## Fix applied

- `test/e2e/edge-runtime-configurable-guards/edge-runtime-configurable-guards.test.ts`: Moved `next.fetch(url)` + `status === 200` assertions inside the `retry(...)` blocks for all four affected dev-mode test groups so they re-fetch until the patched middleware/api is compiled. For the "Function as a type" case (which uses `not.toContain`), wrapped only the fetch in `retry` so we wait for a 200 before verifying no warning was logged.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/e2e/edge-runtime-configurable-guards/edge-runtime-configurable-guards.test.ts` → 7 passed, 12 skipped (start-mode), 0 failed.
