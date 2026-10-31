# Local Reproduction Guide

## Match CI Job Mode

- Dev-mode failures: use `pnpm test-dev-turbo` or `pnpm test-dev-webpack` based on job mode.
- Start-mode failures: use `pnpm test-start-turbo` or `pnpm test-start-webpack`.

## Match CI Environment Variables

Read the "Job Environment Variables" section in `index.md` and mirror them locally. Key variables:

- `IS_WEBPACK_TEST=1` — forces webpack mode (turbopack is default locally).
- `NEXT_SKIP_ISOLATE=1` — skips package isolation; **never use** when verifying module resolution or build-time compilation fixes.
- Feature flags like `__NEXT_USE_NODE_STREAMS=true`, `__NEXT_CACHE_COMPONENTS=true` change DefinePlugin replacements.

Example: a failure in "test node streams prod" needs:

```bash
IS_WEBPACK_TEST=1 __NEXT_USE_NODE_STREAMS=true __NEXT_CACHE_COMPONENTS=true NEXT_TEST_MODE=start
```

## Isolation Rule

When validating module-resolution, entrypoint-export, or internal require-path fixes, rerun without `NEXT_SKIP_ISOLATE=1`.

## One-Run Log Analysis

Capture once, analyze multiple times:

```bash
HEADLESS=true pnpm test-dev-turbo test/path/to/test.ts > /tmp/test-output.log 2>&1
grep "●" /tmp/test-output.log
grep -A5 "Error:" /tmp/test-output.log
tail -5 /tmp/test-output.log
```
