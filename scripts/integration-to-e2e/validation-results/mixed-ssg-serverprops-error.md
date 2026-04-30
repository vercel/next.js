# mixed-ssg-serverprops-error: PASS

Conversion preserves all 4 tests, assertions, and test titles with correct API migration and fixture placement.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                             |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 4, converted: 4 (+1 placeholder for non-start mode)                                                                    |
| 1b  | Assertions          | pass    | original: 6, converted: 6                                                                                                        |
| 1c  | Test titles         | pass    | All 4 titles preserved verbatim                                                                                                  |
| 1d  | Describe blocks     | pass    | Outer + "production mode" nested describe preserved                                                                              |
| 2a  | URL paths           | na      | No HTTP calls                                                                                                                    |
| 2b  | Response checks     | na      | Build-only test                                                                                                                  |
| 2c  | FS checks           | pass    | fs-extra replaced with next.patchFile/readFile/deleteFile                                                                        |
| 2d  | Browser checks      | na      |                                                                                                                                  |
| 2e  | Build output        | pass    | stderr → next.cliOutput, code → exitCode                                                                                         |
| 2f  | Dynamic logic       | na      |                                                                                                                                  |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                                                                                |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                               |
| 3c  | skipStart           | pass    | Build-only test, skipStart: true, explicit next.build() calls                                                                    |
| 3d  | No manual lifecycle | pass    | No nextBuild/launchApp                                                                                                           |
| 3e  | Cleanup             | pass    | Restores files at end of each test                                                                                               |
| 4a  | Directory placement | pass    | test/production/ correct (original was production-mode only)                                                                     |
| 4b  | Mode guards         | pass    | `if (!isNextStart) return` defensive placeholder                                                                                 |
| 4c  | Turbopack guards    | warn    | Uses `isTurbopack ? it.skip : it` per-test (acceptable); original used `process.env.IS_TURBOPACK_TEST` for per-it skip           |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_DEV ? describe.skip` dedup; converted relies on test/production/ folder placement to achieve same effect |
| 4e  | No incorrect env    | pass    | Uses isTurbopack from nextTestSetup                                                                                              |
| 5a  | render              | na      |                                                                                                                                  |
| 5b  | fetch               | na      |                                                                                                                                  |
| 5c  | browser             | na      |                                                                                                                                  |
| 5d  | check→retry         | na      |                                                                                                                                  |
| 5e  | File class          | na      |                                                                                                                                  |
| 5f  | waitFor             | na      |                                                                                                                                  |
| 5g  | fs operations       | pass    | All fs-extra replaced with next.\* helpers                                                                                       |
| 6a  | Fixtures exist      | pass    | pages/index.js and pages/index.js.alt present                                                                                    |
| 6b  | next.config.js      | na      | No next.config.js in original                                                                                                    |
| 6c  | Overrides           | na      |                                                                                                                                  |
| 7a  | No dead code        | pass    |                                                                                                                                  |
| 7b  | retry over timeout  | na      |                                                                                                                                  |
| 7c  | async/await         | pass    |                                                                                                                                  |
| 7d  | eslint              | pass    | Has `/* eslint-disable jest/no-standalone-expect */` for conditional `it` pattern                                                |

## Issues

None

## Warnings

- 4c/4d: Original used `(process.env.TURBOPACK_DEV ? describe.skip : describe)` as a dedup guard at the describe level. The converted test relies on `test/production/` placement to avoid running in dev mode. This is functionally equivalent but worth noting. The `if (!isNextStart) return` inside the describe is effectively dead code since `test/production/` tests always run in start mode.
- `next.cliOutput` accumulates across builds within a test run. The `toContain` assertions still pass since substrings appear, but be aware this pattern can mask ordering issues if new checks are added.
