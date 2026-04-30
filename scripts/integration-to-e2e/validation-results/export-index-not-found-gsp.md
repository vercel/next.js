# export-index-not-found-gsp: PASS

Clean, minimal conversion of a build-only integration test with fixtures correctly copied.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                           |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                      |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                      |
| 1c  | Test titles         | pass    | "should build successfully" preserved                                                          |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner "production mode" flattened (appropriate for test/production/) |
| 2a  | URL paths           | na      | No HTTP calls                                                                                  |
| 2b  | Response checks     | na      |                                                                                                |
| 2c  | FS checks           | na      | Original `fs.remove` for `.next`/`out` is handled by isolated test dir                         |
| 2d  | Browser checks      | na      |                                                                                                |
| 2e  | Build output        | pass    | `next.build()` exitCode === 0                                                                  |
| 2f  | Dynamic logic       | na      |                                                                                                |
| 3a  | nextTestSetup       | pass    |                                                                                                |
| 3b  | files param         | pass    | `__dirname`                                                                                    |
| 3c  | skipStart           | pass    | `skipStart: true` for build-only test                                                          |
| 3d  | No manual lifecycle | pass    |                                                                                                |
| 3e  | Cleanup             | pass    | Isolated dir handles cleanup                                                                   |
| 4a  | Directory placement | pass    | test/production/ correct for prod-only build                                                   |
| 4b  | Mode guards         | pass    |                                                                                                |
| 4c  | Turbopack guards    | pass    | Original used `TURBOPACK_DEV` skip; N/A under test/production which only runs build+start      |
| 4d  | Dedup guards        | na      |                                                                                                |
| 4e  | No incorrect env    | pass    |                                                                                                |
| 5a  | render              | na      |                                                                                                |
| 5b  | fetch               | na      |                                                                                                |
| 5c  | browser             | na      |                                                                                                |
| 5d  | check→retry         | na      |                                                                                                |
| 5e  | File class          | na      |                                                                                                |
| 5f  | waitFor             | na      |                                                                                                |
| 5g  | fs operations       | pass    | Direct `fs.remove` removed (not needed)                                                        |
| 6a  | Fixtures exist      | pass    | `pages/`, `next.config.js` present                                                             |
| 6b  | next.config.js      | pass    | Present                                                                                        |
| 6c  | Overrides           | na      |                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                |
| 7b  | retry over timeout  | na      |                                                                                                |
| 7c  | async/await         | pass    |                                                                                                |
| 7d  | eslint              | pass    |                                                                                                |

## Issues

None

## Warnings

None
