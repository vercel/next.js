# scroll-forward-restoration: WARN

Clean 1:1 conversion with browser-based scroll test preserved; only concern is dropped Turbopack dedup guards.

## Criteria

| #   | Criterion             | Verdict | Note                                                                                             |
| --- | --------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| 1a  | Test count            | pass    | original: 1, converted: 1                                                                        |
| 1b  | Assertions            | pass    | original: 5 expects + 3 check(), converted: 8 expects                                            |
| 1c  | Test titles           | pass    | Same title preserved                                                                             |
| 1d  | Describe blocks       | pass    | Outer describe preserved; dev/prod sub-describes correctly flattened (e2e harness handles modes) |
| 2a  | URL paths             | pass    | `/another` via `next.browser()`                                                                  |
| 2b  | Response checks       | pass    | All HTML/scroll assertions preserved                                                             |
| 2c  | FS checks             | na      |                                                                                                  |
| 2d  | Browser checks        | pass    | webdriver→next.browser, all evals preserved                                                      |
| 2e  | Build output          | na      |                                                                                                  |
| 2f  | Dynamic logic         | pass    | runTests() inlined; same behavior for dev/prod                                                   |
| 3a  | nextTestSetup         | pass    |                                                                                                  |
| 3b  | files param           | pass    | `files: __dirname`                                                                               |
| 3c  | skipStart             | na      | Not build-only                                                                                   |
| 3d  | No manual lifecycle   | pass    |                                                                                                  |
| 3e  | Cleanup               | pass    | Harness handles it                                                                               |
| 4a  | Directory placement   | pass    | test/e2e/ correct (runs dev + prod)                                                              |
| 4b  | Mode guards           | na      | Same behavior both modes                                                                         |
| 4c  | Turbopack skip guards | na      | Not turbopack-only or webpack-only                                                               |
| 4d  | Dedup guards          | warn    | Original had `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards; converted has none                  |
| 4e  | No incorrect env      | pass    |                                                                                                  |
| 5a  | render                | na      |                                                                                                  |
| 5b  | fetch                 | na      |                                                                                                  |
| 5c  | browser               | pass    |                                                                                                  |
| 5d  | check→retry           | pass    | All 3 check() calls converted to retry+expect                                                    |
| 5e  | File class            | na      |                                                                                                  |
| 5f  | waitFor               | na      |                                                                                                  |
| 5g  | fs operations         | na      |                                                                                                  |
| 6a  | Fixtures exist        | pass    | next.config.js, pages/index.js, pages/another.js all present                                     |
| 6b  | next.config.js        | pass    |                                                                                                  |
| 6c  | Overrides             | na      |                                                                                                  |
| 7a  | No dead code          | pass    |                                                                                                  |
| 7b  | retry over timeout    | pass    |                                                                                                  |
| 7c  | async/await           | pass    |                                                                                                  |
| 7d  | eslint                | pass    |                                                                                                  |

## Issues

None

## Warnings

- 4d: Original had dedup guards `(process.env.TURBOPACK_BUILD ? describe.skip : describe)` for dev and `(process.env.TURBOPACK_DEV ? describe.skip : describe)` for prod. The converted test is placed in `test/e2e/` and runs in both modes with no dedup guard, so it will run in both dev and prod even in CI jobs meant to cover only one mode.
