# trailing-slashes-href-resolving: WARN

Clean conversion; all tests and fixtures preserved, but dedup guards from original were not carried over.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                         |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 7, converted: 7                                                                                                                    |
| 1b  | Assertions          | pass    | original: 7 expect + 1 assert.deepEqual = 8; converted: 8 expect                                                                             |
| 1c  | Test titles         | pass    | All 7 titles preserved verbatim                                                                                                              |
| 1d  | Describe blocks     | pass    | Nested mode describes flattened to single describe with isNextStart guard                                                                    |
| 2a  | URL paths           | pass    | All navigate via '/' root and click links                                                                                                    |
| 2b  | Response checks     | pass    | Element text assertions preserved                                                                                                            |
| 2c  | FS checks           | na      |                                                                                                                                              |
| 2d  | Browser checks      | pass    | webdriver → next.browser, same selectors                                                                                                     |
| 2e  | Build output        | na      |                                                                                                                                              |
| 2f  | Dynamic logic       | pass    | `if (!dev)` → `if (isNextStart)`                                                                                                             |
| 3a  | nextTestSetup       | pass    |                                                                                                                                              |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                           |
| 3c  | skipStart           | na      | Runs in both modes                                                                                                                           |
| 3d  | No manual lifecycle | pass    | launchApp/nextBuild/nextStart removed                                                                                                        |
| 3e  | Cleanup             | pass    | No manual cleanup needed                                                                                                                     |
| 4a  | Directory placement | pass    | test/e2e/ correct for dev+prod                                                                                                               |
| 4b  | Mode guards         | pass    | `isNextStart` guard for SSG preload test                                                                                                     |
| 4c  | Turbopack guards    | na      | Not Turbopack-skip specific                                                                                                                  |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_BUILD ? describe.skip` (dev) and `TURBOPACK_DEV ? describe.skip` (prod). Not preserved — potential redundant CI runs |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD usage in converted                                                                                                    |
| 5a  | render              | na      |                                                                                                                                              |
| 5b  | fetch               | na      |                                                                                                                                              |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                                                     |
| 5d  | check→retry         | pass    | `check(..., 'yes')` → `retry(...)` with expect().toEqual                                                                                     |
| 5e  | File class          | na      |                                                                                                                                              |
| 5f  | waitFor             | na      |                                                                                                                                              |
| 5g  | fs operations       | na      |                                                                                                                                              |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/index.js, pages/[slug].js, pages/blog/_, pages/catch-all/_, pages/404.js, pages/another.js all present                 |
| 6b  | next.config.js      | pass    | Present in fixture                                                                                                                           |
| 6c  | Overrides           | na      |                                                                                                                                              |
| 7a  | No dead code        | pass    | `assert` import dropped; no unused imports                                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                                                                              |
| 7c  | async/await         | pass    |                                                                                                                                              |
| 7d  | eslint              | pass    |                                                                                                                                              |

## Issues

None

## Warnings

- **4d**: Original used `TURBOPACK_BUILD ? describe.skip` to skip dev mode and `TURBOPACK_DEV ? describe.skip` to skip prod mode (dedup between CI matrix legs). Converted test relies on the combined e2e runner, so the SSG preload test inside `isNextStart` may run redundantly under both TURBOPACK_DEV and TURBOPACK_BUILD CI jobs. Consider adding a dedup guard if this suite is expected to run in both Turbopack build and dev CI matrices.
