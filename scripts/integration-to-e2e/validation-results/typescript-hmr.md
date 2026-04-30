# typescript-hmr: WARN

Conversion looks structurally faithful but drops CHOKIDAR polling env vars used by the original to stabilize file-watch in CI.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                             |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 3 (1 skipped), converted: 3 (1 skipped)                                                |
| 1b  | Assertions          | pass    | original: ~6 checks, converted: ~6 expects                                                       |
| 1c  | Test titles         | pass    | All preserved verbatim                                                                           |
| 1d  | Describe blocks     | pass    | Outer + inner describe preserved                                                                 |
| 2a  | URL paths           | pass    | /hello, /type-error-recover                                                                      |
| 2b  | Response checks     | pass    | Body text + redbox header matchers preserved                                                     |
| 2c  | FS checks           | pass    | fs.readFile/writeFile → next.readFile/patchFile                                                  |
| 2d  | Browser checks      | pass    | webdriver → next.browser, elementByCss/eval equivalent                                           |
| 2e  | Build output        | na      | Dev-only test                                                                                    |
| 2f  | Dynamic logic       | na      | Single mode                                                                                      |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                                                |
| 3b  | files param         | pass    | files: \_\_dirname                                                                               |
| 3c  | skipStart           | na      | Not build-only                                                                                   |
| 3d  | No manual lifecycle | pass    | No launchApp/killApp                                                                             |
| 3e  | Cleanup             | pass    | patchFile restore in finally preserved                                                           |
| 4a  | Directory placement | pass    | test/development/ — original was dev-only (launchApp)                                            |
| 4b  | Mode guards         | na      | Single mode                                                                                      |
| 4c  | Turbopack guards    | pass    | Uses isTurbopack from setup, not IS_TURBOPACK_TEST for skip                                      |
| 4d  | Dedup guards        | na      |                                                                                                  |
| 4e  | No incorrect env    | pass    |                                                                                                  |
| 5a  | render              | na      |                                                                                                  |
| 5b  | fetch               | na      |                                                                                                  |
| 5c  | browser             | pass    | webdriver → next.browser                                                                         |
| 5d  | check→retry         | pass    | All `check()` → `retry()`+expect                                                                 |
| 5e  | File class          | na      | Original used fs directly; converted uses next.patchFile                                         |
| 5f  | waitFor             | warn    | 500ms setTimeout preserved for Turbopack watch delay (matches original; acceptable timing delay) |
| 5g  | fs operations       | pass    | next.readFile/patchFile used                                                                     |
| 6a  | Fixtures exist      | pass    | pages/hello.tsx, pages/type-error-recover.tsx, next.config.js, tsconfig.json present             |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                           |
| 6c  | Overrides           | na      |                                                                                                  |
| 7a  | No dead code        | pass    |                                                                                                  |
| 7b  | retry over timeout  | pass    | retry used for state polling; setTimeout only for Turbopack watch start delay                    |
| 7c  | async/await         | pass    |                                                                                                  |
| 7d  | eslint              | pass    |                                                                                                  |

## Issues

None

## Warnings

- Original passes `CHOKIDAR_USEPOLLING=true` and `CHOKIDAR_INTERVAL=500` env vars to `launchApp` to stabilize file watching in CI. The converted test does not pass these via `env` in `nextTestSetup`. Consider adding `env: { CHOKIDAR_USEPOLLING: 'true', CHOKIDAR_INTERVAL: '500' }` to match original CI reliability behavior.
- Converted test relies on implicit `browser.close()` cleanup via nextTestSetup rather than explicit finally-block close (original had explicit close). This is acceptable with nextTestSetup.
