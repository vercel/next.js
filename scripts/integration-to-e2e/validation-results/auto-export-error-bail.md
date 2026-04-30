# auto-export-error-bail: PASS

Single-test build-only suite converted cleanly with correct `skipStart` lifecycle and fixtures preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                                           |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                                           |
| 1c  | Test titles         | pass    | Title preserved verbatim                                                                                            |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner prod-mode describe flattened (test is in test/production/)                          |
| 2a  | URL paths           | na      | No HTTP calls                                                                                                       |
| 2b  | Response checks     | na      |                                                                                                                     |
| 2c  | FS checks           | na      |                                                                                                                     |
| 2d  | Browser checks      | na      |                                                                                                                     |
| 2e  | Build output        | pass    | `next.build()` + `cliOutput` replace `nextBuild` stdout/stderr                                                      |
| 2f  | Dynamic logic       | na      | No mode branching                                                                                                   |
| 3a  | nextTestSetup       | pass    | Used from 'e2e-utils'                                                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                  |
| 3c  | skipStart           | pass    | Build-only, `skipStart: true`, uses `next.build()`                                                                  |
| 3d  | No manual lifecycle | pass    | No banned helpers                                                                                                   |
| 3e  | Cleanup             | pass    | No cleanup needed                                                                                                   |
| 4a  | Directory placement | pass    | test/production/ is correct for build-only test                                                                     |
| 4b  | Mode guards         | na      |                                                                                                                     |
| 4c  | Turbopack guards    | na      | Original had no Turbopack-skip (only a TURBOPACK_DEV dedup guard)                                                   |
| 4d  | Dedup guards        | pass    | Original's `TURBOPACK_DEV` guard is effectively redundant once relocated to test/production/ (never runs in dev CI) |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD env checks                                                                         |
| 5a  | render              | na      |                                                                                                                     |
| 5b  | fetch               | na      |                                                                                                                     |
| 5c  | browser             | na      |                                                                                                                     |
| 5d  | check→retry         | na      |                                                                                                                     |
| 5e  | File class          | na      |                                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                                     |
| 5g  | fs operations       | na      |                                                                                                                     |
| 6a  | Fixtures exist      | pass    | pages/app/\_error.js present                                                                                        |
| 6b  | next.config.js      | na      | Original had none                                                                                                   |
| 6c  | Overrides           | na      |                                                                                                                     |
| 7a  | No dead code        | pass    |                                                                                                                     |
| 7b  | retry over timeout  | na      |                                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                                     |

## Issues

None

## Warnings

None
