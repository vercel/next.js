# typescript-ignore-errors: PASS

Clean conversion with matching test matrix, assertions, and fixture files. Uses `skipStart: true` appropriately for build-only tests.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                       |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 4 (2×2 loop), converted: 4                                                       |
| 1b  | Assertions          | pass    | 16 expects in both                                                                         |
| 1c  | Test titles         | pass    | Identical dynamic titles                                                                   |
| 1d  | Describe blocks     | pass    | Outer + production-mode + per-matrix preserved                                             |
| 2a  | URL paths           | na      | Build-only test, no URLs                                                                   |
| 2b  | Response checks     | na      |                                                                                            |
| 2c  | FS checks           | pass    | Uses `next.readFile`/`patchFile`/`deleteFile` instead of `fs`                              |
| 2d  | Browser checks      | na      |                                                                                            |
| 2e  | Build output        | pass    | `next.build()` + `next.cliOutput` replace `nextBuild` stdout/stderr                        |
| 2f  | Dynamic logic       | pass    | Matrix loop preserved                                                                      |
| 3a  | nextTestSetup       | pass    |                                                                                            |
| 3b  | files param         | pass    | `files: __dirname`                                                                         |
| 3c  | skipStart           | pass    | Build-only test, uses `skipStart: true`                                                    |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`killApp` imports                                                           |
| 3e  | Cleanup             | pass    | `afterAll` restores tsconfig and deletes/restores next.config.js                           |
| 4a  | Directory placement | pass    | `test/production/` correct (original was production-mode only)                             |
| 4b  | Mode guards         | pass    | `isNextStart` guard present (though redundant in test/production)                          |
| 4c  | Turbopack guards    | na      | Original skipped only `TURBOPACK_DEV`; moving to test/production removes dev case entirely |
| 4d  | Dedup guards        | na      | Original `TURBOPACK_DEV` skip no longer relevant since test/production never runs dev      |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` in converted                                          |
| 5a  | render              | na      |                                                                                            |
| 5b  | fetch               | na      |                                                                                            |
| 5c  | browser             | na      |                                                                                            |
| 5d  | check→retry         | na      |                                                                                            |
| 5e  | File class          | pass    | Replaced `new File()` with `next.patchFile`/`deleteFile`                                   |
| 5f  | waitFor             | na      |                                                                                            |
| 5g  | fs operations       | pass    | All via `next.*` helpers                                                                   |
| 6a  | Fixtures exist      | pass    | `pages/index.tsx`, `tsconfig.json` present                                                 |
| 6b  | next.config.js      | pass    | Written at runtime by test (as in original)                                                |
| 6c  | Overrides           | na      |                                                                                            |
| 7a  | No dead code        | warn    | `if (!isNextStart) { return }` is redundant inside test/production but harmless            |
| 7b  | retry over timeout  | na      |                                                                                            |
| 7c  | async/await         | pass    |                                                                                            |
| 7d  | eslint              | pass    |                                                                                            |

## Issues

None.

## Warnings

- The `if (!isNextStart) { it('skipped'); return }` guard inside `test/production/` is redundant since the directory is always prod-mode; could be removed for clarity.
