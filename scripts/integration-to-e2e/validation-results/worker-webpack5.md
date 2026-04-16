# worker-webpack5: PASS

Clean 1:1 conversion of a webpack-only web worker test; the single test now runs in both dev and prod via `nextTestSetup`, matching the original's two describe blocks.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                  |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 it (run in 2 describes), converted: 1 it (runs dev+prod)                                                  |
| 1b  | Assertions          | pass    | original: 2 check() → 2 expect() in converted                                                                         |
| 1c  | Test titles         | pass    | "should pass on both client and worker" preserved                                                                     |
| 1d  | Describe blocks     | pass    | Inner dev/prod describes flattened correctly; nextTestSetup handles mode matrix                                       |
| 2a  | URL paths           | pass    | `/` preserved via next.browser('/')                                                                                   |
| 2b  | Response checks     | pass    | web-status + worker-status assertions preserved                                                                       |
| 2c  | FS checks           | na      |                                                                                                                       |
| 2d  | Browser checks      | pass    | webdriver → next.browser with identical selectors                                                                     |
| 2e  | Build output        | na      |                                                                                                                       |
| 2f  | Dynamic logic       | na      | runTests() had no mode branching                                                                                      |
| 3a  | nextTestSetup       | pass    |                                                                                                                       |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                    |
| 3c  | skipStart           | na      | Not build-only                                                                                                        |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild/killApp                                                                               |
| 3e  | Cleanup             | pass    | No custom cleanup needed                                                                                              |
| 4a  | Directory placement | pass    | test/e2e/ correct — runs in both dev & prod                                                                           |
| 4b  | Mode guards         | na      | Same behavior in both modes                                                                                           |
| 4c  | Turbopack guards    | pass    | IS_TURBOPACK_TEST describe.skip wraps OUTSIDE nextTestSetup                                                           |
| 4d  | Dedup guards        | pass    | Original inner TURBOPACK_DEV/BUILD guards were redundant under the outer IS_TURBOPACK_TEST skip; outer guard suffices |
| 4e  | No incorrect env    | pass    |                                                                                                                       |
| 5a  | render              | na      |                                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                       |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                              |
| 5d  | check→retry         | pass    | Both check() calls converted to retry() + expect().toMatch                                                            |
| 5e  | File class          | na      |                                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                       |
| 5g  | fs operations       | na      |                                                                                                                       |
| 6a  | Fixtures exist      | pass    | pages/index.js, lib/sharedCode.js, lib/worker.js, next.config.js all present                                          |
| 6b  | next.config.js      | pass    | Present in fixture directory                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                       |

## Issues

None

## Warnings

- The converted test declares `dependencies: { faker: '5.5.3' }`, but neither the original nor the fixture files import `faker`. This is harmless but unnecessary — could be removed.
