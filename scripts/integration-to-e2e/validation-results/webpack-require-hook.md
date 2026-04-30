# webpack-require-hook: PASS

Clean 1:1 conversion of a small webpack-only test using `nextTestSetup` with mode guards to split build vs dev tests appropriately.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                      |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                                                                                 |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                                                                                                 |
| 1c  | Test titles         | pass    | Minor wording ("Does not" → "should not"), intent preserved                                                                                                               |
| 1d  | Describe blocks     | pass    | Outer "Handles Webpack Require Hook" + inner "development mode" preserved; "build" describe flattened into `isNextStart` guard                                            |
| 2a  | URL paths           | pass    | `/` preserved via `next.render('/')`                                                                                                                                      |
| 2b  | Response checks     | pass    | `/Initialized config/` matched against `next.cliOutput`                                                                                                                   |
| 2c  | FS checks           | na      |                                                                                                                                                                           |
| 2d  | Browser checks      | na      |                                                                                                                                                                           |
| 2e  | Build output        | pass    | `next.cliOutput` replaces `stdout`/`stderr` capture                                                                                                                       |
| 2f  | Dynamic logic       | pass    | Split via `isNextStart`/`isNextDev` guards                                                                                                                                |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                                                                                                     |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                        |
| 3c  | skipStart           | na      | Not build-only; dev branch renders server                                                                                                                                 |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp/nextBuild                                                                                                                                   |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                                                  |
| 4a  | Directory placement | pass    | `test/e2e/` runs in both dev and start (original tested both)                                                                                                             |
| 4b  | Mode guards         | pass    | `isNextStart` wraps build test; `isNextDev ? describe : describe.skip` wraps dev test                                                                                     |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST ? describe.skip` wraps outside `nextTestSetup` per guideline                                                                                           |
| 4d  | Dedup guards        | warn    | Original `TURBOPACK_BUILD ? describe.skip` on dev block is unreachable anyway (outer IS_TURBOPACK_TEST skip), and converted relies on `isNextDev`; effectively equivalent |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` skip logic                                                                                                                           |
| 5a  | render              | pass    | `renderViaHTTP(appPort, '/')` → `next.render('/')`                                                                                                                        |
| 5b  | fetch               | na      |                                                                                                                                                                           |
| 5c  | browser             | na      |                                                                                                                                                                           |
| 5d  | check→retry         | na      |                                                                                                                                                                           |
| 5e  | File class          | na      |                                                                                                                                                                           |
| 5f  | waitFor             | na      |                                                                                                                                                                           |
| 5g  | fs operations       | na      |                                                                                                                                                                           |
| 6a  | Fixtures exist      | pass    | `next.config.js` and `pages/hello.js` present                                                                                                                             |
| 6b  | next.config.js      | pass    | Identical to original                                                                                                                                                     |
| 6c  | Overrides           | na      |                                                                                                                                                                           |
| 7a  | No dead code        | pass    |                                                                                                                                                                           |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                           |
| 7c  | async/await         | pass    |                                                                                                                                                                           |
| 7d  | eslint              | pass    |                                                                                                                                                                           |

## Issues

None.

## Warnings

- The converted build-error filter adds `.filter(line => /\bError\b/.test(line))` on top of the original warning-skip filter. This is stricter-looking but arguably looser (only flags lines containing "Error" rather than all non-warning stderr). Intent is preserved since `next.cliOutput` mixes stdout+stderr and the original's raw-stderr filter would produce many false positives; worth noting but not a regression.
