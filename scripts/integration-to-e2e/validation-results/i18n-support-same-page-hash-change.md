# i18n-support-same-page-hash-change: PASS

Clean conversion: all 3 tests preserved, `check()` properly migrated to `retry()+expect()`, fixtures mirror original.

## Criteria

| #   | Criterion           | Verdict | Note                                                             |
| --- | ------------------- | ------- | ---------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                        |
| 1b  | Assertions          | pass    | original: 8 expects + 14 checks, converted: 20 expects via retry |
| 1c  | Test titles         | pass    | All 3 preserved verbatim                                         |
| 1d  | Describe blocks     | pass    | Dev/prod sub-describes flattened (handled by nextTestSetup)      |
| 2a  | URL paths           | pass    | /about#hash, /posts/a#hash all preserved                         |
| 2b  | Response checks     | pass    | All element text/eval checks preserved                           |
| 2c  | FS checks           | na      |                                                                  |
| 2d  | Browser checks      | pass    | webdriver → next.browser                                         |
| 2e  | Build output        | na      |                                                                  |
| 2f  | Dynamic logic       | na      | runTests() identical for dev/prod                                |
| 3a  | nextTestSetup       | pass    |                                                                  |
| 3b  | files param         | pass    | files: \_\_dirname                                               |
| 3c  | skipStart           | na      | Runtime test                                                     |
| 3d  | No manual lifecycle | pass    |                                                                  |
| 3e  | Cleanup             | pass    |                                                                  |
| 4a  | Directory placement | pass    | test/e2e/ matches dev+prod coverage                              |
| 4b  | Mode guards         | na      | Same tests for both modes                                        |
| 4c  | Turbopack guards    | na      |                                                                  |
| 4d  | Dedup guards        | na      | Handled by e2e-utils mode selection                              |
| 4e  | No incorrect env    | pass    |                                                                  |
| 5a  | render              | na      |                                                                  |
| 5b  | fetch               | na      |                                                                  |
| 5c  | browser             | pass    |                                                                  |
| 5d  | check→retry         | pass    | All check() calls converted correctly                            |
| 5e  | File class          | na      |                                                                  |
| 5f  | waitFor             | na      |                                                                  |
| 5g  | fs operations       | na      |                                                                  |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/about.js, pages/posts/[...slug].js         |
| 6b  | next.config.js      | pass    |                                                                  |
| 6c  | Overrides           | na      |                                                                  |
| 7a  | No dead code        | pass    |                                                                  |
| 7b  | retry over timeout  | pass    |                                                                  |
| 7c  | async/await         | pass    |                                                                  |
| 7d  | eslint              | pass    |                                                                  |

## Issues

None

## Warnings

None
