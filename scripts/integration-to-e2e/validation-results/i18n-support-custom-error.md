# i18n-support-custom-error: PASS

Clean 1:1 conversion — 4 tests preserved with identical assertions, fixtures copied verbatim, and added `retry()` wrappers around client-side routing assertions.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                        |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 4 (×2 describes), converted: 4                                                    |
| 1b  | Assertions          | pass    | original: 6, converted: 6                                                                   |
| 1c  | Test titles         | pass    | All 4 preserved verbatim                                                                    |
| 1d  | Describe blocks     | pass    | dev/prod describes collapsed — e2e runs in both modes                                       |
| 2a  | URL paths           | pass    | All localized paths preserved                                                               |
| 2b  | Response checks     | pass    | Same `#props` / `#error-props` JSON checks                                                  |
| 2c  | FS checks           | na      |                                                                                             |
| 2d  | Browser checks      | pass    | webdriver → next.browser, same selectors                                                    |
| 2e  | Build output        | na      |                                                                                             |
| 2f  | Dynamic logic       | pass    | runTests() inlined once; e2e runs dev+prod                                                  |
| 3a  | nextTestSetup       | pass    | uses nextTestSetup from 'e2e-utils'                                                         |
| 3b  | files param         | pass    | files: \_\_dirname                                                                          |
| 3c  | skipStart           | na      | Not build-only                                                                              |
| 3d  | No manual lifecycle | pass    | No launchApp/killApp/etc                                                                    |
| 3e  | Cleanup             | pass    | nextTestSetup handles it                                                                    |
| 4a  | Directory placement | pass    | test/e2e/ — ran in both dev and prod originally                                             |
| 4b  | Mode guards         | na      | No mode-specific behavior                                                                   |
| 4c  | Turbopack guards    | na      | Original skips were dedup, not turbopack-specific                                           |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_DEV/BUILD guards were standard dedup; e2e harness handles mode selection |
| 4e  | No incorrect env    | pass    |                                                                                             |
| 5a  | render              | na      |                                                                                             |
| 5b  | fetch               | na      |                                                                                             |
| 5c  | browser             | pass    | webdriver → next.browser                                                                    |
| 5d  | check→retry         | na      | No check() in original                                                                      |
| 5e  | File class          | na      |                                                                                             |
| 5f  | waitFor             | na      |                                                                                             |
| 5g  | fs operations       | na      |                                                                                             |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/[slug].js, pages/\_error.js, pages/index.js all present               |
| 6b  | next.config.js      | pass    | identical to original                                                                       |
| 6c  | Overrides           | na      |                                                                                             |
| 7a  | No dead code        | pass    |                                                                                             |
| 7b  | retry over timeout  | pass    | retry() added around post-push assertions                                                   |
| 7c  | async/await         | pass    |                                                                                             |
| 7d  | eslint              | pass    |                                                                                             |

## Issues

None

## Warnings

None
