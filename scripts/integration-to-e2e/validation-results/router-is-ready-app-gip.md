# router-is-ready-app-gip: PASS

Clean conversion with fixtures preserved, proper use of `nextTestSetup`, and `check()` correctly replaced with `retry()` + `expect()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                   |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 4, converted: 4                                                                                                              |
| 1b  | Assertions          | pass    | original: 4 (via check), converted: 4 (via expect)                                                                                     |
| 1c  | Test titles         | pass    | All 4 titles preserved verbatim                                                                                                        |
| 1d  | Describe blocks     | pass    | Outer describe preserved; dev/prod inner describes collapsed since nextTestSetup handles modes                                         |
| 2a  | URL paths           | pass    | /appGip, /appGip?hello=world, /gsp, /gsp?hello=world all preserved                                                                     |
| 2b  | Response checks     | pass    | window.isReadyValues eval preserved                                                                                                    |
| 2c  | FS checks           | na      |                                                                                                                                        |
| 2d  | Browser checks      | pass    | webdriver → next.browser()                                                                                                             |
| 2e  | Build output        | na      |                                                                                                                                        |
| 2f  | Dynamic logic       | na      | runTests() was identical for both modes                                                                                                |
| 3a  | nextTestSetup       | pass    |                                                                                                                                        |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                     |
| 3c  | skipStart           | na      | Test needs server running                                                                                                              |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild                                                                                                        |
| 3e  | Cleanup             | pass    | No custom cleanup needed; invalid.js never modified in tests                                                                           |
| 4a  | Directory placement | pass    | test/e2e/ correct (runs in both dev and prod)                                                                                          |
| 4b  | Mode guards         | na      | Tests run identically in both modes                                                                                                    |
| 4c  | Turbopack guards    | na      | No turbopack-specific skip needed                                                                                                      |
| 4d  | Dedup guards        | na      | Original TURBOPACK_BUILD/TURBOPACK_DEV guards were to split dev/prod into separate describes; nextTestSetup dispatches per-mode via CI |
| 4e  | No incorrect env    | pass    |                                                                                                                                        |
| 5a  | render              | na      |                                                                                                                                        |
| 5b  | fetch               | na      |                                                                                                                                        |
| 5c  | browser             | pass    | webdriver → next.browser()                                                                                                             |
| 5d  | check→retry         | pass    | Correctly replaced with retry() + expect()                                                                                             |
| 5e  | File class          | pass    | `new File(invalid.js)` + `restore()` removed (was unused in tests)                                                                     |
| 5f  | waitFor             | na      |                                                                                                                                        |
| 5g  | fs operations       | na      |                                                                                                                                        |
| 6a  | Fixtures exist      | pass    | pages/\_app.js, appGip.js, gsp.js, invalid.js present                                                                                  |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                                                         |
| 6c  | Overrides           | na      |                                                                                                                                        |
| 7a  | No dead code        | pass    |                                                                                                                                        |
| 7b  | retry over timeout  | pass    |                                                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                                                        |

## Issues

None

## Warnings

None
