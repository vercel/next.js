# router-rerender: PASS

Clean conversion — tests, assertions, titles, and fixtures all preserved; `setTimeout` wait correctly replaced with `retry()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                           |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3 (1 active + 2 skipped), converted: 3                                                                                                               |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                                                                                      |
| 1c  | Test titles         | pass    | All 3 preserved verbatim                                                                                                                                       |
| 1d  | Describe blocks     | pass    | `router rerender` > `with middleware` / `with rewrites` preserved; dev/prod wrappers correctly collapsed                                                       |
| 2a  | URL paths           | pass    | `/`                                                                                                                                                            |
| 2b  | Response checks     | pass    | `window.__renders` eval preserved                                                                                                                              |
| 2c  | FS checks           | na      |                                                                                                                                                                |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`                                                                                                                                   |
| 2e  | Build output        | na      |                                                                                                                                                                |
| 2f  | Dynamic logic       | na      | `runTests()` was mode-agnostic                                                                                                                                 |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                             |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                                 |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/etc                                                                                                                                      |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                                       |
| 4a  | Directory placement | pass    | `test/e2e/` correct — both dev and prod covered                                                                                                                |
| 4b  | Mode guards         | na      | Same behavior in both modes                                                                                                                                    |
| 4c  | Turbopack guards    | na      | No turbopack-specific skips                                                                                                                                    |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV`/`TURBOPACK_BUILD` skips were for the dual-mode-in-one-file pattern; nextTestSetup runs once per `NEXT_TEST_MODE` so dedup is inherent |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                |
| 5a  | render              | na      |                                                                                                                                                                |
| 5b  | fetch               | na      |                                                                                                                                                                |
| 5c  | browser             | pass    | `webdriver(appPort, '/')` → `next.browser('/')`                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                                                                |
| 5e  | File class          | na      |                                                                                                                                                                |
| 5f  | waitFor             | pass    | `setTimeout(100)` replaced with `retry()` around the expect                                                                                                    |
| 5g  | fs operations       | na      |                                                                                                                                                                |
| 6a  | Fixtures exist      | pass    | `middleware.js`, `next.config.js`, `pages/` all present; diff vs original is empty                                                                             |
| 6b  | next.config.js      | pass    | Identical to original                                                                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                                                                |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                |
| 7c  | async/await         | pass    |                                                                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                                                                |

## Issues

None

## Warnings

None
