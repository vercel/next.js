# edge-runtime-response-error: WARN

Conversion preserves coverage through e2e mode-matrix execution, but drops the explicit TURBOPACK_DEV dedup guard and merges per-mode test titles.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                   |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------- |
| 1a  | Test count          | warn    | original: 4 (2 dev + 2 prod); converted: 2 (covers both via e2e mode matrix)           |
| 1b  | Assertions          | warn    | original: 8; converted: 4 (but runs twice across dev/prod)                             |
| 1c  | Test titles         | warn    | "dev test"/"build test" merged into "test Response"                                    |
| 1d  | Describe blocks     | pass    | Inner "production mode" describe collapsed (now mode-matrix)                           |
| 2a  | URL paths           | pass    | /api/route and / both covered                                                          |
| 2b  | Response checks     | pass    | status 500 + stderr message preserved (via next.cliOutput)                             |
| 2c  | FS checks           | na      |                                                                                        |
| 2d  | Browser checks      | na      |                                                                                        |
| 2e  | Build output        | pass    | e2e runs build in prod mode automatically                                              |
| 2f  | Dynamic logic       | pass    | dev/prod split handled by e2e matrix                                                   |
| 3a  | nextTestSetup       | pass    |                                                                                        |
| 3b  | files param         | pass    | files: \_\_dirname                                                                     |
| 3c  | skipStart           | na      | Not build-only                                                                         |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/etc.                                                               |
| 3e  | Cleanup             | pass    | File restore no longer needed (isolated copy)                                          |
| 4a  | Directory placement | pass    | test/e2e/ — covers both dev and prod                                                   |
| 4b  | Mode guards         | pass    | No per-mode branch needed; same assertions apply                                       |
| 4c  | Turbopack guards    | na      |                                                                                        |
| 4d  | Dedup guards        | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip` for prod block; not preserved |
| 4e  | No incorrect env    | pass    |                                                                                        |
| 5a  | render              | na      |                                                                                        |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                              |
| 5c  | browser             | na      |                                                                                        |
| 5d  | check→retry         | na      |                                                                                        |
| 5e  | File class          | na      | File restore dropped (isolated fs)                                                     |
| 5f  | waitFor             | na      |                                                                                        |
| 5g  | fs operations       | pass    | remove(.next) dropped; isolated dir handles it                                         |
| 6a  | Fixtures exist      | pass    | lib.js, middleware.js, pages/api/route.js, pages/index.js                              |
| 6b  | next.config.js      | na      | None in original                                                                       |
| 6c  | Overrides           | na      |                                                                                        |
| 7a  | No dead code        | pass    |                                                                                        |
| 7b  | retry over timeout  | pass    |                                                                                        |
| 7c  | async/await         | pass    |                                                                                        |
| 7d  | eslint              | pass    |                                                                                        |

## Issues

None.

## Warnings

- Test count reduced from 4 to 2; coverage is preserved only because e2e runs both dev and prod modes in CI. Equivalent, but noticeable.
- Titles collapsed ("dev test Response"/"build test Response" → "test Response") — acceptable under mode matrix.
- Original `process.env.TURBOPACK_DEV ? describe.skip` dedup guard for production mode is not reproduced. If CI runs this suite under both `TURBOPACK_DEV=1` + prod matrix and `TURBOPACK_BUILD=1` + dev matrix, redundant runs may occur. Consider a `(isNextStart && process.env.TURBOPACK_DEV)` skip if that was the intent.
- Assertion source changed from `context.logs.stderr` to `next.cliOutput` (combined stdout+stderr) — still matches the error string, so functionally equivalent.
