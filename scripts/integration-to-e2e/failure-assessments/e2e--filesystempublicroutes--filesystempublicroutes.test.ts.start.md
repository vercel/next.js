# filesystempublicroutes: PRE-EXISTING

## Summary

The test failure is caused by missing SWC helper dependencies (`@swc/helpers/_/_interop_require_default`) in the Next.js runtime, leading to 500 errors instead of expected responses. This is a pre-existing framework issue unrelated to the test conversion - the converted test structure and fixtures are correct and match the original integration test.

## Evidence

Key evidence pointing to a framework issue:

1. **Missing SWC dependency**: `Error: Cannot find module '@swc/helpers/_/_interop_require_default'` - this is a Next.js runtime dependency issue
2. **Turbopack runtime failure**: The error occurs in `next/dist/compiled/next-server/pages-turbo.runtime.dev.js`, indicating a framework-level problem
3. **Build manifest issues**: `TypeError: Cannot read properties of undefined (reading 'static/development/_buildManifest.js')` suggests internal Next.js build state corruption
4. **Correct test conversion**: The converted test has identical logic to the original, all fixture files exist, and uses proper `nextTestSetup` patterns
5. **Widespread impact**: All HTTP requests return 500 errors instead of expected 404/200, indicating systemic failure

## Fix suggestion

This appears to be a pre-existing framework issue with SWC dependencies in the current Next.js build on this branch. The issue would likely affect the original integration test as well if run in the same environment. Potential framework-level fixes needed:

1. Ensure `@swc/helpers` dependencies are properly bundled/available in the Next.js runtime
2. Investigate Turbopack runtime module resolution for SWC helpers
3. Check if this is a build artifact issue that requires `pnpm build-all` or dependency reinstall
