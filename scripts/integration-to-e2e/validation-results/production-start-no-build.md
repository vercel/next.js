# production-start-no-build: PASS

Single-test conversion correctly preserves the "no production build" error check using `skipStart` + `next.start({ skipBuild: true })` + `cliOutput`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                     |
| --- | ------------------- | ------- | ------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                |
| 1c  | Test titles         | pass    | Preserved verbatim                                                       |
| 1d  | Describe blocks     | pass    | Single describe preserved                                                |
| 2a  | URL paths           | na      | No HTTP requests                                                         |
| 2b  | Response checks     | na      |                                                                          |
| 2c  | FS checks           | na      |                                                                          |
| 2d  | Browser checks      | na      |                                                                          |
| 2e  | Build output        | pass    | Uses `next.cliOutput` to match error string                              |
| 2f  | Dynamic logic       | na      |                                                                          |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                        |
| 3b  | files param         | pass    | files: \_\_dirname                                                       |
| 3c  | skipStart           | pass    | skipStart: true with manual `next.start({ skipBuild: true })`            |
| 3d  | No manual lifecycle | pass    | No banned imports                                                        |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                 |
| 4a  | Directory placement | pass    | test/production/ correct — original forced `dev: false`                  |
| 4b  | Mode guards         | pass    | `isNextStart` guard used                                                 |
| 4c  | Turbopack guards    | na      |                                                                          |
| 4d  | Dedup guards        | na      |                                                                          |
| 4e  | No incorrect env    | pass    |                                                                          |
| 5a  | render              | na      |                                                                          |
| 5b  | fetch               | na      |                                                                          |
| 5c  | browser             | na      |                                                                          |
| 5d  | check→retry         | na      |                                                                          |
| 5e  | File class          | na      |                                                                          |
| 5f  | waitFor             | na      |                                                                          |
| 5g  | fs operations       | na      |                                                                          |
| 6a  | Fixtures exist      | pass    | next.config.js present                                                   |
| 6b  | next.config.js      | pass    | Copied from original                                                     |
| 6c  | Overrides           | na      |                                                                          |
| 7a  | No dead code        | pass    |                                                                          |
| 7b  | retry over timeout  | na      |                                                                          |
| 7c  | async/await         | pass    | `.catch(() => {})` swallows expected throw before asserting on cliOutput |
| 7d  | eslint              | pass    |                                                                          |

## Issues

None

## Warnings

None
