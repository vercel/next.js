# custom-error: PASS

All 4 tests preserved with equivalent assertions; mode guards correctly map original describe blocks to `isNextDev`/`isNextStart`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                     |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5 `it()`, converted: 5 `it()`                                                  |
| 1b  | Assertions          | pass    | original: 9 expects, converted: 9 expects                                                |
| 1c  | Test titles         | pass    | All 5 titles preserved verbatim                                                          |
| 1d  | Describe blocks     | pass    | Inner describes flattened to mode guards (standard pattern)                              |
| 2a  | URL paths           | pass    | `/404` and `/` both preserved                                                            |
| 2b  | Response checks     | pass    | HTML content checks and cliOutput matches preserved                                      |
| 2c  | FS checks           | pass    | `fs.writeFile`/`fs.remove` → `next.patchFile`/`next.deleteFile`                          |
| 2d  | Browser checks      | na      | No webdriver used                                                                        |
| 2e  | Build output        | pass    | Original `buildOutput` → `next.cliOutput` for /\_error assertion                         |
| 2f  | Dynamic logic       | pass    | Dev-only vs prod-only split via `isNextDev`/`isNextStart`                                |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                       |
| 3c  | skipStart           | na      | Runs dev + start normally                                                                |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild/killApp                                                  |
| 3e  | Cleanup             | pass    | `finally` block uses `next.deleteFile`                                                   |
| 4a  | Directory placement | pass    | `test/e2e/` correct (both dev and prod)                                                  |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` used                                                           |
| 4c  | Turbopack guards    | na      | No top-level turbopack skip                                                              |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV` skip is implicitly handled by `isNextStart`                     |
| 4e  | No incorrect env    | pass    | No env checks used                                                                       |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                          |
| 5b  | fetch               | na      | Not used                                                                                 |
| 5c  | browser             | na      | Not used                                                                                 |
| 5d  | check→retry         | na      | Original already used `retry`                                                            |
| 5e  | File class          | na      | Not used                                                                                 |
| 5f  | waitFor             | pass    | `waitFor(1000)` patchFileDelay dropped — acceptable since subsequent test uses `retry()` |
| 5g  | fs operations       | pass    | `fs.writeFile`/`fs.remove` → `next.patchFile`/`next.deleteFile`                          |
| 6a  | Fixtures exist      | pass    | pages/\_error.js and pages/index.js present                                              |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                           |
| 6c  | Overrides           | na      | None used                                                                                |
| 7a  | No dead code        | pass    | Clean                                                                                    |
| 7b  | retry over timeout  | pass    | Uses `retry()`                                                                           |
| 7c  | async/await         | pass    | All awaited                                                                              |
| 7d  | eslint              | pass    | Clean                                                                                    |

## Issues

None

## Warnings

- The final test `"renders custom _error successfully"` was in the original's `production mode` describe but in the converted file it sits outside `if (isNextStart)`, so it now runs in both dev and prod. This is an expansion of coverage rather than a regression, but worth noting.
