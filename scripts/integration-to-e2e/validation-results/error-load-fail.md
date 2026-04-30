# error-load-fail: PASS

Clean conversion: single test preserved with correct API migration from `check` to `retry`, proper fixture files present, and appropriate placement in `test/production/`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                       |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                  |
| 1b  | Assertions          | pass    | original: 0 expect (check), converted: 1 expect via retry                                                  |
| 1c  | Test titles         | pass    | "handles failing to load \_error correctly" preserved                                                      |
| 1d  | Describe blocks     | pass    | Outer "Failing to load \_error" preserved; inner "production mode" flattened (test is in test/production/) |
| 2a  | URL paths           | pass    | `/` via browser preserved                                                                                  |
| 2b  | Response checks     | pass    | `window.beforeNavigate` check preserved                                                                    |
| 2c  | FS checks           | na      |                                                                                                            |
| 2d  | Browser checks      | pass    | webdriver → next.browser with beforePageLoad intact                                                        |
| 2e  | Build output        | na      |                                                                                                            |
| 2f  | Dynamic logic       | na      |                                                                                                            |
| 3a  | nextTestSetup       | pass    |                                                                                                            |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                         |
| 3c  | skipStart           | na      | Test needs server running                                                                                  |
| 3d  | No manual lifecycle | pass    | nextBuild/nextStart/findPort/killApp removed                                                               |
| 3e  | Cleanup             | pass    | afterAll killApp no longer needed                                                                          |
| 4a  | Directory placement | pass    | test/production/ matches original production-only coverage                                                 |
| 4b  | Mode guards         | na      |                                                                                                            |
| 4c  | Turbopack guards    | warn    | Original had `TURBOPACK_DEV ? describe.skip : describe` dedup guard; not preserved                         |
| 4d  | Dedup guards        | warn    | Same as 4c — TURBOPACK_DEV dedup guard dropped                                                             |
| 4e  | No incorrect env    | pass    |                                                                                                            |
| 5a  | render              | na      |                                                                                                            |
| 5b  | fetch               | na      |                                                                                                            |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                   |
| 5d  | check→retry         | pass    | Properly converted to retry() + expect                                                                     |
| 5e  | File class          | na      |                                                                                                            |
| 5f  | waitFor             | na      |                                                                                                            |
| 5g  | fs operations       | pass    | appDir → next.testDir for manifest path                                                                    |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/broken.js present                                                                    |
| 6b  | next.config.js      | na      | Neither original nor converted has one                                                                     |
| 6c  | Overrides           | na      |                                                                                                            |
| 7a  | No dead code        | pass    |                                                                                                            |
| 7b  | retry over timeout  | pass    |                                                                                                            |
| 7c  | async/await         | pass    |                                                                                                            |
| 7d  | eslint              | pass    |                                                                                                            |

## Issues

None

## Warnings

- Original used `process.env.TURBOPACK_DEV ? describe.skip : describe` as a dedup guard. The converted test does not replicate this skip. Since the test lives in `test/production/` it will not run in dev mode, but if CI runs production tests with `TURBOPACK_DEV` set for dedup purposes, the guard may still be relevant. Consider adding `;(process.env.TURBOPACK_DEV ? describe.skip : describe)` wrapping if the dedup matters.
