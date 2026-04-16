# link-with-encoding: PASS

Clean 1:1 conversion — all 16 tests preserved, `webdriver`/`check`/`waitFor` properly migrated to `next.browser`/`retry`, and fixture pages match.

## Criteria

| #   | Criterion           | Verdict | Note                                                               |
| --- | ------------------- | ------- | ------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 16, converted: 16                                        |
| 1b  | Assertions          | pass    | original: 16, converted: 26 (retry+expect pattern)                 |
| 1c  | Test titles         | pass    | All preserved verbatim                                             |
| 1d  | Describe blocks     | pass    | Outer + 5 inner describes preserved                                |
| 2a  | URL paths           | pass    | All paths (`/`, `/single/...`, encoded variants) preserved         |
| 2b  | Response checks     | pass    | All inline snapshots + text assertions preserved                   |
| 2c  | FS checks           | na      | No fs operations                                                   |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`, same selectors/interactions          |
| 2e  | Build output        | na      | Dev-only test                                                      |
| 2f  | Dynamic logic       | na      | No runTests helper                                                 |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                              |
| 3b  | files param         | pass    | `files: __dirname`                                                 |
| 3c  | skipStart           | na      | Not build-only                                                     |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                      |
| 3e  | Cleanup             | pass    | No try/finally browser.close needed — nextTestSetup handles        |
| 4a  | Directory placement | pass    | Original used `launchApp` (dev) → `test/development/` correct      |
| 4b  | Mode guards         | na      | Single-mode test                                                   |
| 4c  | Turbopack guards    | na      |                                                                    |
| 4d  | Dedup guards        | na      |                                                                    |
| 4e  | No incorrect env    | pass    |                                                                    |
| 5a  | render              | na      |                                                                    |
| 5b  | fetch               | na      |                                                                    |
| 5c  | browser             | pass    | All `webdriver(appPort, path)` → `next.browser(path)`              |
| 5d  | check→retry         | pass    | All `check()` calls replaced with `retry()` + `expect()`           |
| 5e  | File class          | na      |                                                                    |
| 5f  | waitFor             | pass    | `waitFor(2000)` delays removed (no longer needed)                  |
| 5g  | fs operations       | na      |                                                                    |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/query.js, pages/single/[slug].js all present |
| 6b  | next.config.js      | na      | Original had none                                                  |
| 6c  | Overrides           | na      |                                                                    |
| 7a  | No dead code        | pass    |                                                                    |
| 7b  | retry over timeout  | pass    | retry() used for async state polling                               |
| 7c  | async/await         | pass    |                                                                    |
| 7d  | eslint              | pass    |                                                                    |

## Issues

None

## Warnings

None
