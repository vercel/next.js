# export-getInitialProps-warn: PASS

Clean conversion of a single build-only test; fixtures and assertion preserved correctly.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                           |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                      |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                                      |
| 1c  | Test titles         | pass    | "should show warning with next export" preserved                                                               |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner "production mode" flattened (placement in test/production/ makes it redundant) |
| 2a  | URL paths           | na      | No HTTP requests                                                                                               |
| 2b  | Response checks     | na      |                                                                                                                |
| 2c  | FS checks           | na      |                                                                                                                |
| 2d  | Browser checks      | na      |                                                                                                                |
| 2e  | Build output        | pass    | `nextBuild(...).stderr` → `next.cliOutput` after `next.build()`                                                |
| 2f  | Dynamic logic       | na      |                                                                                                                |
| 3a  | nextTestSetup       | pass    |                                                                                                                |
| 3b  | files param         | pass    | `files: __dirname`                                                                                             |
| 3c  | skipStart           | pass    | Build-only; `skipStart: true` + explicit `next.build()`                                                        |
| 3d  | No manual lifecycle | pass    |                                                                                                                |
| 3e  | Cleanup             | pass    | None needed                                                                                                    |
| 4a  | Directory placement | pass    | test/production/ correct for prod build–only test                                                              |
| 4b  | Mode guards         | na      |                                                                                                                |
| 4c  | Turbopack guards    | na      | Original `TURBOPACK_DEV` skip was a dedup guard; test/production/ placement handles it                         |
| 4d  | Dedup guards        | pass    | Naturally handled by directory placement                                                                       |
| 4e  | No incorrect env    | pass    |                                                                                                                |
| 5a  | render              | na      |                                                                                                                |
| 5b  | fetch               | na      |                                                                                                                |
| 5c  | browser             | na      |                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                |
| 5e  | File class          | na      |                                                                                                                |
| 5f  | waitFor             | na      |                                                                                                                |
| 5g  | fs operations       | na      |                                                                                                                |
| 6a  | Fixtures exist      | pass    | pages/index.js, next.config.js present                                                                         |
| 6b  | next.config.js      | pass    | Copied from original                                                                                           |
| 6c  | Overrides           | na      |                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                |
| 7b  | retry over timeout  | na      |                                                                                                                |
| 7c  | async/await         | pass    |                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                |

## Issues

None

## Warnings

None
