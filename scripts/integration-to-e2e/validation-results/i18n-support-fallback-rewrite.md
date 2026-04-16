# i18n-support-fallback-rewrite: PASS

Clean conversion preserving both tests, with `waitFor(1000)` properly replaced by `retry()` and `webdriver` migrated to `next.browser()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                          |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                     |
| 1b  | Assertions          | pass    | original: 4 expects, converted: 4 expects                                                     |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                |
| 1d  | Describe blocks     | pass    | dev/prod wrappers flattened; nextTestSetup handles modes                                      |
| 2a  | URL paths           | pass    | All 12 path/query combos preserved                                                            |
| 2b  | Response checks     | pass    | Same `#router` JSON assertions                                                                |
| 2c  | FS checks           | na      |                                                                                               |
| 2d  | Browser checks      | pass    | webdriver → next.browser with same selectors                                                  |
| 2e  | Build output        | na      |                                                                                               |
| 2f  | Dynamic logic       | na      | runTests() inlined; same behavior both modes                                                  |
| 3a  | nextTestSetup       | pass    | Used with files: \_\_dirname                                                                  |
| 3b  | files param         | pass    | files: \_\_dirname                                                                            |
| 3c  | skipStart           | na      | Not a build-only test                                                                         |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp                                                                 |
| 3e  | Cleanup             | pass    | nextTestSetup handles it; File.restore() no longer needed                                     |
| 4a  | Directory placement | pass    | test/e2e/ correct (ran in dev+prod)                                                           |
| 4b  | Mode guards         | na      | Tests identical in both modes                                                                 |
| 4c  | Turbopack guards    | na      | No Turbopack-only skip                                                                        |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_DEV/BUILD guards were mode-dedup, implicitly handled by e2e NEXT_TEST_MODE |
| 4e  | No incorrect env    | pass    |                                                                                               |
| 5a  | render              | na      |                                                                                               |
| 5b  | fetch               | na      |                                                                                               |
| 5c  | browser             | pass    | webdriver → next.browser                                                                      |
| 5d  | check→retry         | na      | No check() in original                                                                        |
| 5e  | File class          | pass    | nextConfig File removed; no longer needed                                                     |
| 5f  | waitFor             | pass    | waitFor(1000) replaced with retry()                                                           |
| 5g  | fs operations       | pass    | fs.remove no longer needed                                                                    |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/another.js, pages/dynamic/[slug].js, next.config.js all present         |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                        |
| 6c  | Overrides           | na      |                                                                                               |
| 7a  | No dead code        | pass    |                                                                                               |
| 7b  | retry over timeout  | pass    |                                                                                               |
| 7c  | async/await         | pass    |                                                                                               |
| 7d  | eslint              | pass    |                                                                                               |

## Issues

None

## Warnings

None
