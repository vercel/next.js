# 404-page-app: PASS

Clean conversion preserving all 5 tests and 11 assertions with proper mode guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                  |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5, converted: 5                                                                                                                                             |
| 1b  | Assertions          | pass    | original: 11, converted: 11                                                                                                                                           |
| 1c  | Test titles         | pass    | All preserved (minor reword: dev "…if \_app has GIP" → "should not show pages/404 GIP error")                                                                         |
| 1d  | Describe blocks     | pass    | Inner prod/dev describes flattened into isNextStart guard                                                                                                             |
| 2a  | URL paths           | pass    | /404, /abc all preserved                                                                                                                                              |
| 2b  | Response checks     | pass    | status 404, #404-title text, **NEXT_DATA**.autoExport all preserved                                                                                                   |
| 2c  | FS checks           | pass    | `fs.readJSON` → `next.readJSON('.next/routes-manifest.json')`                                                                                                         |
| 2d  | Browser checks      | pass    | webdriver → next.browser                                                                                                                                              |
| 2e  | Build output        | pass    | nextBuild return → next.cliOutput check                                                                                                                               |
| 2f  | Dynamic logic       | pass    | Prod-only block mapped to isNextStart                                                                                                                                 |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                       |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                                    |
| 3c  | skipStart           | na      | Not a build-only test                                                                                                                                                 |
| 3d  | No manual lifecycle | pass    | No killApp/launchApp/nextBuild/nextStart                                                                                                                              |
| 3e  | Cleanup             | pass    | nextTestSetup handles                                                                                                                                                 |
| 4a  | Directory placement | pass    | test/e2e/ correct (runs both modes)                                                                                                                                   |
| 4b  | Mode guards         | pass    | isNextStart wraps build-specific tests                                                                                                                                |
| 4c  | Turbopack guards    | na      | Original used TURBOPACK_DEV/BUILD for dedup, not turbopack skip                                                                                                       |
| 4d  | Dedup guards        | warn    | Original TURBOPACK_DEV/TURBOPACK_BUILD dedup guards were dropped; isNextStart partially dedups build-only tests but the 2 unguarded tests now run in both turbo modes |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD in converted                                                                                                                                   |
| 5a  | render              | pass    | render$ for cheerio                                                                                                                                                   |
| 5b  | fetch               | pass    |                                                                                                                                                                       |
| 5c  | browser             | pass    |                                                                                                                                                                       |
| 5d  | check→retry         | na      |                                                                                                                                                                       |
| 5e  | File class          | na      |                                                                                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                                                                       |
| 5g  | fs operations       | pass    | next.readJSON used                                                                                                                                                    |
| 6a  | Fixtures exist      | pass    | pages/404.js, \_app.js, err.js, index.js, next.config.js all present                                                                                                  |
| 6b  | next.config.js      | pass    | Present                                                                                                                                                               |
| 6c  | Overrides           | na      |                                                                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                                                                       |
| 7b  | retry over timeout  | na      | No polling needed                                                                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                                                                       |

## Issues

None

## Warnings

- 4d: Original dedup guards (TURBOPACK_DEV/TURBOPACK_BUILD) were not preserved. The two unguarded tests ("should still use 404 page", "should not show pages/404 GIP error") will run in both turbopack dev and turbopack build CI lanes, which is slightly more coverage than original but not a dedup concern.
