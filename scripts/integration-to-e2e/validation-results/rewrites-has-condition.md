# rewrites-has-condition: PASS

Clean 1:1 conversion of a small browser-based rewrites test suite with fixtures properly copied.

## Criteria

| #   | Criterion           | Verdict | Note                                                                         |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 (in runTests, called twice), converted: 2                        |
| 1b  | Assertions          | pass    | original: 6 expects in source, converted: 6                                  |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                               |
| 1d  | Describe blocks     | pass    | Dev/prod describe blocks flattened — nextTestSetup handles modes             |
| 2a  | URL paths           | pass    | `/` accessed via `next.browser`                                              |
| 2b  | Response checks     | pass    | All element text/query assertions preserved                                  |
| 2c  | FS checks           | na      |                                                                              |
| 2d  | Browser checks      | pass    | webdriver → next.browser with identical selectors/interactions               |
| 2e  | Build output        | na      |                                                                              |
| 2f  | Dynamic logic       | na      | runTests body inlined; no mode-specific branches                             |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                            |
| 3b  | files param         | pass    | files: \_\_dirname                                                           |
| 3c  | skipStart           | na      | Not a build-only test                                                        |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild/killApp                                      |
| 3e  | Cleanup             | pass    | nextTestSetup handles it                                                     |
| 4a  | Directory placement | pass    | test/e2e/ matches original (dev + prod)                                      |
| 4b  | Mode guards         | na      | Test logic identical across modes                                            |
| 4c  | Turbopack guards    | na      |                                                                              |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_BUILD/DEV dedup replaced by e2e framework's per-mode runs |
| 4e  | No incorrect env    | pass    |                                                                              |
| 5a  | render              | na      |                                                                              |
| 5b  | fetch               | na      |                                                                              |
| 5c  | browser             | pass    | webdriver → next.browser                                                     |
| 5d  | check→retry         | na      |                                                                              |
| 5e  | File class          | na      |                                                                              |
| 5f  | waitFor             | na      |                                                                              |
| 5g  | fs operations       | na      |                                                                              |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/index.js, pages/another.js present                     |
| 6b  | next.config.js      | pass    | Copied to fixture dir                                                        |
| 6c  | Overrides           | na      |                                                                              |
| 7a  | No dead code        | pass    |                                                                              |
| 7b  | retry over timeout  | pass    |                                                                              |
| 7c  | async/await         | pass    |                                                                              |
| 7d  | eslint              | pass    |                                                                              |

## Issues

None

## Warnings

None
