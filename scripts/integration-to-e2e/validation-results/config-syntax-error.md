# config-syntax-error: PASS

Clean 2-test conversion from `nextBuild`/`fs.writeFile` to `next.build()`/`next.patchFile()` with `skipStart: true`; all assertions and titles preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                 |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                            |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                            |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                       |
| 1d  | Describe blocks     | pass    | `Invalid config syntax` > `production mode` preserved                                |
| 2a  | URL paths           | na      | No HTTP in original                                                                  |
| 2b  | Response checks     | na      |                                                                                      |
| 2c  | FS checks           | pass    | `fs.writeFile`→`next.patchFile`; cleanup no longer needed (isolated dir)             |
| 2d  | Browser checks      | na      |                                                                                      |
| 2e  | Build output        | pass    | `stderr` from `nextBuild` → `next.cliOutput` after `next.build()`                    |
| 2f  | Dynamic logic       | na      |                                                                                      |
| 3a  | nextTestSetup       | pass    |                                                                                      |
| 3b  | files param         | pass    | `files: __dirname`                                                                   |
| 3c  | skipStart           | pass    | Build-only test; `skipStart: true` + explicit `next.build()`                         |
| 3d  | No manual lifecycle | pass    |                                                                                      |
| 3e  | Cleanup             | pass    | Isolated dir; no manual `fs.remove` needed                                           |
| 4a  | Directory placement | pass    | `test/production/` matches prod-only original                                        |
| 4b  | Mode guards         | pass    | Uses `isNextStart` guard                                                             |
| 4c  | Turbopack guards    | pass    | Not needed — placement in `test/production/` replaces original `TURBOPACK_DEV` guard |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV` dedup achieved by directory placement                       |
| 4e  | No incorrect env    | pass    |                                                                                      |
| 5a  | render              | na      |                                                                                      |
| 5b  | fetch               | na      |                                                                                      |
| 5c  | browser             | na      |                                                                                      |
| 5d  | check→retry         | na      |                                                                                      |
| 5e  | File class          | na      |                                                                                      |
| 5f  | waitFor             | na      |                                                                                      |
| 5g  | fs operations       | pass    | `fs.writeFile(appDir,...)` → `next.patchFile()`                                      |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                                             |
| 6b  | next.config.js      | pass    | Original also had none (written per-test); converted matches                         |
| 6c  | Overrides           | na      |                                                                                      |
| 7a  | No dead code        | pass    |                                                                                      |
| 7b  | retry over timeout  | na      | No polling needed                                                                    |
| 7c  | async/await         | pass    |                                                                                      |
| 7d  | eslint              | pass    |                                                                                      |

## Issues

None

## Warnings

None
