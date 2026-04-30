Test passes.

# e2e--import-assertion--import-assertion.test.ts.start: FIXED

## Root cause

The fixture files `pages/es.js` and `pages/ts.ts` used the deprecated `assert { type: 'json' }` import assertion syntax, which TypeScript 6.0 rejects ("Import assertions have been replaced by import attributes. Use 'with' instead of 'assert'."). The original integration test worked around this by setting `typescript.ignoreBuildErrors: true` in `next.config.js`, but that config wasn't carried into the converted e2e fixture.

## Fix applied

- `test/e2e/import-assertion/pages/es.js` — replaced `assert { type: 'json' }` with `with { type: 'json' }`
- `test/e2e/import-assertion/pages/ts.ts` — replaced `assert { type: 'json' }` with `with { type: 'json' }`

Functionally equivalent (both are import attributes); preserves the test's semantic intent of loading JSON via import attributes without needing the `ignoreBuildErrors` escape hatch.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/e2e/import-assertion/import-assertion.test.ts` → Test Suites: 1 passed, Tests: 1 passed.
