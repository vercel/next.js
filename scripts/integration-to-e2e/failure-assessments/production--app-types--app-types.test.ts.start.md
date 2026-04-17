# app-types: CONVERSION-BUG

## Summary

The test failure is caused by a conversion bug where the `nextTestSetup` function's `dependencies: { '@next/mdx': 'latest' }` parameter is not properly making the `@next/mdx` package available during the build process. The `next.config.js` file imports `@next/mdx` but the package cannot be found, causing the build to fail before TypeScript type checking occurs. This cascades into multiple test failures because no type files are generated and the `errors` variable remains undefined.

## Evidence

1. **Build failure**: The error output shows `"Cannot find package '@next/mdx' imported from /private/var/folders/.../next.config.js"`
2. **Missing dependency setup**: The converted test uses `dependencies: { '@next/mdx': 'latest' }` in `nextTestSetup` (line 7), but this mechanism is failing
3. **Original test difference**: The original integration test doesn't specify dependencies and works with `nextBuild(appDir, [], { stderr: true })`
4. **Cascade of failures**:
   - Build fails → no `.next/types/link.d.ts` generated → ENOENT error when reading file
   - Build fails → no TypeScript errors captured → `errors` is undefined → TypeError on `.matchAll()` calls

## Fix suggestion

The `nextTestSetup` dependency installation mechanism needs to be fixed to properly make `@next/mdx` available during the build process, or the test should be converted to use a different approach that matches how the original integration test handles dependencies. The package needs to be available in the test environment's node_modules before the build runs.
