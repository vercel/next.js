# 500-page: CONVERSION-BUG

## Summary

The test conversion incorrectly merged two distinct testing scenarios into a single test file with incompatible server lifecycle requirements. The first describe block starts a persistent server instance, while the second describe block needs to manually control build/start lifecycle for testing build-time behavior. This causes "can not run export while server is running" errors when the second block tries to call `next.build()` while the first block's server is still active.

## Evidence

1. **Original integration tests** (`index.test.ts` and `gsp-gssp.test.ts`) each test completely manages its own app lifecycle with manual `nextBuild()`, `nextStart()`, and `killApp()` calls
2. **Converted test** uses two separate `nextTestSetup()` calls:
   - First one (line 5-7): no `skipStart` - automatically starts persistent server
   - Second one (line 108-111): `skipStart: true` - tries to call `next.build()` but fails
3. **Error pattern**: Multiple tests fail with `"can not run export while server is running, use next.stop() first"` at `NextStartInstance.build (lib/next-modes/next-start.ts:253:13)`
4. **Failed tests**: All tests in the "500 Page build validation" block that call `next.build()` (lines 191, 230, 248, 272, 299, 350, 380)

## Fix suggestion

Split the converted test into two separate test files or restructure to properly isolate server lifecycle:

1. **Option 1**: Split into separate files:
   - `500-page-runtime.test.ts` - Runtime behavior tests (current first describe block)
   - `500-page-build.test.ts` - Build validation tests (current second describe block with `skipStart: true`)

2. **Option 2**: Use single `nextTestSetup` with `skipStart: true` and manually manage lifecycle for both test groups, calling `next.start()` only for tests that need a running server

The key issue is that build validation tests need to call `next.build()` multiple times with different configurations, which requires complete control over the app lifecycle that's incompatible with a persistent server instance.
