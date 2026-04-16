# route-load-cancel: PASS

Clean conversion — test logic, URL paths, and fixtures preserved; dedup handled via nextTestSetup mode selection.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                         |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 `it` (run 2x via runTests), converted: 1 `it` (runs in both modes via nextTestSetup)                             |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                                    |
| 1c  | Test titles         | pass    | "should cancel slow page loads on re-navigation" preserved                                                                   |
| 1d  | Describe blocks     | pass    | dev/prod describes flattened into single describe + nextTestSetup mode handling                                              |
| 2a  | URL paths           | pass    | `/` via next.browser, link clicks preserved                                                                                  |
| 2b  | Response checks     | pass    | `#page-text` text match and `window.routeCancelled` preserved                                                                |
| 2c  | FS checks           | na      |                                                                                                                              |
| 2d  | Browser checks      | pass    | webdriver → next.browser, same selectors/interactions                                                                        |
| 2e  | Build output        | na      |                                                                                                                              |
| 2f  | Dynamic logic       | na      | same logic runs in both modes                                                                                                |
| 3a  | nextTestSetup       | pass    | `nextTestSetup({ files: __dirname })`                                                                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                           |
| 3c  | skipStart           | na      | not build-only                                                                                                               |
| 3d  | No manual lifecycle | pass    | no findPort/launchApp/etc                                                                                                    |
| 3e  | Cleanup             | pass    | nextTestSetup handles                                                                                                        |
| 4a  | Directory placement | pass    | test/e2e (runs in both dev and prod)                                                                                         |
| 4b  | Mode guards         | na      | same behavior in both modes                                                                                                  |
| 4c  | Turbopack guards    | na      | original only had CI dedup, not turbopack skip                                                                               |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_BUILD`/`TURBOPACK_DEV` guards were CI-mode dedup; nextTestSetup handles mode selection implicitly        |
| 4e  | No incorrect env    | pass    | no env guards in converted                                                                                                   |
| 5a  | render              | na      |                                                                                                                              |
| 5b  | fetch               | na      |                                                                                                                              |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                                     |
| 5d  | check→retry         | pass    | retry wraps final assertions                                                                                                 |
| 5e  | File class          | na      |                                                                                                                              |
| 5f  | waitFor             | warn    | still uses waitFor(5000)+waitFor(1000) for click timing; acceptable (matches original timing-based cancellation test intent) |
| 5g  | fs operations       | na      |                                                                                                                              |
| 6a  | Fixtures exist      | pass    | pages/index.js, page1.js, page2.js present                                                                                   |
| 6b  | next.config.js      | na      | original had no next.config.js                                                                                               |
| 6c  | Overrides           | na      |                                                                                                                              |
| 7a  | No dead code        | pass    |                                                                                                                              |
| 7b  | retry over timeout  | pass    | final state assertion uses retry                                                                                             |
| 7c  | async/await         | pass    |                                                                                                                              |
| 7d  | eslint              | pass    |                                                                                                                              |

## Issues

None

## Warnings

- `waitFor(5000)` and `waitFor(1000)` are retained. These are timing-sensitive delays used to simulate slow-loading scenarios (matches original test intent for route cancellation), so acceptable here — but the final trailing `waitFor(1000)` was dropped and replaced with `retry()`, which is an improvement.
