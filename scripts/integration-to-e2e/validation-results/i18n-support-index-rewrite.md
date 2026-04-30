# i18n-support-index-rewrite: PASS

Clean conversion — both tests preserved, fixtures migrated, proper API swaps (renderViaHTTP→next.render, webdriver→next.browser, check→retry).

## Criteria

| #   | Criterion           | Verdict | Note                                                                                     |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                |
| 1c  | Test titles         | pass    | Both preserved verbatim                                                                  |
| 1d  | Describe blocks     | pass    | Dev/prod describes flattened; nextTestSetup handles both modes                           |
| 2a  | URL paths           | pass    | All locale paths preserved                                                               |
| 2b  | Response checks     | pass    | JSON props assertions preserved                                                          |
| 2c  | FS checks           | na      |                                                                                          |
| 2d  | Browser checks      | pass    | webdriver→next.browser with same eval/selectors                                          |
| 2e  | Build output        | na      |                                                                                          |
| 2f  | Dynamic logic       | pass    | runTests() inlined; same tests run in both modes via e2e                                 |
| 3a  | nextTestSetup       | pass    |                                                                                          |
| 3b  | files param         | pass    | files: \_\_dirname                                                                       |
| 3c  | skipStart           | na      | Not build-only                                                                           |
| 3d  | No manual lifecycle | pass    | No launchApp/killApp/nextBuild/nextStart                                                 |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                 |
| 4a  | Directory placement | pass    | test/e2e/ (ran in both dev and prod originally)                                          |
| 4b  | Mode guards         | pass    | No mode-specific branches needed                                                         |
| 4c  | Turbopack guards    | pass    | Original TURBOPACK_BUILD/DEV guards were dedup guards (see 4d) — e2e-utils handles dedup |
| 4d  | Dedup guards        | pass    | e2e-utils automatically handles dev/prod dedup across Turbopack modes                    |
| 4e  | No incorrect env    | pass    |                                                                                          |
| 5a  | render              | pass    | renderViaHTTP→next.render                                                                |
| 5b  | fetch               | na      |                                                                                          |
| 5c  | browser             | pass    | webdriver→next.browser                                                                   |
| 5d  | check→retry         | pass    | check() replaced with retry() + assert                                                   |
| 5e  | File class          | na      |                                                                                          |
| 5f  | waitFor             | na      |                                                                                          |
| 5g  | fs operations       | na      |                                                                                          |
| 6a  | Fixtures exist      | pass    | next.config.js and pages/[...slug].js present                                            |
| 6b  | next.config.js      | pass    | Migrated                                                                                 |
| 6c  | Overrides           | na      |                                                                                          |
| 7a  | No dead code        | pass    |                                                                                          |
| 7b  | retry over timeout  | pass    |                                                                                          |
| 7c  | async/await         | pass    |                                                                                          |
| 7d  | eslint              | pass    |                                                                                          |

## Issues

None

## Warnings

None
