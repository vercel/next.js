# numeric-sep: PASS

Clean, minimal conversion of a single prod-mode build-output test; setup uses `nextTestSetup` with `isNextStart` guard and checks `cliOutput`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                               |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1 (plus a no-op stub for non-start mode)                                                                                                                   |
| 1b  | Assertions          | warn    | original: 3 expects, converted: 2 — dropped explicit `code === 0`; implicitly covered because `nextTestSetup` fails on build failure                                               |
| 1c  | Test titles         | pass    | "should successfully build for a JavaScript file" preserved                                                                                                                        |
| 1d  | Describe blocks     | pass    | "Numeric Separator Support" > "production mode" preserved                                                                                                                          |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                                                                   |
| 2b  | Response checks     | na      |                                                                                                                                                                                    |
| 2c  | FS checks           | na      |                                                                                                                                                                                    |
| 2d  | Browser checks      | na      |                                                                                                                                                                                    |
| 2e  | Build output        | pass    | `stdout`/`stderr` checks mapped to `next.cliOutput`                                                                                                                                |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                                    |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `'e2e-utils'`                                                                                                                                            |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                 |
| 3c  | skipStart           | warn    | Original was build-only (`nextBuild` then done); converted starts the server unnecessarily. Could use `skipStart: true` with explicit `next.build()`                               |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                                    |
| 3e  | Cleanup             | pass    |                                                                                                                                                                                    |
| 4a  | Directory placement | pass    | `test/production/` correct for prod-only test                                                                                                                                      |
| 4b  | Mode guards         | pass    | `isNextStart` early-return used                                                                                                                                                    |
| 4c  | Turbopack guards    | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip : describe`; converted omits it. Low risk since prod tests don't run in dev test matrix, but original dedup intent is lost |
| 4d  | Dedup guards        | warn    | Same as 4c                                                                                                                                                                         |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` misuse                                                                                                                                        |
| 5a  | render              | na      |                                                                                                                                                                                    |
| 5b  | fetch               | na      |                                                                                                                                                                                    |
| 5c  | browser             | na      |                                                                                                                                                                                    |
| 5d  | check→retry         | na      |                                                                                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                                                                                                    |
| 5g  | fs operations       | na      |                                                                                                                                                                                    |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present in converted dir                                                                                                                                          |
| 6b  | next.config.js      | pass    | Neither original nor converted has one                                                                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                                                                                    |
| 7a  | No dead code        | pass    |                                                                                                                                                                                    |
| 7b  | retry over timeout  | na      |                                                                                                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                                                                                                    |

## Issues

None.

## Warnings

- Dropped explicit `code === 0` assertion; success implied by `nextTestSetup` not throwing and by `cliOutput` matcher.
- Could use `skipStart: true` + `await next.build()` since the original only exercised the build phase; current converted setup starts a server that the test never touches.
- Original `TURBOPACK_DEV` skip guard is not preserved. Low practical impact because the test is under `test/production/`, but the intent was not explicitly carried over.
