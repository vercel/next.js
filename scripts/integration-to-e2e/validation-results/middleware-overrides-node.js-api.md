# middleware-overrides-node.js-api: PASS

Clean 1:1 conversion of a single-test development-only suite, with fixtures in place and `waitFor`/manual lifecycle properly migrated to `retry()` + `nextTestSetup`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                          |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                     |
| 1b  | Assertions          | pass    | original: 5, converted: 5                                                                     |
| 1c  | Test titles         | pass    | "does not show a warning and allows overriding" preserved                                     |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner dev-mode describe flattened (expected for dev-only placement) |
| 2a  | URL paths           | pass    | `/` preserved                                                                                 |
| 2b  | Response checks     | pass    | status 200 + cliOutput contains/not.contains preserved                                        |
| 2c  | FS checks           | na      |                                                                                               |
| 2d  | Browser checks      | na      |                                                                                               |
| 2e  | Build output        | na      |                                                                                               |
| 2f  | Dynamic logic       | na      |                                                                                               |
| 3a  | nextTestSetup       | pass    |                                                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                                                            |
| 3c  | skipStart           | na      | Needs server                                                                                  |
| 3d  | No manual lifecycle | pass    | findPort/launchApp/killApp removed                                                            |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                      |
| 4a  | Directory placement | pass    | Original was dev-only (TURBOPACK_BUILD skip) → test/development/ correct                      |
| 4b  | Mode guards         | pass    |                                                                                               |
| 4c  | Turbopack guards    | pass    | Dev-only placement obviates TURBOPACK_BUILD skip                                              |
| 4d  | Dedup guards        | na      |                                                                                               |
| 4e  | No incorrect env    | pass    |                                                                                               |
| 5a  | render              | na      |                                                                                               |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                     |
| 5c  | browser             | na      |                                                                                               |
| 5d  | check→retry         | na      |                                                                                               |
| 5e  | File class          | na      |                                                                                               |
| 5f  | waitFor             | pass    | `waitFor(500)` replaced with `retry()` around cliOutput assertion                             |
| 5g  | fs operations       | na      |                                                                                               |
| 6a  | Fixtures exist      | pass    | middleware.js, pages/index.js present                                                         |
| 6b  | next.config.js      | na      | Original had none                                                                             |
| 6c  | Overrides           | na      |                                                                                               |
| 7a  | No dead code        | pass    |                                                                                               |
| 7b  | retry over timeout  | pass    |                                                                                               |
| 7c  | async/await         | pass    |                                                                                               |
| 7d  | eslint              | pass    |                                                                                               |

## Issues

None

## Warnings

None
