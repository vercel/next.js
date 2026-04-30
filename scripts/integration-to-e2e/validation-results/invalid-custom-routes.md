# invalid-custom-routes: PASS

Clean conversion with all tests, assertions, and mode coverage preserved; uses `nextTestSetup` with `skipStart`, `patchFile` for config mutations, and `cliOutput` for stderr assertions.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                                                       |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 10 `it` (run 2x via runTests), converted: 10 `it` (run in isNextDev/isNextStart describes)                                                                                                                       |
| 1b  | Assertions          | pass    | All `expect(...toContain)` assertions preserved verbatim                                                                                                                                                                   |
| 1c  | Test titles         | pass    | All 10 titles preserved exactly                                                                                                                                                                                            |
| 1d  | Describe blocks     | pass    | Outer describe + dev/prod inner describes preserved                                                                                                                                                                        |
| 2a  | URL paths           | na      | No URL-specific testing; just config errors                                                                                                                                                                                |
| 2b  | Response checks     | pass    | stderr content assertions preserved                                                                                                                                                                                        |
| 2c  | FS checks           | pass    | `fs.writeFile` → `next.patchFile`; cleanup via `next.patchFile('next.config.js', empty)`                                                                                                                                   |
| 2d  | Browser checks      | na      | No browser interactions                                                                                                                                                                                                    |
| 2e  | Build output        | pass    | `nextBuild` → `next.build()` + `cliOutput`                                                                                                                                                                                 |
| 2f  | Dynamic logic       | pass    | `runTests(mode)` helper preserved with dev/start branches                                                                                                                                                                  |
| 3a  | nextTestSetup       | pass    | `nextTestSetup({ files: __dirname, skipStart: true })`                                                                                                                                                                     |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                                                         |
| 3c  | skipStart           | pass    | Correctly `skipStart: true`; dev branch calls `next.start()`/`next.stop()` explicitly                                                                                                                                      |
| 3d  | No manual lifecycle | pass    | No `launchApp`/`killApp`/`findPort` usage                                                                                                                                                                                  |
| 3e  | Cleanup             | pass    | `afterAll` resets next.config.js to empty (equivalent of removing the invalid one)                                                                                                                                         |
| 4a  | Directory placement | pass    | `test/e2e/` appropriate (runs in both dev and start)                                                                                                                                                                       |
| 4b  | Mode guards         | pass    | `isNextDev` / `isNextStart` guard the two describe blocks                                                                                                                                                                  |
| 4c  | Turbopack guards    | na      | Original skip was a dedup guard, not a turbopack-only/webpack-only restriction                                                                                                                                             |
| 4d  | Dedup guards        | pass    | Original's `TURBOPACK_BUILD`→skip dev / `TURBOPACK_DEV`→skip prod is replaced by `isNextDev`/`isNextStart` splitting by the harness mode — each mode runs only in its matching NEXT_TEST_MODE run, preserving dedup intent |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` references                                                                                                                                                                            |
| 5a  | render              | na      |                                                                                                                                                                                                                            |
| 5b  | fetch               | pass    | Single `next.fetch('/')` used to trigger dev compile                                                                                                                                                                       |
| 5c  | browser             | na      |                                                                                                                                                                                                                            |
| 5d  | check→retry         | pass    | Already used `retry` in original; preserved                                                                                                                                                                                |
| 5e  | File class          | na      |                                                                                                                                                                                                                            |
| 5f  | waitFor             | pass    | None used                                                                                                                                                                                                                  |
| 5g  | fs operations       | pass    | All via `next.patchFile`                                                                                                                                                                                                   |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `next.config.js` present                                                                                                                                                                                 |
| 6b  | next.config.js      | pass    | Empty stub in fixture directory; overwritten per test                                                                                                                                                                      |
| 6c  | Overrides           | na      |                                                                                                                                                                                                                            |
| 7a  | No dead code        | pass    |                                                                                                                                                                                                                            |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                                                                            |
| 7c  | async/await         | pass    | Try/finally around `next.start()`/`next.stop()`                                                                                                                                                                            |
| 7d  | eslint              | pass    |                                                                                                                                                                                                                            |

## Issues

None

## Warnings

None
