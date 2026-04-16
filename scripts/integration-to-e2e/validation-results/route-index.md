# route-index: PASS

Clean, faithful conversion: all 5 tests and 10 assertions preserved, fixtures intact, APIs properly migrated.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                  |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5, converted: 5                                                                                                                                             |
| 1b  | Assertions          | pass    | original: 10, converted: 10                                                                                                                                           |
| 1c  | Test titles         | pass    | All 5 preserved verbatim                                                                                                                                              |
| 1d  | Describe blocks     | pass    | dev/prod describes flattened; nextTestSetup handles both modes                                                                                                        |
| 2a  | URL paths           | pass    | /, /index, /index/index, encoded query variants all preserved                                                                                                         |
| 2b  | Response checks     | pass    | status + text body assertions preserved                                                                                                                               |
| 2c  | FS checks           | na      |                                                                                                                                                                       |
| 2d  | Browser checks      | na      |                                                                                                                                                                       |
| 2e  | Build output        | na      |                                                                                                                                                                       |
| 2f  | Dynamic logic       | pass    | runTests() inlined; same tests run in both modes via setup                                                                                                            |
| 3a  | nextTestSetup       | pass    | Imports from 'e2e-utils'                                                                                                                                              |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                                    |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                                        |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/etc.                                                                                                                                            |
| 3e  | Cleanup             | pass    | No manual cleanup needed                                                                                                                                              |
| 4a  | Directory placement | pass    | test/e2e/ correct (ran in both dev + prod)                                                                                                                            |
| 4b  | Mode guards         | na      | Same behavior in both modes                                                                                                                                           |
| 4c  | Turbopack guards    | na      | Original used dedup guards, not skip guards                                                                                                                           |
| 4d  | Dedup guards        | warn    | Original had TURBOPACK_BUILD/TURBOPACK_DEV dedup guards; not carried over, but nextTestSetup in test/e2e/ is driven by NEXT_TEST_MODE so CI-level dedup replaces this |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                       |
| 5a  | render              | na      |                                                                                                                                                                       |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch (query params inline in URL)                                                                                                                |
| 5c  | browser             | na      |                                                                                                                                                                       |
| 5d  | check→retry         | na      |                                                                                                                                                                       |
| 5e  | File class          | na      |                                                                                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                                                                       |
| 5g  | fs operations       | na      |                                                                                                                                                                       |
| 6a  | Fixtures exist      | pass    | pages/index/index.js present (matches original)                                                                                                                       |
| 6b  | next.config.js      | pass    | Neither original nor converted have one                                                                                                                               |
| 6c  | Overrides           | na      |                                                                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                                                                       |
| 7b  | retry over timeout  | na      |                                                                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                                                                       |

## Issues

None

## Warnings

- 4d: Original dedup guards (`TURBOPACK_BUILD`/`TURBOPACK_DEV`) weren't ported, but this is expected — `nextTestSetup` in `test/e2e/` relies on `NEXT_TEST_MODE`/CI-level mode selection, so the manual per-describe guards are no longer needed.
