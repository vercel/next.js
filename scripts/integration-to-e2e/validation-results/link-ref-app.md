# link-ref-app: PASS

Clean conversion of a Link ref test suite into a single e2e test file with equivalent coverage and proper mode guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                           |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 10 `it(` declarations, converted: 10                                                                                                 |
| 1b  | Assertions          | pass    | original: 2 `expect(`, converted: 2                                                                                                            |
| 1c  | Test titles         | pass    | All preserved verbatim                                                                                                                         |
| 1d  | Describe blocks     | pass    | Two mode-describes flattened into `isNextDev`/`isNextStart` guards within a single describe                                                    |
| 2a  | URL paths           | pass    | `/`, `/click-away-race-condition`, `/function`, `/class`, `/child-ref`, `/child-ref-func`, `/child-ref-func-cleanup` all preserved             |
| 2b  | Response checks     | pass    | Console errors + prefetch header checks preserved                                                                                              |
| 2c  | FS checks           | na      |                                                                                                                                                |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`, same selectors/evals                                                                                             |
| 2e  | Build output        | na      |                                                                                                                                                |
| 2f  | Dynamic logic       | pass    | `runCommonTests` common block preserved by leaving race-condition test outside mode guards                                                     |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                             |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                 |
| 3d  | No manual lifecycle | pass    | No `findPort`/`launchApp`/`killApp`/`nextBuild`/`nextStart`                                                                                    |
| 3e  | Cleanup             | pass    | `browser.close()` preserved; setup handled by nextTestSetup                                                                                    |
| 4a  | Directory placement | pass    | `test/e2e/` — runs in both dev and prod                                                                                                        |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` map correctly to original dev/prod describes                                                                         |
| 4c  | Turbopack guards    | na      | Original didn't skip for Turbopack — `TURBOPACK_BUILD`/`TURBOPACK_DEV` were dedup guards, not skip guards                                      |
| 4d  | Dedup guards        | pass    | e2e-utils handles dev/prod separation natively; original's `TURBOPACK_BUILD`/`TURBOPACK_DEV` guards are made redundant by the per-mode harness |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` references in converted                                                                                   |
| 5a  | render              | na      |                                                                                                                                                |
| 5b  | fetch               | na      |                                                                                                                                                |
| 5c  | browser             | pass    | `webdriver(appPort, ...)` → `next.browser(...)`                                                                                                |
| 5d  | check→retry         | na      | Original used `retry` already                                                                                                                  |
| 5e  | File class          | na      |                                                                                                                                                |
| 5f  | waitFor             | pass    | `waitFor(1000)` in `noError` replaced with `retry()` polling                                                                                   |
| 5g  | fs operations       | na      |                                                                                                                                                |
| 6a  | Fixtures exist      | pass    | All 6 page dirs + layout + root page present (matches original)                                                                                |
| 6b  | next.config.js      | na      | Original had none                                                                                                                              |
| 6c  | Overrides           | na      |                                                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                                                |
| 7b  | retry over timeout  | pass    | `waitFor` replaced with `retry`                                                                                                                |
| 7c  | async/await         | pass    |                                                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                                                |

## Issues

None

## Warnings

None
