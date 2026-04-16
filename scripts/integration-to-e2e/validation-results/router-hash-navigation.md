# router-hash-navigation: PASS

Clean 1:1 conversion of a single webdriver test with equivalent assertions and fixtures.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                                                             |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                                                                             |
| 1c  | Test titles         | pass    | Title preserved verbatim                                                                                                                              |
| 1d  | Describe blocks     | pass    | Dev/prod describes appropriately flattened (nextTestSetup handles modes)                                                                              |
| 2a  | URL paths           | pass    | `/#section` preserved                                                                                                                                 |
| 2b  | Response checks     | pass    | scrollY assertions preserved                                                                                                                          |
| 2c  | FS checks           | na      |                                                                                                                                                       |
| 2d  | Browser checks      | pass    | webdriver → next.browser with same selectors                                                                                                          |
| 2e  | Build output        | na      |                                                                                                                                                       |
| 2f  | Dynamic logic       | na      | runTests() helper had identical body for both modes                                                                                                   |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                       |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                    |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                        |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp                                                                                                                         |
| 3e  | Cleanup             | pass    | browser.close() retained                                                                                                                              |
| 4a  | Directory placement | pass    | test/e2e/ correct; original ran both dev and prod                                                                                                     |
| 4b  | Mode guards         | pass    | No mode-specific logic needed                                                                                                                         |
| 4c  | Turbopack guards    | na      |                                                                                                                                                       |
| 4d  | Dedup guards        | na      | Original TURBOPACK_DEV/BUILD guards were CI-dedup for dev vs prod describe blocks; flattening to single describe under nextTestSetup removes the need |
| 4e  | No incorrect env    | pass    |                                                                                                                                                       |
| 5a  | render              | na      |                                                                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                                                       |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                                                              |
| 5d  | check→retry         | na      |                                                                                                                                                       |
| 5e  | File class          | na      |                                                                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                                                       |
| 5g  | fs operations       | na      |                                                                                                                                                       |
| 6a  | Fixtures exist      | pass    | pages/index.js present                                                                                                                                |
| 6b  | next.config.js      | na      | None in original                                                                                                                                      |
| 6c  | Overrides           | na      |                                                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                                                       |

## Issues

None

## Warnings

None
