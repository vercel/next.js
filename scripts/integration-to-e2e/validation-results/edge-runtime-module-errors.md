# edge-runtime-module-errors: PASS

The conversion preserves all 18 `it` blocks (×2 via `describe.each` = 36 runs) across dev and prod modes with equivalent behavior and proper isolation via `nextTestSetup`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                   |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 18 it (36 w/ variants), converted: 18 it (36 w/ variants)                                                                    |
| 1b  | Assertions          | pass    | converted adds cliOutput assertions; count >= original                                                                                 |
| 1c  | Test titles         | pass    | Minor wording changes (e.g., "prints error on logs" → "prints warning in build"; "in dev" removed) — allowed                           |
| 1d  | Describe blocks     | pass    | Original dev/prod describes inverted to top-level `isNextDev`/`isNextStart` blocks; all 9 scenarios preserved                          |
| 2a  | URL paths           | pass    | `/api/route` and `/` both hit via `next.fetch()`                                                                                       |
| 2b  | Response checks     | pass    | status + headers + body text preserved                                                                                                 |
| 2c  | FS checks           | pass    | Uses `next.readFile` / `next.patchFile` instead of `File` class + appDir fs                                                            |
| 2d  | Browser checks      | na      | No browser usage                                                                                                                       |
| 2e  | Build output        | pass    | `next.build()` + `cliOutput` + `exitCode` equivalents                                                                                  |
| 2f  | Dynamic logic       | pass    | Mode-specific branches mapped to `isNextDev`/`isNextStart`; inner `isTurbopack` guard preserved for block 1                            |
| 3a  | nextTestSetup       | pass    | Both dev and prod blocks use it                                                                                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                     |
| 3c  | skipStart           | pass    | prod block uses `skipStart: true` + manual `next.build()`/`next.start()`                                                               |
| 3d  | No manual lifecycle | pass    | No forbidden `launchApp`/`nextBuild`/`nextStart` imports                                                                               |
| 3e  | Cleanup             | pass    | `afterEach` restores file contents; prod calls `next.stop()` before rebuild                                                            |
| 4a  | Directory placement | pass    | `test/e2e/` correct since suite covers both dev and prod                                                                               |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` gating both describes                                                                                        |
| 4c  | Turbopack guards    | pass    | Inner `if (!isTurbopack)` preserves original `if (!process.env.IS_TURBOPACK_TEST)`                                                     |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV/BUILD` describe-skip pattern is subsumed by `isNextDev`/`isNextStart` split (each mode runs in its own CI job) |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack` from `nextTestSetup`, not raw env                                                                                   |
| 5a  | render              | na      |                                                                                                                                        |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                                                                                          |
| 5c  | browser             | na      |                                                                                                                                        |
| 5d  | check→retry         | pass    | `check(..., 'success')` replaced with `retry()` + `expect()`                                                                           |
| 5e  | File class          | pass    | Replaced with `next.patchFile` + `beforeAll` originals                                                                                 |
| 5f  | waitFor             | na      | Not used                                                                                                                               |
| 5g  | fs operations       | pass    | Uses `next.readFile`/`next.patchFile`                                                                                                  |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `pages/api/route.js`, `middleware.js`, `lib.js` all present                                                          |
| 6b  | next.config.js      | pass    | Original directory also has no `next.config.js`                                                                                        |
| 6c  | Overrides           | na      | Only `dependencies: { nanoid: 'latest' }` used                                                                                         |
| 7a  | No dead code        | pass    | TODO comment about codeframe is inherited from original util                                                                           |
| 7b  | retry over timeout  | pass    |                                                                                                                                        |
| 7c  | async/await         | pass    |                                                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                                                        |

## Issues

None

## Warnings

None
