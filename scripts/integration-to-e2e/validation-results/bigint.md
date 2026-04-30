# bigint: PASS

Clean conversion — both tests preserved, fixture copied correctly, dev/prod describe blocks flattened into nextTestSetup which handles mode coverage via the CI matrix.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                   |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 2 (runTests called in 2 describes), converted: 2                                             |
| 1b  | Assertions          | pass    | original: 2, converted: 3                                                                              |
| 1c  | Test titles         | pass    | Both preserved verbatim                                                                                |
| 1d  | Describe blocks     | pass    | dev/prod describes appropriately flattened; nextTestSetup handles modes                                |
| 2a  | URL paths           | pass    | /api/bigint covered                                                                                    |
| 2b  | Response checks     | pass    | status 200 and body '3' preserved                                                                      |
| 2c  | FS checks           | na      |                                                                                                        |
| 2d  | Browser checks      | na      |                                                                                                        |
| 2e  | Build output        | na      |                                                                                                        |
| 2f  | Dynamic logic       | na      | runTests identical for both modes                                                                      |
| 3a  | nextTestSetup       | pass    |                                                                                                        |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                     |
| 3c  | skipStart           | na      | Runtime test                                                                                           |
| 3d  | No manual lifecycle | pass    |                                                                                                        |
| 3e  | Cleanup             | pass    | handled by nextTestSetup                                                                               |
| 4a  | Directory placement | pass    | test/e2e/ runs both dev+prod                                                                           |
| 4b  | Mode guards         | na      | Identical behavior                                                                                     |
| 4c  | Turbopack guards    | na      |                                                                                                        |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_BUILD/TURBOPACK_DEV split becomes unnecessary — e2e harness runs file once per mode |
| 4e  | No incorrect env    | pass    |                                                                                                        |
| 5a  | render              | na      |                                                                                                        |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                              |
| 5c  | browser             | na      |                                                                                                        |
| 5d  | check→retry         | na      |                                                                                                        |
| 5e  | File class          | na      |                                                                                                        |
| 5f  | waitFor             | na      |                                                                                                        |
| 5g  | fs operations       | na      | fs.remove(nextConfig) dropped (no file existed)                                                        |
| 6a  | Fixtures exist      | pass    | pages/api/bigint.js present                                                                            |
| 6b  | next.config.js      | na      | None in original directory                                                                             |
| 6c  | Overrides           | na      |                                                                                                        |
| 7a  | No dead code        | pass    |                                                                                                        |
| 7b  | retry over timeout  | pass    |                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                        |

## Issues

None

## Warnings

None
