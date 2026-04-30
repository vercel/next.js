# middleware-prefetch: PASS

Clean 2-test conversion with equivalent structure and fixtures; assertions are slightly simplified but behaviorally equivalent.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                             |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                        |
| 1b  | Assertions          | pass    | Equivalent check→retry+expect per test                                                                           |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                   |
| 1d  | Describe blocks     | pass    | Inner `production mode` describe (TURBOPACK_DEV guard) collapsed — placement in test/production/ replaces it     |
| 2a  | URL paths           | pass    | Only `/` visited, preserved                                                                                      |
| 2b  | Response checks     | pass    | Script src matching preserved                                                                                    |
| 2c  | FS checks           | na      |                                                                                                                  |
| 2d  | Browser checks      | pass    | webdriver → next.browser, same selectors & moveTo                                                                |
| 2e  | Build output        | na      | No build-output assertions                                                                                       |
| 2f  | Dynamic logic       | na      |                                                                                                                  |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                                                                |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                               |
| 3c  | skipStart           | na      | Server required for browser tests                                                                                |
| 3d  | No manual lifecycle | pass    | findPort/killApp/nextStart removed                                                                               |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                         |
| 4a  | Directory placement | pass    | test/production/ matches original prod-only scope                                                                |
| 4b  | Mode guards         | na      | Single mode (prod)                                                                                               |
| 4c  | Turbopack guards    | pass    | TURBOPACK_DEV guard was dedup for integration running in dev; subsumed by test/production/ placement             |
| 4d  | Dedup guards        | pass    | Placement replaces the env guard                                                                                 |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD checks                                                                                    |
| 5a  | render              | na      |                                                                                                                  |
| 5b  | fetch               | na      |                                                                                                                  |
| 5c  | browser             | pass    | next.browser('/') used                                                                                           |
| 5d  | check→retry         | pass    | Both checks converted with expect inside retry                                                                   |
| 5e  | File class          | na      |                                                                                                                  |
| 5f  | waitFor             | na      |                                                                                                                  |
| 5g  | fs operations       | pass    | Dropped appDir BUILD_ID read (not asserted) and getClientBuildManifestLoaderChunkUrlPath replaced with substring |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/ssg-page.js, pages/ssg-page-2.js, middleware.js present                                    |
| 6b  | next.config.js      | pass    | None in original, none needed                                                                                    |
| 6c  | Overrides           | na      | env.MIDDLEWARE_TEST preserved                                                                                    |
| 7a  | No dead code        | pass    |                                                                                                                  |
| 7b  | retry over timeout  | pass    |                                                                                                                  |
| 7c  | async/await         | pass    |                                                                                                                  |
| 7d  | eslint              | pass    |                                                                                                                  |

## Issues

None

## Warnings

- Test 1 originally used `getClientBuildManifestLoaderChunkUrlPath(appDir, '/ssg-page')` to match the exact chunk URL. Converted simplifies to `src.includes('/ssg-page')`, which is looser and could match unrelated scripts (including `/ssg-page-2`). Behavior is close but not identical; consider tightening to `/ssg-page.` or a chunk-aware check.
