# webpack-config-mainjs: PASS

Clean 1:1 conversion of a build-only webpack test to nextTestSetup with skipStart.

## Criteria

| #   | Criterion           | Verdict | Note                                                              |
| --- | ------------------- | ------- | ----------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                         |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                         |
| 1c  | Test titles         | pass    | Preserved verbatim                                                |
| 1d  | Describe blocks     | pass    | Single describe preserved                                         |
| 2a  | URL paths           | na      | Build-only                                                        |
| 2b  | Response checks     | na      |                                                                   |
| 2c  | FS checks           | na      |                                                                   |
| 2d  | Browser checks      | na      |                                                                   |
| 2e  | Build output        | pass    | next.build() exitCode checked                                     |
| 2f  | Dynamic logic       | na      |                                                                   |
| 3a  | nextTestSetup       | pass    |                                                                   |
| 3b  | files param         | pass    | files: \_\_dirname                                                |
| 3c  | skipStart           | pass    | Build-only, skipStart: true                                       |
| 3d  | No manual lifecycle | pass    |                                                                   |
| 3e  | Cleanup             | na      |                                                                   |
| 4a  | Directory placement | pass    | test/production/ suitable                                         |
| 4b  | Mode guards         | na      |                                                                   |
| 4c  | Turbopack guards    | pass    | Correct outer `IS_TURBOPACK_TEST ? describe.skip : describe` wrap |
| 4d  | Dedup guards        | na      |                                                                   |
| 4e  | No incorrect env    | pass    |                                                                   |
| 5a  | render              | na      |                                                                   |
| 5b  | fetch               | na      |                                                                   |
| 5c  | browser             | na      |                                                                   |
| 5d  | check→retry         | na      |                                                                   |
| 5e  | File class          | na      |                                                                   |
| 5f  | waitFor             | na      |                                                                   |
| 5g  | fs operations       | na      |                                                                   |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/static.js, client/polyfills.js all present  |
| 6b  | next.config.js      | pass    | Present                                                           |
| 6c  | Overrides           | na      |                                                                   |
| 7a  | No dead code        | pass    |                                                                   |
| 7b  | retry over timeout  | na      |                                                                   |
| 7c  | async/await         | pass    |                                                                   |
| 7d  | eslint              | pass    |                                                                   |

## Issues

None

## Warnings

None
