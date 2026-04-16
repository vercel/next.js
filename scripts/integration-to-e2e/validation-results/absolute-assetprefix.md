# absolute-assetprefix: PASS

Clean conversion preserving all 5 tests, assertions, and the CDN proxy setup using `skipStart: true` + manual `next.start()` after patching `next.config.js`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                      |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5, converted: 5                                                                                                                                                 |
| 1b  | Assertions          | pass    | original: 11, converted: 11                                                                                                                                               |
| 1c  | Test titles         | pass    | All 5 preserved verbatim                                                                                                                                                  |
| 1d  | Describe blocks     | pass    | Inner nested describe flattened; outer preserved                                                                                                                          |
| 2a  | URL paths           | pass    | All `webdriver(appPort, '/')` → `next.browser('/')`                                                                                                                       |
| 2b  | Response checks     | pass    | All `expect` assertions preserved                                                                                                                                         |
| 2c  | FS checks           | pass    | `fs.readFile BUILD_ID` → `next.buildId`; config replace uses `next.readFile`/`next.patchFile`                                                                             |
| 2d  | Browser checks      | pass    | All `waitForElementByCss`/`eval`/`back` interactions preserved                                                                                                            |
| 2e  | Build output        | na      |                                                                                                                                                                           |
| 2f  | Dynamic logic       | na      | Production-only                                                                                                                                                           |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                        |
| 3c  | skipStart           | pass    | Required because CDN proxy must start first and config needs `__CDN_PORT__` replacement                                                                                   |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/etc. (uses `next.appPort`)                                                                                                                            |
| 3e  | Cleanup             | pass    | cdn.close() in afterAll; nextConfig.restore() no longer needed (isolated copy)                                                                                            |
| 4a  | Directory placement | pass    | test/production/ matches prod-only original                                                                                                                               |
| 4b  | Mode guards         | na      |                                                                                                                                                                           |
| 4c  | Turbopack guards    | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip` dedup guard; not preserved. Since test now only lives in `test/production/`, dedup guard is arguably unnecessary |
| 4d  | Dedup guards        | warn    | See 4c — the TURBOPACK_DEV skip was effectively a dedup guard                                                                                                             |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                           |
| 5a  | render              | na      |                                                                                                                                                                           |
| 5b  | fetch               | na      |                                                                                                                                                                           |
| 5c  | browser             | pass    | `webdriver` → `next.browser()`                                                                                                                                            |
| 5d  | check→retry         | na      |                                                                                                                                                                           |
| 5e  | File class          | pass    | `new File(...).replace(...)` → `next.readFile()` + `next.patchFile()`                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                                                                                           |
| 5g  | fs operations       | pass    | `fs.readFile BUILD_ID` → `next.buildId`                                                                                                                                   |
| 6a  | Fixtures exist      | pass    | pages/index.js, about.js, gssp.js, gsp-fallback/[slug].js, next.config.js all present                                                                                     |
| 6b  | next.config.js      | pass    | Present with `__CDN_PORT__` placeholder                                                                                                                                   |
| 6c  | Overrides           | na      |                                                                                                                                                                           |
| 7a  | No dead code        | pass    |                                                                                                                                                                           |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                           |
| 7c  | async/await         | pass    |                                                                                                                                                                           |
| 7d  | eslint              | pass    |                                                                                                                                                                           |

## Issues

None.

## Warnings

- The original's `process.env.TURBOPACK_DEV ? describe.skip : describe` guard was not carried over. Given the test is now production-only under `test/production/`, this is likely harmless, but if CI runs production tests with `TURBOPACK_DEV=1` (or the equivalent dedup env), the skip should be re-added at the top-level describe wrapper.
- Minor: `cdnPort = 0` initialization is unused (it's overwritten after `cdn.listen`); harmless.
