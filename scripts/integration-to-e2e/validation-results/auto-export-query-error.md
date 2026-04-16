# auto-export-query-error: PASS

Clean, faithful conversion of a build-only test with correct use of `skipStart: true` and `next.build()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                      |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                 |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                 |
| 1c  | Test titles         | pass    | Title preserved verbatim                                                                  |
| 1d  | Describe blocks     | pass    | Flattened appropriately (outer Auto Export / production mode merged into single describe) |
| 2a  | URL paths           | na      | No HTTP requests                                                                          |
| 2b  | Response checks     | na      |                                                                                           |
| 2c  | FS checks           | na      |                                                                                           |
| 2d  | Browser checks      | na      |                                                                                           |
| 2e  | Build output        | pass    | stderr → cliOutput, exitCode preserved                                                    |
| 2f  | Dynamic logic       | na      |                                                                                           |
| 3a  | nextTestSetup       | pass    |                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                        |
| 3c  | skipStart           | pass    | Build-only test, `skipStart: true` correctly set                                          |
| 3d  | No manual lifecycle | pass    |                                                                                           |
| 3e  | Cleanup             | pass    | No custom cleanup needed                                                                  |
| 4a  | Directory placement | pass    | test/production/ correct for build-only prod test                                         |
| 4b  | Mode guards         | na      |                                                                                           |
| 4c  | Turbopack guards    | pass    | Original's `TURBOPACK_DEV` skip is moot in test/production (only runs in start mode)      |
| 4d  | Dedup guards        | na      |                                                                                           |
| 4e  | No incorrect env    | pass    |                                                                                           |
| 5a  | render              | na      |                                                                                           |
| 5b  | fetch               | na      |                                                                                           |
| 5c  | browser             | na      |                                                                                           |
| 5d  | check→retry         | na      |                                                                                           |
| 5e  | File class          | na      |                                                                                           |
| 5f  | waitFor             | na      |                                                                                           |
| 5g  | fs operations       | na      |                                                                                           |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/hello.js, pages/ssg.js, pages/ssr.js all present                    |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                    |
| 6c  | Overrides           | na      |                                                                                           |
| 7a  | No dead code        | pass    |                                                                                           |
| 7b  | retry over timeout  | na      |                                                                                           |
| 7c  | async/await         | pass    |                                                                                           |
| 7d  | eslint              | pass    |                                                                                           |

## Issues

None

## Warnings

None
