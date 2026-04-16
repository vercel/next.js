# src-dir-support: PASS

Clean, faithful conversion — all 8 tests preserved with identical titles, URLs, and assertions; fixtures match the original.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                            |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 8 unique (×2 via runTests), converted: 8 (runs both modes via harness)                                                |
| 1b  | Assertions          | pass    | original: 8 expects in runTests, converted: 8                                                                                   |
| 1c  | Test titles         | pass    | All 8 titles preserved verbatim                                                                                                 |
| 1d  | Describe blocks     | pass    | Outer "Dynamic Routing" preserved; dev/prod sub-describes correctly collapsed (harness handles modes)                           |
| 2a  | URL paths           | pass    | /, /another, /post-1, /post-1/comments, /post-1/comment-1, /post-1/cmnt-1 all covered                                           |
| 2b  | Response checks     | pass    | Same regex assertions                                                                                                           |
| 2c  | FS checks           | na      |                                                                                                                                 |
| 2d  | Browser checks      | pass    | next.browser() replaces webdriver; same selectors                                                                               |
| 2e  | Build output        | na      |                                                                                                                                 |
| 2f  | Dynamic logic       | na      | runTests() was identical for dev/prod — no conditional logic to preserve                                                        |
| 3a  | nextTestSetup       | pass    | from 'e2e-utils'                                                                                                                |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                              |
| 3c  | skipStart           | na      | Runs server                                                                                                                     |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp/etc.                                                                                              |
| 3e  | Cleanup             | pass    | No try/finally needed; harness closes browser                                                                                   |
| 4a  | Directory placement | pass    | test/e2e/ — original ran in both dev and prod                                                                                   |
| 4b  | Mode guards         | na      | No mode-specific behavior                                                                                                       |
| 4c  | Turbopack guards    | na      | Original only had dedup guards, not skip guards                                                                                 |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_DEV/TURBOPACK_BUILD were dev-vs-prod dedup; harness handles mode selection via NEXT_TEST_MODE                |
| 4e  | No incorrect env    | pass    | No env guards used                                                                                                              |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                                                     |
| 5b  | fetch               | na      |                                                                                                                                 |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                                        |
| 5d  | check→retry         | na      |                                                                                                                                 |
| 5e  | File class          | na      |                                                                                                                                 |
| 5f  | waitFor             | na      |                                                                                                                                 |
| 5g  | fs operations       | na      |                                                                                                                                 |
| 6a  | Fixtures exist      | pass    | src/pages/{index,another,[name]/index,[name]/comments,[name]/[comment],blog/[name]/comment/[id],on-mount/[post]}.js all present |
| 6b  | next.config.js      | na      | Original had none                                                                                                               |
| 6c  | Overrides           | na      |                                                                                                                                 |
| 7a  | No dead code        | pass    |                                                                                                                                 |
| 7b  | retry over timeout  | pass    |                                                                                                                                 |
| 7c  | async/await         | pass    |                                                                                                                                 |
| 7d  | eslint              | pass    |                                                                                                                                 |

## Issues

None

## Warnings

None
