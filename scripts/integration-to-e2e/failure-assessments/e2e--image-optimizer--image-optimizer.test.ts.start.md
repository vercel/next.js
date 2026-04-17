# image-optimizer: CONVERSION-BUG

## Summary

The test failure is caused by a conversion error where both a `next.config.js` file exists in the fixture directory AND programmatic `nextConfig` objects are provided in `nextTestSetup()` calls. The test framework detects this conflict and throws: "nextConfig provided on "createNext()" and as a file "next.config.js", use one or the other to continue".

## Evidence

1. **Fixture file conflict**: The fixture directory `test/e2e/image-optimizer/app/` contains a `next.config.js` file with `module.exports = {}`

2. **Programmatic config conflict**: Multiple test blocks provide `nextConfig` objects in `nextTestSetup()`:
   - Line 266: `nextConfig: { trailingSlash: true }`
   - Line 281: `nextConfig: { async headers() { ... } }`
   - Line 423: `nextConfig: { async rewrites() { ... } }`

3. **Original integration test structure**: The original integration tests used file patching with `File` class to dynamically replace a `{ /* replaceme */ }` placeholder in `next.config.js`, rather than providing both file and programmatic configs.

4. **Error pattern**: All 4 failing tests have the exact same error at the same location (`lib/next-modes/base.ts:351`), indicating a systematic conversion issue rather than a framework bug.

## Fix suggestion

Remove the `next.config.js` file from the fixture directory (`test/e2e/image-optimizer/app/next.config.js`) since the converted tests are using programmatic `nextConfig` objects in `nextTestSetup()` calls. Alternatively, remove the programmatic `nextConfig` objects and implement file patching similar to the original integration tests, but the first approach is simpler and follows the e2e test pattern.
