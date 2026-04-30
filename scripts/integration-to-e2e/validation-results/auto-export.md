# auto-export: PASS

Clean conversion — all 5 shared tests preserved, dev-only hydration test correctly guarded with `isNextDev`, `check()` properly replaced with `retry()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                        |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5 in runTests + 1 dev-only (×2 runs in original); converted: 5 shared + 1 dev-only — equivalent per-mode                                                          |
| 1b  | Assertions          | pass    | Equivalent; `check()` → `retry()+expect()` retained assertion semantics                                                                                                     |
| 1c  | Test titles         | pass    | All 6 titles preserved verbatim                                                                                                                                             |
| 1d  | Describe blocks     | pass    | Flattened `production mode`/`dev` nested describes into single describe using `isNextDev` guard                                                                             |
| 2a  | URL paths           | pass    | /commonjs1, /commonjs2, /post-1, /zeit/cmnt-1, /zeit/cmnt-2 all present                                                                                                     |
| 2b  | Response checks     | pass    | HTML body/documentElement matchers preserved                                                                                                                                |
| 2c  | FS checks           | na      |                                                                                                                                                                             |
| 2d  | Browser checks      | pass    | webdriver → next.browser; all .eval() calls preserved                                                                                                                       |
| 2e  | Build output        | na      |                                                                                                                                                                             |
| 2f  | Dynamic logic       | pass    | `runTests()` inlined; dev-only test uses `isNextDev` guard                                                                                                                  |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup({ files: __dirname })`                                                                                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                          |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                                              |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp/nextBuild/nextStart                                                                                                                           |
| 3e  | Cleanup             | pass    | No manual cleanup needed                                                                                                                                                    |
| 4a  | Directory placement | pass    | test/e2e/ correct — runs in both dev and prod                                                                                                                               |
| 4b  | Mode guards         | pass    | `isNextDev` guard for hydration-warning test                                                                                                                                |
| 4c  | Turbopack guards    | na      |                                                                                                                                                                             |
| 4d  | Dedup guards        | pass    | Original's `TURBOPACK_DEV ? describe.skip` was an integration-harness dedup; e2e uses `NEXT_TEST_MODE` which is inherently single-mode per run, so no explicit guard needed |
| 4e  | No incorrect env    | pass    | Uses `isNextDev` from e2e-utils                                                                                                                                             |
| 5a  | render              | na      |                                                                                                                                                                             |
| 5b  | fetch               | na      |                                                                                                                                                                             |
| 5c  | browser             | pass    | All `webdriver()` → `next.browser()`                                                                                                                                        |
| 5d  | check→retry         | pass    | Both `check()` calls converted to `retry()+expect()`                                                                                                                        |
| 5e  | File class          | na      |                                                                                                                                                                             |
| 5f  | waitFor             | na      | Not used                                                                                                                                                                    |
| 5g  | fs operations       | na      |                                                                                                                                                                             |
| 6a  | Fixtures exist      | pass    | pages/commonjs1.js, commonjs2.js, [post]/index.js, [post]/[cmnt].js all copied                                                                                              |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                                                                                              |
| 6c  | Overrides           | na      |                                                                                                                                                                             |
| 7a  | No dead code        | pass    | `browser.close()` calls correctly dropped (nextTestSetup handles cleanup)                                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                             |
| 7c  | async/await         | pass    |                                                                                                                                                                             |
| 7d  | eslint              | pass    |                                                                                                                                                                             |

## Issues

None

## Warnings

None
