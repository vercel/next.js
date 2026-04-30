# invalid-multi-match: PASS

Clean conversion — a small two-describe test using `runTests()` was correctly collapsed to a single `nextTestSetup`-driven test that runs in both dev and prod.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                      |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 `it` invoked from 2 describes; converted: 1 `it` run in both modes by harness |
| 1b  | Assertions          | pass    | original: 2; converted: 2                                                                 |
| 1c  | Test titles         | pass    | Typo "mulit-match" fixed to "multi-match" (acceptable wording change)                     |
| 1d  | Describe blocks     | pass    | Inner dev/prod describes collapsed; harness provides mode coverage                        |
| 2a  | URL paths           | pass    | `/random` preserved via `next.render`                                                     |
| 2b  | Response checks     | pass    | stderr → `next.cliOutput` assertions preserved                                            |
| 2c  | FS checks           | na      |                                                                                           |
| 2d  | Browser checks      | na      |                                                                                           |
| 2e  | Build output        | pass    | cliOutput used for error message check                                                    |
| 2f  | Dynamic logic       | pass    | `runTests()` had identical body for both modes; inlined correctly                         |
| 3a  | nextTestSetup       | pass    |                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                        |
| 3c  | skipStart           | na      | Test needs running server                                                                 |
| 3d  | No manual lifecycle | pass    | No launchApp/killApp/nextBuild                                                            |
| 3e  | Cleanup             | pass    | Harness-managed                                                                           |
| 4a  | Directory placement | pass    | `test/e2e/` correct (runs both dev+prod)                                                  |
| 4b  | Mode guards         | na      | Same behavior for both modes                                                              |
| 4c  | Turbopack guards    | na      | Original TURBOPACK_DEV/BUILD were dedup-only, not skip-for-bundler                        |
| 4d  | Dedup guards        | pass    | Harness handles mode selection; explicit dedup unnecessary                                |
| 4e  | No incorrect env    | pass    |                                                                                           |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                           |
| 5b  | fetch               | na      |                                                                                           |
| 5c  | browser             | na      |                                                                                           |
| 5d  | check→retry         | na      |                                                                                           |
| 5e  | File class          | na      |                                                                                           |
| 5f  | waitFor             | na      |                                                                                           |
| 5g  | fs operations       | na      |                                                                                           |
| 6a  | Fixtures exist      | pass    | `next.config.js`, `pages/hello.js` present                                                |
| 6b  | next.config.js      | pass    |                                                                                           |
| 6c  | Overrides           | na      |                                                                                           |
| 7a  | No dead code        | pass    |                                                                                           |
| 7b  | retry over timeout  | pass    |                                                                                           |
| 7c  | async/await         | pass    |                                                                                           |
| 7d  | eslint              | pass    |                                                                                           |

## Issues

None

## Warnings

None
