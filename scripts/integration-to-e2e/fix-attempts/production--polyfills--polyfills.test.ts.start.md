All 3 tests pass.

# production--polyfills--polyfills.test.ts.start: FIXED

## Root cause

The converted test relied on a `package.json` placed in the fixture directory to declare polyfill dependencies (`unfetch`, `isomorphic-unfetch`, `whatwg-fetch`). `nextTestSetup` does not install dependencies declared in a fixture-directory `package.json`; they must be passed via the `dependencies` option so they're included in the isolated install. As a result, Turbopack build failed with "Module not found" for the three polyfill packages imported in `pages/fetch.js`.

## Fix applied

- `test/production/polyfills/polyfills.test.ts`: pass `dependencies` (unfetch 4.2.0, isomorphic-unfetch 3.0.0, whatwg-fetch 3.0.0) to `nextTestSetup`.
- `test/production/polyfills/package.json`: deleted (no longer needed; nextTestSetup writes its own package.json).

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/production/polyfills/polyfills.test.ts` — all 3 tests pass (5.3s).
