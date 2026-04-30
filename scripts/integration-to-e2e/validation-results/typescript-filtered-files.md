# typescript-filtered-files: PASS

Clean conversion; single build-only test preserved with `skipStart` and `next.build()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                        |
| --- | ------------------- | ------- | --------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 (+1 defensive skip placeholder)                   |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                   |
| 1c  | Test titles         | pass    | "should fail to build..." preserved                                         |
| 1d  | Describe blocks     | pass    | Both describe levels preserved                                              |
| 2a  | URL paths           | na      | No HTTP requests                                                            |
| 2b  | Response checks     | na      |                                                                             |
| 2c  | FS checks           | na      |                                                                             |
| 2d  | Browser checks      | na      |                                                                             |
| 2e  | Build output        | pass    | `nextBuild` stdout/stderr/code → `next.cliOutput` and `exitCode`            |
| 2f  | Dynamic logic       | na      |                                                                             |
| 3a  | nextTestSetup       | pass    |                                                                             |
| 3b  | files param         | pass    | `files: __dirname`                                                          |
| 3c  | skipStart           | pass    | Build-only; uses `skipStart: true` + `next.build()`                         |
| 3d  | No manual lifecycle | pass    |                                                                             |
| 3e  | Cleanup             | pass    |                                                                             |
| 4a  | Directory placement | pass    | test/production/ correct for build-only                                     |
| 4b  | Mode guards         | pass    |                                                                             |
| 4c  | Turbopack guards    | na      | Original `TURBOPACK_DEV` guard moot now that test lives in test/production/ |
| 4d  | Dedup guards        | na      |                                                                             |
| 4e  | No incorrect env    | pass    |                                                                             |
| 5a  | render              | na      |                                                                             |
| 5b  | fetch               | na      |                                                                             |
| 5c  | browser             | na      |                                                                             |
| 5d  | check→retry         | na      |                                                                             |
| 5e  | File class          | na      |                                                                             |
| 5f  | waitFor             | na      |                                                                             |
| 5g  | fs operations       | na      |                                                                             |
| 6a  | Fixtures exist      | pass    | pages/contest.tsx, tsconfig.json present                                    |
| 6b  | next.config.js      | na      | Original had none                                                           |
| 6c  | Overrides           | na      |                                                                             |
| 7a  | No dead code        | warn    | `if (!isNextStart)` branch is unreachable in test/production/               |
| 7b  | retry over timeout  | na      |                                                                             |
| 7c  | async/await         | pass    |                                                                             |
| 7d  | eslint              | pass    |                                                                             |

## Issues

None

## Warnings

- The `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` block inside the describe is dead code since tests in `test/production/` always run in start mode. Safe to remove for cleaner output.
