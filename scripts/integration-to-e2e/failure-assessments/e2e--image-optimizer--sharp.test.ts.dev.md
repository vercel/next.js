# image-optimizer/sharp.test.ts: CONVERSION-BUG

## Summary

The test failure is caused by a configuration conflict in the converted e2e test. The test setup attempts to provide a Next.js configuration both via an inline `nextConfig` object to `nextTestSetup()` and via a physical `next.config.js` file in the fixture directory, which causes the test harness to throw an error: "nextConfig provided on 'createNext()' and as a file 'next.config.js', use one or the other to continue".

## Evidence

1. **Error Message**: The primary error is `nextConfig provided on "createNext()" and as a file "next.config.js", use one or the other to continue` from `lib/next-modes/base.ts:351:17`.

2. **Configuration Conflict**: The e2e test has both:
   - A `next.config.js` file at `test/e2e/image-optimizer/app/next.config.js` containing `module.exports = {}`
   - Inline config provided in `util.ts` at lines 1729-1734 via `nextConfig: { images: mergedImages, ... }`

3. **Different Approaches**: The original integration test used a different approach:
   - Integration test config file: `module.exports = { /* replaceme */ }` (with replaceme comment)
   - Integration test util: Uses a `File` class to dynamically modify the config file
   - E2E test config file: `module.exports = {}` (empty object)
   - E2E test util: Tries to provide config inline to `nextTestSetup()`

4. **Secondary Errors**: The "next instance is not initialized" errors are cascading effects of the primary configuration conflict preventing test setup.

## Fix suggestion

Remove the `next.config.js` file from `test/e2e/image-optimizer/app/` since the e2e test util is designed to provide configuration inline via the `nextConfig` parameter to `nextTestSetup()`. The e2e test framework doesn't need the dynamic file replacement approach used by the integration tests.
