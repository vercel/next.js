# typescript: WARN

Conversion is largely faithful with all tests preserved, but one assertion was weakened and one test relocated across describe blocks.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                             |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 15 `it(` (1 skipped); converted: 16 `it(` (1 skipped) — tsconfig test added to features block                                          |
| 1b  | Assertions          | pass    | original: ~18, converted: ~19                                                                                                                    |
| 1c  | Test titles         | pass    | All preserved; "should build the app successfully" added in features block as lightweight equivalent                                             |
| 1d  | Describe blocks     | warn    | Original nested prod block inside `TypeScript Features`; converted has sibling top-level `TypeScript production compilation` describe            |
| 2a  | URL paths           | pass    | /hello, /ssr/cookies, /generics, /angle-bracket-type-assertions, /api/sync, /api/async all covered                                               |
| 2b  | Response checks     | warn    | Cookies-with-cookies test changed from `$('#cookies').text()).toBe('{"key":"value"}')` to `html.toContain('{"key":"value"}')` — weaker assertion |
| 2c  | FS checks           | pass    | Uses `next.readFile`/`next.patchFile`/`next.deleteFile` correctly                                                                                |
| 2d  | Browser checks      | na      | No webdriver usage                                                                                                                               |
| 2e  | Build output        | pass    | Uses `next.build()` and `cliOutput`/`exitCode` equivalently                                                                                      |
| 2f  | Dynamic logic       | pass    | `isNextDev` guard for hot-patch test; `isNextStart` for prod-specific checks                                                                     |
| 3a  | nextTestSetup       | pass    | Both describes use `nextTestSetup` from e2e-utils                                                                                                |
| 3b  | files param         | pass    | `files: __dirname` in both setups                                                                                                                |
| 3c  | skipStart           | pass    | Production compilation describe uses `skipStart: true` for manual `next.build()`                                                                 |
| 3d  | No manual lifecycle | pass    | No `findPort`/`launchApp`/`killApp`/`nextBuild` imports                                                                                          |
| 3e  | Cleanup             | pass    | try/finally restores patched files via `patchFile`/`deleteFile`                                                                                  |
| 4a  | Directory placement | pass    | test/e2e/ correct — tests run in both modes with guards                                                                                          |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` guards applied appropriately                                                                                           |
| 4c  | Turbopack guards    | pass    | `isTurbopack ? it.skip : it` replaces `IS_TURBOPACK_TEST` env check                                                                              |
| 4d  | Dedup guards        | pass    | `isNextStart ? describe : describe.skip` replaces `TURBOPACK_DEV` dedup                                                                          |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD checks                                                                                                          |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`/`next.render$`                                                                                                   |
| 5b  | fetch               | pass    | cookie request properly converted to `next.fetch()` with headers                                                                                 |
| 5c  | browser             | na      |                                                                                                                                                  |
| 5d  | check→retry         | na      | No check() in original                                                                                                                           |
| 5e  | File class          | pass    | `new File()` + `write`/`replace`/`restore` → `readFile` + `patchFile`                                                                            |
| 5f  | waitFor             | na      |                                                                                                                                                  |
| 5g  | fs operations       | pass    | All fs-extra operations replaced with `next.*` helpers                                                                                           |
| 6a  | Fixtures exist      | pass    | pages/, components/, tsconfig.json, next.config.js all present                                                                                   |
| 6b  | next.config.js      | pass    | Present at test/e2e/typescript/next.config.js                                                                                                    |
| 6c  | Overrides           | na      |                                                                                                                                                  |
| 7a  | No dead code        | pass    | Skipped test preserved intentionally with comment                                                                                                |
| 7b  | retry over timeout  | na      | No polling needed                                                                                                                                |
| 7c  | async/await         | pass    | All awaited properly                                                                                                                             |
| 7d  | eslint              | pass    | Includes eslint-disable for standalone-expect                                                                                                    |

## Issues

None.

## Warnings

- Cookies-with-cookies assertion weakened: original used cheerio to extract `#cookies` text and `toBe` exact match; converted uses `.toContain` on raw HTML. Functionally validates rendering but allows false positives if the string appears anywhere in HTML.
- Describe structure flattened: original nested `production mode` under `TypeScript Features`; converted has two sibling top-level describes. Title "should not inform when using default tsconfig path" moved from prod-build block into features block (using `cliOutput` from auto-start) — equivalent coverage but different semantics (doesn't rebuild explicitly).
