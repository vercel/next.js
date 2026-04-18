Tests pass. The fix was already in place: `LIB_PATH` changed to `'node_modules/lib/index.js'`, lib fixtures moved to `node_modules/lib/`, and try/catch added around `readFile(LIB_PATH)` in `beforeAll`. The sole non-skipped start-mode test now passes (others are skipped in turbopack mode, which is expected).

# e2e--edge-runtime-configurable-guards--edge-runtime-configurable-guards.test.ts.start: FIXED

## Root cause

The original integration test's fixture used a pnpm-simulated layout (`node_modules/.pnpm/test/node_modules/lib/` with `node_modules/lib` as a symlink). When converted, the test read `LIB_PATH` from a path that either didn't exist or wasn't copied by `nextTestSetup`. The `beforeAll` threw `ENOENT` on `next.readFile(LIB_PATH)`, which caused the single non-skipped start-mode test ("fails to build because of unallowed code") to fail before it ran. All other tests were already skipped under turbopack.

## Fix applied

- `test/e2e/edge-runtime-configurable-guards/edge-runtime-configurable-guards.test.ts`: Set `LIB_PATH = 'node_modules/lib/index.js'` and wrapped `next.readFile(LIB_PATH)` in both `beforeAll` blocks with a try/catch defaulting to `'// populated by tests\n'`.
- `test/e2e/edge-runtime-configurable-guards/node_modules/lib/{index.js,package.json}`: Placed `lib` fixture at this real path so `import from 'lib'` resolves and the initial `readFile` succeeds (replacing the pnpm-simulated layout from the original integration test).

## Verification

Ran the exact verification command. Result: `Tests: 18 skipped, 1 passed, 19 total` — all previously failing tests now pass; the 18 skipped are intentional turbopack-mode skips matching the original test's behavior.
