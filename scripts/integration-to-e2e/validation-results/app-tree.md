# app-tree: PASS

Clean conversion — all three tests preserved with proper API migration; `setTimeout`/`waitFor` replaced by `retry()`, and all fixture files present.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                  |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3 (×2 modes), converted: 3 (harness runs per mode)                          |
| 1b  | Assertions          | pass    | original: 7, converted: 7 (equivalent, within retry blocks)                           |
| 1c  | Test titles         | pass    | All three titles preserved verbatim                                                   |
| 1d  | Describe blocks     | pass    | Outer `AppTree` describe preserved; mode describes flattened (harness-handled)        |
| 2a  | URL paths           | pass    | `/`, `/another`, `/hello` all covered                                                 |
| 2b  | Response checks     | pass    | All regex matches preserved                                                           |
| 2c  | FS checks           | na      |                                                                                       |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`, same selectors/evals                                    |
| 2e  | Build output        | na      |                                                                                       |
| 2f  | Dynamic logic       | pass    | `runTests()` inlined; same tests run across modes via harness                         |
| 3a  | nextTestSetup       | pass    |                                                                                       |
| 3b  | files param         | pass    | `files: __dirname`                                                                    |
| 3c  | skipStart           | na      | Normal server test                                                                    |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/etc.                                                            |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                              |
| 4a  | Directory placement | pass    | `test/e2e/` correct — runs both dev+prod                                              |
| 4b  | Mode guards         | na      | Original tests identical across modes                                                 |
| 4c  | Turbopack guards    | na      | Original dedup only, no turbopack-only skips                                          |
| 4d  | Dedup guards        | na      | Integration-style dedup (TURBOPACK_DEV/BUILD describe.skip) not needed in e2e harness |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD refs                                                           |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                       |
| 5b  | fetch               | na      |                                                                                       |
| 5c  | browser             | pass    | `webdriver` → `next.browser`                                                          |
| 5d  | check→retry         | na      | Original had none                                                                     |
| 5e  | File class          | na      |                                                                                       |
| 5f  | waitFor             | pass    | `waitFor(ms)` replaced with `retry()` around the assertion                            |
| 5g  | fs operations       | na      |                                                                                       |
| 6a  | Fixtures exist      | pass    | pages/\_app.tsx, another.js, hello.tsx, index.js, tsconfig.json                       |
| 6b  | next.config.js      | na      | Original had none                                                                     |
| 6c  | Overrides           | na      |                                                                                       |
| 7a  | No dead code        | pass    |                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                       |
| 7c  | async/await         | pass    | `browser.elementByCss(...).click()` now awaited (improvement)                         |
| 7d  | eslint              | pass    |                                                                                       |

## Issues

None.

## Warnings

None.
