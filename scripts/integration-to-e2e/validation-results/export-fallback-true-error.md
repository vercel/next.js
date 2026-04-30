# export-fallback-true-error: PASS

Clean and faithful conversion of a single build-only test with proper `skipStart: true` and fixture files in place.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                       |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                  |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                  |
| 1c  | Test titles         | pass    | "should build successfully" preserved                                                      |
| 1d  | Describe blocks     | pass    | Inner production-mode describe flattened; appropriate since file lives in test/production/ |
| 2a  | URL paths           | na      | No HTTP requests                                                                           |
| 2b  | Response checks     | na      |                                                                                            |
| 2c  | FS checks           | na      | No fs reads in original                                                                    |
| 2d  | Browser checks      | na      |                                                                                            |
| 2e  | Build output        | pass    | Uses next.build() + next.cliOutput, checks exitCode                                        |
| 2f  | Dynamic logic       | na      |                                                                                            |
| 3a  | nextTestSetup       | pass    |                                                                                            |
| 3b  | files param         | pass    | files: \_\_dirname                                                                         |
| 3c  | skipStart           | pass    | Build-only test uses skipStart: true + next.build()                                        |
| 3d  | No manual lifecycle | pass    |                                                                                            |
| 3e  | Cleanup             | pass    | Original's fs.remove(.next) no longer needed (isolated test dir)                           |
| 4a  | Directory placement | pass    | test/production/ matches original (production mode only)                                   |
| 4b  | Mode guards         | pass    |                                                                                            |
| 4c  | Turbopack guards    | na      | Original TURBOPACK_DEV skip is implicit since test/production/ doesn't run in dev matrix   |
| 4d  | Dedup guards        | na      |                                                                                            |
| 4e  | No incorrect env    | pass    |                                                                                            |
| 5a  | render              | na      |                                                                                            |
| 5b  | fetch               | na      |                                                                                            |
| 5c  | browser             | na      |                                                                                            |
| 5d  | check→retry         | na      |                                                                                            |
| 5e  | File class          | na      |                                                                                            |
| 5f  | waitFor             | na      |                                                                                            |
| 5g  | fs operations       | pass    | Removed direct fs.remove(appDir/.next); isolated dir handles this                          |
| 6a  | Fixtures exist      | pass    | pages/[slug].js, next.config.js present                                                    |
| 6b  | next.config.js      | pass    | Present                                                                                    |
| 6c  | Overrides           | na      |                                                                                            |
| 7a  | No dead code        | pass    |                                                                                            |
| 7b  | retry over timeout  | na      |                                                                                            |
| 7c  | async/await         | pass    |                                                                                            |
| 7d  | eslint              | pass    |                                                                                            |

## Issues

None

## Warnings

None
