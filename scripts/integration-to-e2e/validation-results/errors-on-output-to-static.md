# errors-on-output-to-static: PASS

Faithful 1:1 conversion of a single build-only test; lifecycle, fixtures, and assertion preserved correctly.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                            |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                       |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                       |
| 1c  | Test titles         | pass    | "Throws error when export out dir is static" preserved                                          |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner "production mode" flattened since test/production/ is prod-only |
| 2a  | URL paths           | na      | No HTTP calls                                                                                   |
| 2b  | Response checks     | na      |                                                                                                 |
| 2c  | FS checks           | na      |                                                                                                 |
| 2d  | Browser checks      | na      |                                                                                                 |
| 2e  | Build output        | pass    | `nextBuild` stdout+stderr → `next.cliOutput`, same regex                                        |
| 2f  | Dynamic logic       | na      |                                                                                                 |
| 3a  | nextTestSetup       | pass    |                                                                                                 |
| 3b  | files param         | pass    | `files: __dirname`                                                                              |
| 3c  | skipStart           | pass    | Build-only test, `skipStart: true` with explicit `next.build()`                                 |
| 3d  | No manual lifecycle | pass    |                                                                                                 |
| 3e  | Cleanup             | pass    |                                                                                                 |
| 4a  | Directory placement | pass    | Build-failure test → `test/production/` correct                                                 |
| 4b  | Mode guards         | pass    | Prod-only via directory                                                                         |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV` guard was a dedup for dev mode; unnecessary in test/production/        |
| 4d  | Dedup guards        | na      |                                                                                                 |
| 4e  | No incorrect env    | pass    |                                                                                                 |
| 5a  | render              | na      |                                                                                                 |
| 5b  | fetch               | na      |                                                                                                 |
| 5c  | browser             | na      |                                                                                                 |
| 5d  | check→retry         | na      |                                                                                                 |
| 5e  | File class          | na      |                                                                                                 |
| 5f  | waitFor             | na      |                                                                                                 |
| 5g  | fs operations       | na      |                                                                                                 |
| 6a  | Fixtures exist      | pass    | pages/index.js, next.config.js present                                                          |
| 6b  | next.config.js      | pass    | Copied from original                                                                            |
| 6c  | Overrides           | na      |                                                                                                 |
| 7a  | No dead code        | pass    |                                                                                                 |
| 7b  | retry over timeout  | na      |                                                                                                 |
| 7c  | async/await         | pass    |                                                                                                 |
| 7d  | eslint              | pass    |                                                                                                 |

## Issues

None

## Warnings

None
