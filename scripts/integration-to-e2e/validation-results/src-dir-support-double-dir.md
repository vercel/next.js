# src-dir-support-double-dir: PASS

Clean, faithful conversion — both tests, assertions, and fixtures are preserved with proper API migration.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                    |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                               |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                               |
| 1c  | Test titles         | pass    | "should render not render from src/pages" cleaned to "should not render from src/pages" (minor wording) |
| 1d  | Describe blocks     | pass    | Dev/prod describes collapsed into single describe (nextTestSetup handles modes)                         |
| 2a  | URL paths           | pass    | `/` and `/hello` both covered                                                                           |
| 2b  | Response checks     | pass    | Both `toMatch` assertions preserved                                                                     |
| 2c  | FS checks           | na      |                                                                                                         |
| 2d  | Browser checks      | na      |                                                                                                         |
| 2e  | Build output        | na      |                                                                                                         |
| 2f  | Dynamic logic       | pass    | `runTests(dev)` body inlined; no mode-specific behavior existed                                         |
| 3a  | nextTestSetup       | pass    | Used with files: \_\_dirname                                                                            |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                      |
| 3c  | skipStart           | na      | Runs server in both dev and prod                                                                        |
| 3d  | No manual lifecycle | pass    |                                                                                                         |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                |
| 4a  | Directory placement | pass    | test/e2e/ runs both dev and prod, matching original coverage                                            |
| 4b  | Mode guards         | pass    | Both tests run in both modes, identical to original                                                     |
| 4c  | Turbopack guards    | na      | Original had no turbopack-only/webpack-only guards                                                      |
| 4d  | Dedup guards        | pass    | Original's TURBOPACK_DEV/TURBOPACK_BUILD dedup is now handled by NEXT_TEST_MODE in CI                   |
| 4e  | No incorrect env    | pass    | No TURBOPACK\_\* env usage in converted                                                                 |
| 5a  | render              | pass    | renderViaHTTP → next.render()                                                                           |
| 5b  | fetch               | na      |                                                                                                         |
| 5c  | browser             | na      |                                                                                                         |
| 5d  | check→retry         | na      |                                                                                                         |
| 5e  | File class          | na      |                                                                                                         |
| 5f  | waitFor             | na      |                                                                                                         |
| 5g  | fs operations       | na      |                                                                                                         |
| 6a  | Fixtures exist      | pass    | pages/index.js, src/pages/index.js, src/pages/hello.js all present                                      |
| 6b  | next.config.js      | na      | Original had none                                                                                       |
| 6c  | Overrides           | na      |                                                                                                         |
| 7a  | No dead code        | pass    |                                                                                                         |
| 7b  | retry over timeout  | pass    |                                                                                                         |
| 7c  | async/await         | pass    |                                                                                                         |
| 7d  | eslint              | pass    |                                                                                                         |

## Issues

None

## Warnings

None
