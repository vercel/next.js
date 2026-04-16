# prerender-fallback-encoding: PASS

Conversion preserves all tests, assertions, and behavior with proper mode guards and fixture files in place.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                             |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 7 (2 prod-only + 5 shared), converted: 7 (2 prod-only + 5 shared)                      |
| 1b  | Assertions          | pass    | all preserved; converted adds extra redundant fetch                                              |
| 1c  | Test titles         | pass    | all 7 titles preserved verbatim                                                                  |
| 1d  | Describe blocks     | pass    | outer dev/prod describes flattened to isNextStart guards                                         |
| 2a  | URL paths           | pass    | all `/mode/slug`, `/_next/data/buildId/mode/slug.json` preserved                                 |
| 2b  | Response checks     | pass    | status, body, props, router fields preserved                                                     |
| 2c  | FS checks           | pass    | uses `next.testDir` for `.next/server/pages` checks                                              |
| 2d  | Browser checks      | pass    | webdriver → next.browser with same selectors                                                     |
| 2e  | Build output        | na      | no build output assertions                                                                       |
| 2f  | Dynamic logic       | pass    | `runTests(isDev)` conditional mapped to `isNextStart`                                            |
| 3a  | nextTestSetup       | pass    | uses nextTestSetup from e2e-utils                                                                |
| 3b  | files param         | pass    | `files: __dirname`                                                                               |
| 3c  | skipStart           | na      | test needs server for both modes                                                                 |
| 3d  | No manual lifecycle | pass    | no killApp/launchApp/nextBuild imports                                                           |
| 3e  | Cleanup             | pass    | nextTestSetup handles cleanup                                                                    |
| 4a  | Directory placement | pass    | test/e2e/ appropriate (runs dev + prod)                                                          |
| 4b  | Mode guards         | pass    | prod-only tests wrapped in `if (isNextStart)`                                                    |
| 4c  | Turbopack guards    | na      | none needed                                                                                      |
| 4d  | Dedup guards        | na      | original TURBOPACK_BUILD/DEV describe.skip flags converted to nextTestSetup mode-based execution |
| 4e  | No incorrect env    | pass    | no TURBOPACK_DEV/BUILD env refs                                                                  |
| 5a  | render              | pass    | uses next.render$                                                                                |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                        |
| 5c  | browser             | pass    | webdriver → next.browser                                                                         |
| 5d  | check→retry         | pass    | all check() calls replaced with retry+expect                                                     |
| 5e  | File class          | na      | not used                                                                                         |
| 5f  | waitFor             | na      | not used                                                                                         |
| 5g  | fs operations       | pass    | uses `next.testDir` rather than `appDir`                                                         |
| 6a  | Fixtures exist      | pass    | pages/fallback-{blocking,false,true}/[slug].js, next.config.js, paths.js all present             |
| 6b  | next.config.js      | pass    | preserved                                                                                        |
| 6c  | Overrides           | na      | no overrides                                                                                     |
| 7a  | No dead code        | pass    | no commented-out tests                                                                           |
| 7b  | retry over timeout  | pass    | uses retry from next-test-utils                                                                  |
| 7c  | async/await         | pass    |                                                                                                  |
| 7d  | eslint              | pass    |                                                                                                  |

## Issues

None

## Warnings

- In `should respond with the prerendered pages correctly`, the converted test performs both `next.fetch` AND `next.render$` for the same path (original did a single fetch + cheerio.load). Redundant but not incorrect.
