# index-index: PASS

Clean conversion: all 17 tests preserved with correct webpack-dev failure guards, fixtures intact, and proper `retry()` migration.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                            |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 17, converted: 17                                                                                                                                     |
| 1b  | Assertions          | pass    | original: 17, converted: 17                                                                                                                                     |
| 1c  | Test titles         | pass    | All preserved                                                                                                                                                   |
| 1d  | Describe blocks     | pass    | dev/prod describes flattened — nextTestSetup handles both modes                                                                                                 |
| 2a  | URL paths           | pass    | /, /links, /index, /index/user, /index/project, /index/index, /index/index/index all preserved                                                                  |
| 2b  | Response checks     | pass    | text + 404 status preserved                                                                                                                                     |
| 2c  | FS checks           | na      |                                                                                                                                                                 |
| 2d  | Browser checks      | pass    | next.browser with identical selectors                                                                                                                           |
| 2e  | Build output        | na      |                                                                                                                                                                 |
| 2f  | Dynamic logic       | pass    | testNotWebpackDev → `(isNextDev && !isTurbopack ? it.failing : it)`                                                                                             |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                 |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                              |
| 3c  | skipStart           | na      | not build-only                                                                                                                                                  |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                 |
| 3e  | Cleanup             | pass    | no browser.close() needed, handled by harness                                                                                                                   |
| 4a  | Directory placement | pass    | test/e2e/ correct for dev + prod coverage                                                                                                                       |
| 4b  | Mode guards         | pass    | isNextDev used for webpack-dev failing tests                                                                                                                    |
| 4c  | Turbopack guards    | pass    | uses `isTurbopack` from nextTestSetup within it.failing guard                                                                                                   |
| 4d  | Dedup guards        | na      | original TURBOPACK_DEV/BUILD guards were just mode skips, not dedup                                                                                             |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                 |
| 5a  | render              | pass    | renderViaHTTP → next.render$                                                                                                                                    |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                                                                                       |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                                                                        |
| 5d  | check→retry         | pass    | check+waitFor → retry+expect                                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                                                                 |
| 5f  | waitFor             | pass    | removed in favor of retry                                                                                                                                       |
| 5g  | fs operations       | na      | nextConfig mutation dropped (was only to scrub legacy `target` field)                                                                                           |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/index/index.js, pages/index/index/index.js, pages/index/project/index.js, pages/index/user.js, pages/links.js, next.config.js all present |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                                                                 |
| 7a  | No dead code        | pass    |                                                                                                                                                                 |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                 |
| 7c  | async/await         | pass    |                                                                                                                                                                 |
| 7d  | eslint              | pass    | eslint-disable for jest/no-standalone-expect justified (it.failing usage)                                                                                       |

## Issues

None

## Warnings

None
