# custom-routes-i18n: WARN

Conversion preserves all tests, assertions, and behavior; only concern is the original's dedup guards (`TURBOPACK_DEV`/`TURBOPACK_BUILD`) weren't carried over.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                 |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 4 unique titles, converted: 4                                                                              |
| 1b  | Assertions          | pass    | converted >= original (check→retry+expect adds expects)                                                              |
| 1c  | Test titles         | pass    | All 4 titles preserved verbatim                                                                                      |
| 1d  | Describe blocks     | pass    | Dev/prod describes flattened into single describe (nextTestSetup handles modes)                                      |
| 2a  | URL paths           | pass    | All fetched paths preserved                                                                                          |
| 2b  | Response checks     | pass    | status/headers/text/cheerio assertions match                                                                         |
| 2c  | FS checks           | na      |                                                                                                                      |
| 2d  | Browser checks      | pass    | webdriver→next.browser with same interactions                                                                        |
| 2e  | Build output        | na      |                                                                                                                      |
| 2f  | Dynamic logic       | pass    | runTests() inlined; both dev+prod covered via nextTestSetup                                                          |
| 3a  | nextTestSetup       | pass    |                                                                                                                      |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                   |
| 3c  | skipStart           | pass    | Uses `skipStart: true` so external server can start + next.config patched before next.start()                        |
| 3d  | No manual lifecycle | warn    | Uses `findPort` from next-test-utils (for external HTTP server, not Next); acceptable but kept                       |
| 3e  | Cleanup             | pass    | server.close() in afterAll                                                                                           |
| 4a  | Directory placement | pass    | test/e2e/ correct (runs in both dev & prod)                                                                          |
| 4b  | Mode guards         | pass    | `isNextDev` used to skip next.build in dev                                                                           |
| 4c  | Turbopack guards    | na      |                                                                                                                      |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards; converted test drops them — may cause redundant CI runs |
| 4e  | No incorrect env    | pass    |                                                                                                                      |
| 5a  | render              | na      |                                                                                                                      |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                                            |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                             |
| 5d  | check→retry         | pass    | All 4 check() converted to retry()+expect                                                                            |
| 5e  | File class          | pass    | `new File(...).replace` → `next.patchFile()`                                                                         |
| 5f  | waitFor             | na      |                                                                                                                      |
| 5g  | fs operations       | na      |                                                                                                                      |
| 6a  | Fixtures exist      | pass    | pages/links.js, next.config.js present                                                                               |
| 6b  | next.config.js      | pass    | Identical to original                                                                                                |
| 6c  | Overrides           | na      |                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                      |
| 7b  | retry over timeout  | pass    |                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                      |

## Issues

None.

## Warnings

- 4d: Original's `TURBOPACK_BUILD ? describe.skip` (dev) and `TURBOPACK_DEV ? describe.skip` (prod) dedup guards were not ported. Consider wrapping the describe with the equivalent guard to avoid redundant runs in Turbopack CI jobs.
- 3d: `findPort` from `next-test-utils` is still imported/used, but only for the external HTTP stub server — acceptable since it's not controlling Next lifecycle.
