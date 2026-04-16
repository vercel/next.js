# babel-custom: PASS

Clean conversion: 4 build-only tests preserved across 4 describe blocks with matching fixtures.

## Criteria

| #   | Criterion           | Verdict | Note                                                           |
| --- | ------------------- | ------- | -------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 4, converted: 4                                      |
| 1b  | Assertions          | pass    | original: 0 expect calls, converted: 4 (added exitCode checks) |
| 1c  | Test titles         | pass    | All 4 titles preserved verbatim                                |
| 1d  | Describe blocks     | pass    | Single describe split into 4 (needed for per-fixture setup)    |
| 2a  | URL paths           | na      | No HTTP requests                                               |
| 2b  | Response checks     | na      |                                                                |
| 2c  | FS checks           | na      |                                                                |
| 2d  | Browser checks      | na      |                                                                |
| 2e  | Build output        | pass    | Uses `next.build()` and asserts `exitCode === 0`               |
| 2f  | Dynamic logic       | na      |                                                                |
| 3a  | nextTestSetup       | pass    |                                                                |
| 3b  | files param         | pass    | `path.join(__dirname, 'fixtures/...')`                         |
| 3c  | skipStart           | pass    | Build-only, `skipStart: true` and explicit `next.build()`      |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`launchApp` imports                             |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                       |
| 4a  | Directory placement | pass    | `test/production/` correct for build-only                      |
| 4b  | Mode guards         | na      |                                                                |
| 4c  | Turbopack guards    | na      |                                                                |
| 4d  | Dedup guards        | na      |                                                                |
| 4e  | No incorrect env    | pass    |                                                                |
| 5a  | render              | na      |                                                                |
| 5b  | fetch               | na      |                                                                |
| 5c  | browser             | na      |                                                                |
| 5d  | check→retry         | na      |                                                                |
| 5e  | File class          | na      |                                                                |
| 5f  | waitFor             | na      |                                                                |
| 5g  | fs operations       | na      |                                                                |
| 6a  | Fixtures exist      | pass    | All 4 fixtures with `.babelrc` and `pages/index.js` present    |
| 6b  | next.config.js      | na      | Original had none                                              |
| 6c  | Overrides           | na      |                                                                |
| 7a  | No dead code        | pass    |                                                                |
| 7b  | retry over timeout  | na      |                                                                |
| 7c  | async/await         | pass    |                                                                |
| 7d  | eslint              | pass    |                                                                |

## Issues

None

## Warnings

None
