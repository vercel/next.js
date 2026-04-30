# telemetry: PASS

Clean conversion: all 47 tests preserved across three files, assertion count increased (155 → 161), `check()`/`waitFor(2000)` replaced with `retry()`, and fixtures (hidden babelrc files, `_app/`, `app/`, `pages/_app_*.empty`, `warning.skip`, `hello.test.skip`, all `next.config.*` variants) are present in the converted directory.

## Criteria

| #   | Criterion             | Verdict | Note                                                                                                                                         |
| --- | --------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count            | pass    | original: 19+21+7=47, converted: 19+21+7=47                                                                                                  |
| 1b  | Assertions            | pass    | original: 155, converted: 161                                                                                                                |
| 1c  | Test titles           | pass    | All titles preserved verbatim                                                                                                                |
| 1d  | Describe blocks       | pass    | Top-level + nested 'production mode' preserved                                                                                               |
| 2a  | URL paths             | pass    | `renderViaHTTP(port, '/hello')` kept (paired with manual launchApp)                                                                          |
| 2b  | Response checks       | pass    | All regex stderr matches preserved                                                                                                           |
| 2c  | FS checks             | pass    | `appDir` → `next.testDir`; `.next/_events.json` existence check preserved                                                                    |
| 2d  | Browser checks        | na      | No webdriver usage                                                                                                                           |
| 2e  | Build output          | pass    | stderr regex events preserved                                                                                                                |
| 2f  | Dynamic logic         | pass    | `isTurbopack`/`isNextStart` guards used appropriately                                                                                        |
| 3a  | nextTestSetup         | pass    | All three files use it from 'e2e-utils'                                                                                                      |
| 3b  | files param           | pass    | `files: __dirname` in all three                                                                                                              |
| 3c  | skipStart             | pass    | `skipStart: true` in all three (telemetry tests drive their own build/launch)                                                                |
| 3d  | No manual lifecycle   | pass    | `runNextCommand`/`launchApp`/`killApp`/`findPort` allowed for telemetry tests per allowlist                                                  |
| 3e  | Cleanup               | pass    | killApp in finally blocks, file renames reversed                                                                                             |
| 4a  | Directory placement   | pass    | test/e2e/ with isNextStart/isTurbopack guards for conditional mode coverage                                                                  |
| 4b  | Mode guards           | pass    | `isNextStart ? describe : describe.skip` for prod-only; `isTurbopack` branch for dev-turbo tests                                             |
| 4c  | Turbopack skip guards | pass    | `(isTurbopack ? it.skip : it)(...)` preserved from original IS_TURBOPACK_TEST pattern                                                        |
| 4d  | Dedup guards          | pass    | Original `TURBOPACK_DEV ? describe.skip` dedup replaced with equivalent `isNextStart` gate                                                   |
| 4e  | No incorrect env      | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD env refs remain                                                                                             |
| 5a  | render                | na      | Dev-mode render preserved as raw `renderViaHTTP` (tied to custom `launchApp` port)                                                           |
| 5b  | fetch                 | na      | No fetchViaHTTP usage                                                                                                                        |
| 5c  | browser               | na      | No webdriver usage                                                                                                                           |
| 5d  | check→retry           | pass    | All `check()` calls converted to `retry(async () => { expect(...) })`                                                                        |
| 5e  | File class            | na      | No `new File()` usage                                                                                                                        |
| 5f  | waitFor               | pass    | `waitFor(2000)` replaced with `retry()` around event assertion                                                                               |
| 5g  | fs operations         | pass    | `appDir` → `next.testDir` throughout                                                                                                         |
| 6a  | Fixtures exist        | pass    | All `.babelrc.*`, `package.babel`, `package.swc-plugins`, all `next.config.*` variants, `_app/`, `app/`, `pages/`, hidden skip files present |
| 6b  | next.config.js        | pass    | Variants present, test renames into next.config.js at runtime                                                                                |
| 6c  | Overrides             | na      | No overrideFiles/nextConfig option used                                                                                                      |
| 7a  | No dead code          | pass    | No commented tests/unused imports                                                                                                            |
| 7b  | retry over timeout    | pass    | All polling uses retry                                                                                                                       |
| 7c  | async/await           | pass    | All promises awaited                                                                                                                         |
| 7d  | eslint                | pass    | `/* eslint-disable jest/no-standalone-expect */` on config.test.ts for it.skip pattern                                                       |

## Issues

None

## Warnings

None
