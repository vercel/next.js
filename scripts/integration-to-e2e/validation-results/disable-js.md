# disable-js: PASS

Clean conversion — all dev and prod test paths preserved via `isNextDev`/`isNextStart` guards, fixtures copied, and appropriate API migration.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                            |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 7 `it(` (4 prod + 3 dev); converted: 5 `it(` with 2 mode-gated → effective 4 prod / 3 dev                             |
| 1b  | Assertions          | pass    | original: 7 `expect`; converted: 6 `expect` but **NEXT_DATA** has 2 mode-branches → equivalent coverage                         |
| 1c  | Test titles         | pass    | All 5 unique titles preserved                                                                                                   |
| 1d  | Describe blocks     | pass    | Two mode describes flattened into single describe with `isNextDev`/`isNextStart` guards                                         |
| 2a  | URL paths           | pass    | `/` preserved via `next.render('/')`                                                                                            |
| 2b  | Response checks     | pass    | cheerio selectors and expected counts preserved                                                                                 |
| 2c  | FS checks           | na      | —                                                                                                                               |
| 2d  | Browser checks      | na      | —                                                                                                                               |
| 2e  | Build output        | na      | —                                                                                                                               |
| 2f  | Dynamic logic       | pass    | Mode-specific expectations gated by `isNextDev`/`isNextStart`                                                                   |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                              |
| 3c  | skipStart           | na      | Not build-only                                                                                                                  |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild/nextStart                                                                                       |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                        |
| 4a  | Directory placement | pass    | `test/e2e/` — runs both dev and prod, matches original coverage                                                                 |
| 4b  | Mode guards         | pass    | `isNextDev` / `isNextStart` used correctly                                                                                      |
| 4c  | Turbopack guards    | na      | Original had only dedup guards, not Turbopack skip                                                                              |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV`/`TURBOPACK_BUILD` served as mode-separation; converted relies on test runner mode, equivalent behavior |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD references                                                                                     |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                 |
| 5b  | fetch               | na      | —                                                                                                                               |
| 5c  | browser             | na      | —                                                                                                                               |
| 5d  | check→retry         | na      | —                                                                                                                               |
| 5e  | File class          | na      | —                                                                                                                               |
| 5f  | waitFor             | na      | —                                                                                                                               |
| 5g  | fs operations       | na      | —                                                                                                                               |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `next.config.js` present                                                                                      |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                                          |
| 6c  | Overrides           | na      | —                                                                                                                               |
| 7a  | No dead code        | pass    | Clean imports                                                                                                                   |
| 7b  | retry over timeout  | pass    | No timeouts used                                                                                                                |
| 7c  | async/await         | pass    | All awaited                                                                                                                     |
| 7d  | eslint              | pass    | Duplicate titles eliminated by describe flattening                                                                              |

## Issues

None

## Warnings

None
