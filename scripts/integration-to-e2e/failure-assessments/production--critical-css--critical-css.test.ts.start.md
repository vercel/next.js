# critical-css: PRE-EXISTING

## Summary

The test fails because the `critters` package is missing from the Next.js runtime bundle when the `experimental.optimizeCss` feature is enabled. This is a framework issue where Next.js expects the `critters` dependency to be available for CSS optimization but it's not properly bundled or installed in the isolated test environment.

## Evidence

The error message shows `Error: Cannot find module 'critters'` occurring in the Next.js runtime during the build process. The source code in `packages/next/src/server/post-process.ts:17` shows a dynamic `require('critters')` call when `optimizeCss` is enabled. The `packages/next/next-runtime.webpack-config.js:71` lists `critters` as an external dependency that should be available at runtime, but the module is not found during execution. The test conversion is correct - it maintains the same `{ experimental: { optimizeCss: true } }` configuration as the original integration test and the test logic is identical.

## Fix suggestion

This is a framework dependency packaging issue. The `critters` package needs to be properly bundled with Next.js or included in the test environment when the `optimizeCss` experimental feature is enabled. The original integration test would likely fail with the same error on this branch, indicating this is not related to the test conversion.
