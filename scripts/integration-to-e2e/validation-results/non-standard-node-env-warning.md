# non-standard-node-env-warning: PASS

The conversion preserves all 9 tests, splits dev/prod via `isNextDev` / `isNextStart` guards, and includes the necessary fixture files.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                              |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 9, converted: 9                                                                         |
| 1b  | Assertions          | pass    | original: 9, converted: 10                                                                        |
| 1c  | Test titles         | pass    | All titles preserved verbatim                                                                     |
| 1d  | Describe blocks     | pass    | Original single describe preserved; production sub-describe preserved via `isNextStart` block     |
| 2a  | URL paths           | na      | No HTTP paths tested                                                                              |
| 2b  | Response checks     | pass    | cliOutput assertions preserved                                                                    |
| 2c  | FS checks           | pass    | Uses `next.testDir` + `next.distDir` for dist scan; equivalent to original `appDir/.next`         |
| 2d  | Browser checks      | na      |                                                                                                   |
| 2e  | Build output        | pass    | Uses `next.build()` + `next.cliOutput.slice(start)` for warning check                             |
| 2f  | Dynamic logic       | pass    | `isNextDev` / `isNextStart` guards map correctly                                                  |
| 3a  | nextTestSetup       | pass    | Used throughout                                                                                   |
| 3b  | files param         | pass    | `files: __dirname`                                                                                |
| 3c  | skipStart           | pass    | Build/start tests use `skipStart: true` and invoke `next.build()` / `next.start()` explicitly     |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                                                     |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                          |
| 4a  | Directory placement | pass    | Tests run in both modes → `test/e2e/`, guarded per-mode                                           |
| 4b  | Mode guards         | pass    | Dev-only blocks under `isNextDev`, prod-only under `isNextStart`                                  |
| 4c  | Turbopack guards    | na      | Original `TURBOPACK_DEV` guard was a dedup for prod block; now naturally handled by `isNextStart` |
| 4d  | Dedup guards        | pass    | `isNextStart` replaces the TURBOPACK_DEV-based prod dedup                                         |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` usage                                                        |
| 5a  | render              | na      |                                                                                                   |
| 5b  | fetch               | na      |                                                                                                   |
| 5c  | browser             | na      |                                                                                                   |
| 5d  | check→retry         | na      |                                                                                                   |
| 5e  | File class          | na      |                                                                                                   |
| 5f  | waitFor             | pass    | Original `waitFor(2000)` dropped — cliOutput captured by nextTestSetup makes waiting unnecessary  |
| 5g  | fs operations       | pass    | Uses `path.join(next.testDir, next.distDir)` instead of `appDir/.next`                            |
| 6a  | Fixtures exist      | pass    | pages/index.js, server.js present                                                                 |
| 6b  | next.config.js      | na      | None in original                                                                                  |
| 6c  | Overrides           | pass    | `env`, `startCommand`, `serverReadyPattern`, `dependencies` used appropriately                    |
| 7a  | No dead code        | pass    |                                                                                                   |
| 7b  | retry over timeout  | pass    | No setTimeout                                                                                     |
| 7c  | async/await         | pass    |                                                                                                   |
| 7d  | eslint              | pass    |                                                                                                   |

## Issues

None

## Warnings

None
