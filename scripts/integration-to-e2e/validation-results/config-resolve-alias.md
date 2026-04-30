# config-resolve-alias: PASS

Clean 1:1 conversion of a single build-only test using `skipStart` and Turbopack skip guard wrapping the describe.

## Criteria

| #   | Criterion           | Verdict | Note                                        |
| --- | ------------------- | ------- | ------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                   |
| 1b  | Assertions          | pass    | original: 1, converted: 1                   |
| 1c  | Test titles         | pass    | Title preserved verbatim                    |
| 1d  | Describe blocks     | pass    | Single describe preserved                   |
| 2a  | URL paths           | na      | No HTTP requests                            |
| 2b  | Response checks     | na      |                                             |
| 2c  | FS checks           | na      |                                             |
| 2d  | Browser checks      | na      |                                             |
| 2e  | Build output        | pass    | stderr → next.cliOutput toMatch preserved   |
| 2f  | Dynamic logic       | na      |                                             |
| 3a  | nextTestSetup       | pass    | imported from 'e2e-utils'                   |
| 3b  | files param         | pass    | files: \_\_dirname                          |
| 3c  | skipStart           | pass    | Build-only, skipStart: true + next.build()  |
| 3d  | No manual lifecycle | pass    | No runNextCommand / findPort etc.           |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                    |
| 4a  | Directory placement | pass    | test/production/ appropriate for build-only |
| 4b  | Mode guards         | na      |                                             |
| 4c  | Turbopack guards    | pass    | Correct outer-describe skip pattern         |
| 4d  | Dedup guards        | na      |                                             |
| 4e  | No incorrect env    | pass    | Uses IS_TURBOPACK_TEST only at top-level    |
| 5a  | render              | na      |                                             |
| 5b  | fetch               | na      |                                             |
| 5c  | browser             | na      |                                             |
| 5d  | check→retry         | na      |                                             |
| 5e  | File class          | na      |                                             |
| 5f  | waitFor             | na      |                                             |
| 5g  | fs operations       | na      |                                             |
| 6a  | Fixtures exist      | pass    | pages/index.js and next.config.js present   |
| 6b  | next.config.js      | pass    | Copied from original fixture                |
| 6c  | Overrides           | na      |                                             |
| 7a  | No dead code        | pass    |                                             |
| 7b  | retry over timeout  | na      |                                             |
| 7c  | async/await         | pass    |                                             |
| 7d  | eslint              | pass    |                                             |

## Issues

None

## Warnings

None
