All clean.

# file-serving: PASS

All 891 tests preserved verbatim (same titles, same assertions via the `expectStatus` helper) and fixtures are fully migrated; conversion is a faithful port to `nextTestSetup`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                            |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 891, converted: 891                                                                                   |
| 1b  | Assertions          | pass    | both: 10 direct `expect(` (rest via `expectStatus` helper, preserved)                                           |
| 1c  | Test titles         | pass    | diff of sorted titles is empty                                                                                  |
| 1d  | Describe blocks     | pass    | Original's dev/prod describes flattened; mode handled by nextTestSetup                                          |
| 2a  | URL paths           | pass    | `fetchViaHTTP` → `next.fetch` 1:1                                                                               |
| 2b  | Response checks     | pass    | Status/text/header assertions preserved                                                                         |
| 2c  | FS checks           | pass    | Uses `next.testDir` for `.next` copy                                                                            |
| 2d  | Browser checks      | na      | No browser use                                                                                                  |
| 2e  | Build output        | na      |                                                                                                                 |
| 2f  | Dynamic logic       | na      | `runTests()` was identical for both modes                                                                       |
| 3a  | nextTestSetup       | pass    | From `e2e-utils`, `files: __dirname`                                                                            |
| 3b  | files param         | pass    | `__dirname`                                                                                                     |
| 3c  | skipStart           | na      | Full server test                                                                                                |
| 3d  | No manual lifecycle | pass    | No `killApp/findPort/launchApp/nextBuild/nextStart`                                                             |
| 3e  | Cleanup             | pass    | Harness handles cleanup                                                                                         |
| 4a  | Directory placement | pass    | `test/e2e/` runs both dev and start                                                                             |
| 4b  | Mode guards         | na      | Original tests ran identically in both modes                                                                    |
| 4c  | Turbopack guards    | na      | No Turbopack-specific skip                                                                                      |
| 4d  | Dedup guards        | pass    | Original's `TURBOPACK_DEV`/`TURBOPACK_BUILD` guards were mode-skip, handled by e2e's `NEXT_TEST_MODE` selection |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` refs                                                                       |
| 5a  | render              | na      |                                                                                                                 |
| 5b  | fetch               | pass    | All `fetchViaHTTP` migrated                                                                                     |
| 5c  | browser             | na      |                                                                                                                 |
| 5d  | check→retry         | na      |                                                                                                                 |
| 5e  | File class          | na      |                                                                                                                 |
| 5f  | waitFor             | na      |                                                                                                                 |
| 5g  | fs operations       | pass    | `fs.copy` uses `next.testDir`                                                                                   |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `public/`, `static/`, `test-file.txt` all copied                                              |
| 6b  | next.config.js      | na      | Original had none                                                                                               |
| 6c  | Overrides           | na      |                                                                                                                 |
| 7a  | No dead code        | pass    |                                                                                                                 |
| 7b  | retry over timeout  | pass    | No setTimeout                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                 |
| 7d  | eslint              | pass    | Has `jest/no-identical-title` disable as in original                                                            |

## Issues

None

## Warnings

None
