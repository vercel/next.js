# router-is-ready: PASS

Clean 1:1 conversion to e2e format with all 10 tests, fixtures, and behavior preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                              |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 10 (runTests × 2 modes), converted: 10                                                                                                                                  |
| 1b  | Assertions          | pass    | original: 10 check() calls, converted: 10 expect() via retry                                                                                                                      |
| 1c  | Test titles         | pass    | All 10 titles preserved verbatim                                                                                                                                                  |
| 1d  | Describe blocks     | pass    | Outer describe kept; dev/prod sub-describes folded (nextTestSetup handles modes)                                                                                                  |
| 2a  | URL paths           | pass    | /gip, /gip?hello=world, /gssp, /gssp?hello=world, /auto-export, /auto-export?hello=world, /auto-export/first, /auto-export/first?hello=true, /gsp?hello=world, /gsp all preserved |
| 2b  | Response checks     | pass    | window.isReadyValues comparison preserved                                                                                                                                         |
| 2c  | FS checks           | na      |                                                                                                                                                                                   |
| 2d  | Browser checks      | pass    | webdriver → next.browser                                                                                                                                                          |
| 2e  | Build output        | na      |                                                                                                                                                                                   |
| 2f  | Dynamic logic       | pass    | runTests() inlined; nextTestSetup handles dev/prod modes                                                                                                                          |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                                   |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                                                |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                                                    |
| 3d  | No manual lifecycle | pass    | findPort/launchApp/killApp/nextStart/nextBuild removed                                                                                                                            |
| 3e  | Cleanup             | pass    | invalidPage.restore() was a no-op (file never modified); nextTestSetup handles the rest                                                                                           |
| 4a  | Directory placement | pass    | test/e2e/ correct (runs dev + prod)                                                                                                                                               |
| 4b  | Mode guards         | pass    | No dev/prod-specific behavior in original                                                                                                                                         |
| 4c  | Turbopack guards    | na      | Original guards were dedup, not feature skips                                                                                                                                     |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_DEV/TURBOPACK_BUILD were dedup guards; nextTestSetup + harness mode selection handles dedup                                                                    |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                                   |
| 5a  | render              | na      |                                                                                                                                                                                   |
| 5b  | fetch               | na      |                                                                                                                                                                                   |
| 5c  | browser             | pass    | webdriver(port, path) → next.browser(path)                                                                                                                                        |
| 5d  | check→retry         | pass    | check(...) → retry(async () => expect(...))                                                                                                                                       |
| 5e  | File class          | pass    | Dropped unused File/restore() no-op                                                                                                                                               |
| 5f  | waitFor             | na      |                                                                                                                                                                                   |
| 5g  | fs operations       | na      |                                                                                                                                                                                   |
| 6a  | Fixtures exist      | pass    | pages/{gip,gsp,gssp,invalid}.js, pages/auto-export/{index,[slug]}.js all present                                                                                                  |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                                                 |
| 6c  | Overrides           | na      |                                                                                                                                                                                   |
| 7a  | No dead code        | pass    | Unused File/invalidPage import/restore removed cleanly                                                                                                                            |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                                                                                   |
| 7d  | eslint              | pass    |                                                                                                                                                                                   |

## Issues

None

## Warnings

None
