# env-config: WARN

The core dev and production mode coverage is faithfully preserved with proper API migration, but the original `test environment` describe block (NODE_ENV='test') has been dropped entirely, reducing coverage of a distinct env-loading path.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                               |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | warn    | original 9 raw `it` but runTests re-used 3x (~23 executions); converted 9. NODE_ENV=test describe dropped.         |
| 1b  | Assertions          | pass    | original: 51, converted: 65                                                                                        |
| 1c  | Test titles         | pass    | All 7 runTests titles + 2 HMR titles preserved                                                                     |
| 1d  | Describe blocks     | warn    | `test environment` describe block dropped entirely                                                                 |
| 2a  | URL paths           | pass    | /, /hello, /global, /some-ssg, /some-ssp, /api/all all covered                                                     |
| 2b  | Response checks     | pass    | 307 redirect + location pathname preserved                                                                         |
| 2c  | FS checks           | pass    | Uses `next.readFile` / `next.patchFile` rather than direct fs                                                      |
| 2d  | Browser checks      | pass    | `next.browser` + `waitForElementByCss` preserved                                                                   |
| 2e  | Build output        | na      | No build output assertions                                                                                         |
| 2f  | Dynamic logic       | warn    | `runTests('test')` mode logic dropped; isTestEnv branches in checkEnvData removed                                  |
| 3a  | nextTestSetup       | pass    | Imported from 'e2e-utils'                                                                                          |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                 |
| 3c  | skipStart           | na      | Full server needed                                                                                                 |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                                                                      |
| 3e  | Cleanup             | pass    | Restores .env files via try/finally with patchFile                                                                 |
| 4a  | Directory placement | pass    | `test/e2e/` — runs dev + prod                                                                                      |
| 4b  | Mode guards         | pass    | `if (isNextDev)` wraps hot reload; `isNextDev` ternaries in checkEnvData                                           |
| 4c  | Turbopack guards    | na      | Original guards were dedup, not Turbopack-only                                                                     |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_BUILD/DEV skips are replaced by isNextDev/isNextStart which e2e-utils handles                   |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD usage                                                                                       |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                                        |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch with redirect:'manual'                                                                   |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                           |
| 5d  | check→retry         | pass    | All `check()` calls replaced with `retry() + expect()`                                                             |
| 5e  | File class          | na      | Used fs.writeFile → next.patchFile correctly                                                                       |
| 5f  | waitFor             | na      | Not used                                                                                                           |
| 5g  | fs operations       | pass    | next.readFile / next.patchFile replace fs.readFile/writeFile                                                       |
| 6a  | Fixtures exist      | pass    | pages/, next.config.js, .env/.env.local/.env.development/.env.production/.env.test (+ .local variants) all present |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                             |
| 6c  | Overrides           | na      | None used                                                                                                          |
| 7a  | No dead code        | pass    |                                                                                                                    |
| 7b  | retry over timeout  | pass    | retry() used throughout                                                                                            |
| 7c  | async/await         | pass    |                                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                                    |

## Issues

None at fail-level.

## Warnings

- The `test environment` describe (NODE_ENV='test') block from lines 357–371 of the original was dropped entirely. This block uniquely verified:
  - `TEST_ENV_FILE_KEY='test'` and `LOCAL_TEST_ENV_FILE_KEY='localtest'` loading
  - `LOCAL_ENV_FILE_KEY=undefined` (because `.env.local` is skipped when NODE_ENV=test)
  - `ENV_FILE_EMPTY_FIRST=''` (test-env-specific override)
  - `ENV_FILE_TEST_OVERRIDE_TEST='test'` behavior
    The converted `checkEnvData` no longer branches on `isTestEnv`, so the test-env path is uncovered. Consider a separate `test/production/env-config-test-env/` suite using `createNext`/`startApp` with `NODE_ENV=test` if full parity is desired.
- The converted test runs in both dev and prod by default; the original had `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup skips. This is acceptable since e2e-utils handles mode selection, but verify CI doesn't double-run.
