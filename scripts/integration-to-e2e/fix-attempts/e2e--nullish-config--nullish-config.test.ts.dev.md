Both tests pass.

# e2e--nullish-config--nullish-config.test.ts.dev: FIXED

## Root cause

The converted test used `fs.writeFile` to rewrite `next.config.js`, which triggers the dev server's automatic restart, but nothing waited for the restart to finish. The test then called `next.render('/')` while the server was mid-restart, causing an SSR render against an inconsistent module state (duplicate React instance) and returning a 500 with `Cannot read properties of null (reading 'useInsertionEffect')`.

## Fix applied

- `test/e2e/nullish-config/nullish-config.test.ts`: switched from `fs.writeFile(join(next.testDir, ...))` to `next.patchFile('next.config.js', ...)`. The dev-mode `patchFile` has built-in next.config restart detection (`detectServerRestart`) and returns only after the server is ready, so the subsequent `next.render` hits a stable server.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/e2e/nullish-config/nullish-config.test.ts` → 2 passed, 0 failed (3.8s).
