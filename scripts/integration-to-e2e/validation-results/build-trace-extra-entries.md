# build-trace-extra-entries: PASS

Direct 1:1 conversion using `nextTestSetup` with `skipStart: true`, preserving all assertions and the Turbopack-specific guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                   |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 (plus no-op skip)                                            |
| 1b  | Assertions          | pass    | original: 22, converted: 22                                                            |
| 1c  | Test titles         | pass    | "should build and trace correctly" preserved                                           |
| 1d  | Describe blocks     | pass    | Outer + "production mode" preserved                                                    |
| 2a  | URL paths           | na      | No HTTP paths                                                                          |
| 2b  | Response checks     | na      |                                                                                        |
| 2c  | FS checks           | pass    | Uses `next.readFile()` for all `.nft.json` reads                                       |
| 2d  | Browser checks      | na      |                                                                                        |
| 2e  | Build output        | pass    | `next.build()` + `exitCode` check                                                      |
| 2f  | Dynamic logic       | na      |                                                                                        |
| 3a  | nextTestSetup       | pass    |                                                                                        |
| 3b  | files param         | pass    | `path.join(__dirname, 'app')`                                                          |
| 3c  | skipStart           | pass    | Build-only, uses `skipStart: true`                                                     |
| 3d  | No manual lifecycle | pass    |                                                                                        |
| 3e  | Cleanup             | pass    | None needed                                                                            |
| 4a  | Directory placement | pass    | `test/production/` matches prod-only original                                          |
| 4b  | Mode guards         | pass    | `isNextStart` skip                                                                     |
| 4c  | Turbopack guards    | pass    | `if (!isTurbopack)` around webpack-only assertions                                     |
| 4d  | Dedup guards        | pass    | `TURBOPACK_DEV` dedup implicit via `test/production/` placement + `isNextStart` skip   |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack` from setup                                                          |
| 5a  | render              | na      |                                                                                        |
| 5b  | fetch               | na      |                                                                                        |
| 5c  | browser             | na      |                                                                                        |
| 5d  | check→retry         | na      |                                                                                        |
| 5e  | File class          | na      |                                                                                        |
| 5f  | waitFor             | na      |                                                                                        |
| 5g  | fs operations       | pass    | `fs.readJSON` → `JSON.parse(await next.readFile(...))`                                 |
| 6a  | Fixtures exist      | pass    | app, pages, next.config.js, include-me, lib, node_modules, public, content all present |
| 6b  | next.config.js      | pass    | Present in fixture                                                                     |
| 6c  | Overrides           | na      |                                                                                        |
| 7a  | No dead code        | pass    |                                                                                        |
| 7b  | retry over timeout  | na      |                                                                                        |
| 7c  | async/await         | pass    |                                                                                        |
| 7d  | eslint              | pass    |                                                                                        |

## Issues

None.

## Warnings

None.
