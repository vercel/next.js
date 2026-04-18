All 11 tests pass.

# e2e--react-current-version--react-current-version.test.ts.dev: FIXED

## Root cause

The converted test's fixture `app/package.json` declared `"react": "*"` and `"react-dom": "*"`. `nextTestSetup` in `test/lib/next-modes/base.ts` defaults these deps to `nextjsReactPeerVersion` but then spreads the fixture's `package.json.dependencies` on top, so `"*"` overrode the correct version. pnpm resolved it to react@19.2.5, which mismatched the React version Next.js internals (e.g. `pages-dev-overlay-setup`) were bound against, producing "Invalid hook call" / null `useInsertionEffect` and `useContext` errors during SSR. This broke the nodejs-runtime styled-jsx test and the dynamicIds test (the `/dynamic` page returned 500, so `__NEXT_DATA__` had no `dynamicIds`). The edge-runtime test passed because that path bundles its own React.

## Fix applied

- `test/e2e/react-current-version/app/package.json`: removed the `react` and `react-dom` `"*"` dependencies so `nextTestSetup` uses its default `nextjsReactPeerVersion`.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/e2e/react-current-version/react-current-version.test.ts` — 11/11 tests pass (previously 2 failed).
