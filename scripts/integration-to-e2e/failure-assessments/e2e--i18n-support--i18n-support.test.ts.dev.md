# i18n-support: CONVERSION-BUG

## Summary

The test conversion incorrectly merged development and production test modes into a single test suite, causing production-specific tests to run in development mode where build artifacts (like `routes-manifest.json` and `prerender-manifest.json`) don't exist. The original integration test properly separated these modes using conditional `describe.skip` blocks based on `TURBOPACK_BUILD` and `TURBOPACK_DEV` environment variables.

## Evidence

1. **Test output shows "Test mode: dev"** but failing tests are production-only:
   - `ENOENT: no such file or directory, open '/.next/routes-manifest.json'`
   - `ENOENT: no such file or directory, open '/.next/prerender-manifest.json'`

2. **Missing build context**: `ctx.buildPagesDir` is undefined in "should not output GSP pages that returned notFound" test, indicating production build setup wasn't executed.

3. **Original test structure difference**: The original used separate `describe` blocks for dev/prod modes:

   ```javascript
   // Original - separate test suites
   (process.env.TURBOPACK_BUILD ? describe.skip : describe)('development mode', ...)
   (process.env.TURBOPACK_DEV ? describe.skip : describe)('production mode', ...)
   ```

4. **Converted test structure**: Tries to handle both modes in single suite with `isNextDev` conditionals, but production tests still execute in dev mode.

## Fix suggestion

The converted test should maintain the original separation between development and production test modes:

1. **Restore separate describe blocks** for dev vs production modes using the original conditional structure
2. **Fix production build setup** to ensure `routes-manifest.json`, `prerender-manifest.json`, and `buildPagesDir` are properly configured
3. **Ensure production-only tests like "should add i18n config to routes-manifest"** only run in production mode
4. **Update guards** that check `if (!ctx.isDev)` to use the correct mode detection from the test suite context
