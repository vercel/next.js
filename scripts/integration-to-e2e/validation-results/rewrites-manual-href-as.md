# rewrites-manual-href-as: PASS

Clean conversion — both tests preserved with identical browser interactions, `check()` migrated to `retry()`, fixtures present, and `nextTestSetup` replaces manual dev/prod lifecycle.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                              |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 (x2 dev+prod via runTests), converted: 2 (nextTestSetup runs both modes)                              |
| 1b  | Assertions          | pass    | All expect() calls preserved 1:1                                                                                  |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                    |
| 1d  | Describe blocks     | pass    | Dev/prod describe blocks flattened into nextTestSetup                                                             |
| 2a  | URL paths           | pass    | `/` and `/preview/123` both used                                                                                  |
| 2b  | Response checks     | pass    | All browser assertions preserved                                                                                  |
| 2c  | FS checks           | na      | No fs ops                                                                                                         |
| 2d  | Browser checks      | pass    | webdriver → next.browser with identical selectors                                                                 |
| 2e  | Build output        | na      | No build-output checks                                                                                            |
| 2f  | Dynamic logic       | na      | runTests() had no dev/prod divergence                                                                             |
| 3a  | nextTestSetup       | pass    | Used with files: \_\_dirname                                                                                      |
| 3b  | files param         | pass    | \_\_dirname                                                                                                       |
| 3c  | skipStart           | na      | Runs server normally                                                                                              |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild                                                                                   |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                          |
| 4a  | Directory placement | pass    | test/e2e/ correct (runs both modes)                                                                               |
| 4b  | Mode guards         | na      | No mode-divergent logic                                                                                           |
| 4c  | Turbopack guards    | na      | Original was dedup, not skip                                                                                      |
| 4d  | Dedup guards        | warn    | Original TURBOPACK_BUILD/TURBOPACK_DEV dedup not preserved — test now runs in both Turbopack dev and build jobs   |
| 4e  | No incorrect env    | pass    |                                                                                                                   |
| 5a  | render              | na      |                                                                                                                   |
| 5b  | fetch               | na      |                                                                                                                   |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                          |
| 5d  | check→retry         | pass    | check() migrated to retry() + expect() at line 100                                                                |
| 5e  | File class          | na      |                                                                                                                   |
| 5f  | waitFor             | na      |                                                                                                                   |
| 5g  | fs operations       | na      |                                                                                                                   |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/index.js, pages/another.js, pages/preview/[slug].js, pages/news/[[...slugs]].js all present |
| 6b  | next.config.js      | pass    | Present                                                                                                           |
| 6c  | Overrides           | na      |                                                                                                                   |
| 7a  | No dead code        | pass    |                                                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                   |
| 7d  | eslint              | pass    |                                                                                                                   |

## Issues

None

## Warnings

- 4d: Original used `TURBOPACK_BUILD`/`TURBOPACK_DEV` env vars to dedup dev-mode tests from the build CI job (and vice versa). The converted file does not preserve this dedup, so the test will run in both Turbopack CI jobs. Consider adding `(isNextStart && !!process.env.TURBOPACK_DEV) || (isNextDev && !!process.env.TURBOPACK_BUILD)` guard if CI runtime is a concern.
