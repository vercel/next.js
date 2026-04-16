All fixtures match. 16 tests in both. Same assertions and URLs. No turbopack-specific skip needed since the original dedup guards (`TURBOPACK_BUILD`/`TURBOPACK_DEV`) are handled automatically by the e2e test framework.

# route-indexes: PASS

Clean conversion — all 16 tests preserved with matching assertions and fixture files present.

## Criteria

| #   | Criterion           | Verdict | Note                                                      |
| --- | ------------------- | ------- | --------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 16, converted: 16                               |
| 1b  | Assertions          | pass    | original: 32, converted: 32                               |
| 1c  | Test titles         | pass    | All preserved verbatim                                    |
| 1d  | Describe blocks     | pass    | dev/prod describes flattened; e2e runs both modes         |
| 2a  | URL paths           | pass    | All 16 paths mirrored                                     |
| 2b  | Response checks     | pass    | status + text checks preserved                            |
| 2c  | FS checks           | na      |                                                           |
| 2d  | Browser checks      | na      |                                                           |
| 2e  | Build output        | na      |                                                           |
| 2f  | Dynamic logic       | na      | runTests had no mode branching                            |
| 3a  | nextTestSetup       | pass    |                                                           |
| 3b  | files param         | pass    | files: \_\_dirname                                        |
| 3c  | skipStart           | na      | server-based test                                         |
| 3d  | No manual lifecycle | pass    |                                                           |
| 3e  | Cleanup             | pass    | handled by nextTestSetup                                  |
| 4a  | Directory placement | pass    | test/e2e/ (runs both dev & prod)                          |
| 4b  | Mode guards         | na      |                                                           |
| 4c  | Turbopack guards    | na      | original dedup guards, not turbopack-skip                 |
| 4d  | Dedup guards        | pass    | e2e harness handles dedup automatically                   |
| 4e  | No incorrect env    | pass    |                                                           |
| 5a  | render              | na      | used fetch only                                           |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                 |
| 5c  | browser             | na      |                                                           |
| 5d  | check→retry         | na      |                                                           |
| 5e  | File class          | na      |                                                           |
| 5f  | waitFor             | na      |                                                           |
| 5g  | fs operations       | na      |                                                           |
| 6a  | Fixtures exist      | pass    | pages/index.js, sub/, nested-index/, api/sub/ all present |
| 6b  | next.config.js      | na      | original had none                                         |
| 6c  | Overrides           | na      |                                                           |
| 7a  | No dead code        | pass    |                                                           |
| 7b  | retry over timeout  | na      |                                                           |
| 7c  | async/await         | pass    |                                                           |
| 7d  | eslint              | pass    |                                                           |

## Issues

None

## Warnings

None
