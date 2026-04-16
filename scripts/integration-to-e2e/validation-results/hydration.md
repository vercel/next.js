# hydration: PASS

Clean conversion of a simple hydration test with all 3 tests preserved and fixtures present.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                   |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 3 `it` (ran in 2 describes), converted: 3 `it` (nextTestSetup handles dev/prod)                                                              |
| 1b  | Assertions          | pass    | original: 5 expects, converted: 5 expects                                                                                                              |
| 1c  | Test titles         | pass    | All 3 titles preserved verbatim                                                                                                                        |
| 1d  | Describe blocks     | pass    | Single Hydration describe; dev/prod nesting handled by nextTestSetup                                                                                   |
| 2a  | URL paths           | pass    | `/`, `//`, `/details` all covered                                                                                                                      |
| 2b  | Response checks     | pass    | Browser evals preserved                                                                                                                                |
| 2c  | FS checks           | na      |                                                                                                                                                        |
| 2d  | Browser checks      | pass    | webdriver → next.browser, evals match                                                                                                                  |
| 2e  | Build output        | na      |                                                                                                                                                        |
| 2f  | Dynamic logic       | pass    | runTests inlined; same assertions run in both modes via e2e harness                                                                                    |
| 3a  | nextTestSetup       | pass    | Used correctly                                                                                                                                         |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                     |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                         |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp usage                                                                                                                    |
| 3e  | Cleanup             | pass    | Harness-managed                                                                                                                                        |
| 4a  | Directory placement | pass    | test/e2e/ appropriate (ran in both dev and prod originally)                                                                                            |
| 4b  | Mode guards         | na      | Same behavior in both modes                                                                                                                            |
| 4c  | Turbopack guards    | na      | Original had no Turbopack-only skips                                                                                                                   |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_BUILD/TURBOPACK_DEV guards were mode-dedup wrappers for the two describes; no longer needed since e2e harness runs once per CI mode |
| 4e  | No incorrect env    | pass    |                                                                                                                                                        |
| 5a  | render              | na      |                                                                                                                                                        |
| 5b  | fetch               | na      |                                                                                                                                                        |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                                                               |
| 5d  | check→retry         | pass    | check() replaced with retry() + expect().toMatch                                                                                                       |
| 5e  | File class          | na      |                                                                                                                                                        |
| 5f  | waitFor             | na      |                                                                                                                                                        |
| 5g  | fs operations       | na      |                                                                                                                                                        |
| 6a  | Fixtures exist      | pass    | pages/index.js, 404.js, \_app.js, \_document.js, details.js present                                                                                    |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                      |
| 6c  | Overrides           | na      |                                                                                                                                                        |
| 7a  | No dead code        | pass    |                                                                                                                                                        |
| 7b  | retry over timeout  | pass    |                                                                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                                                                        |

## Issues

None

## Warnings

None
