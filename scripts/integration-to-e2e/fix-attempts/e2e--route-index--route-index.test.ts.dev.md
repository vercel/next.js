All 5 tests pass.

# e2e--route-index--route-index.test.ts.dev: FIXED

## Root cause

The converted test added `dependencies: { react: 'latest', 'react-dom': 'latest' }` to `nextTestSetup`. The original integration test had no `package.json` / installed React deps and relied on Next.js's bundled React. Installing user React alongside Next's bundled React produced two copies of React in the tree — Next's internal app wrapper (bundled React) and the user page resolution diverged — triggering `Cannot read properties of null (reading 'useInsertionEffect')`/`useContext` hook errors and 500 responses on every route.

## Fix applied

- `test/e2e/route-index/route-index.test.ts`: removed the `dependencies` block so the fixture runs against Next.js's bundled React, matching the original integration test's behavior.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/e2e/route-index/route-index.test.ts` → 5 passed, 0 failed.
