# client-shallow-routing: PASS

Clean conversion of two shallow-routing browser tests to e2e using `nextTestSetup`, with `waitFor`/`check` replaced by `retry()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                       |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                                  |
| 1b  | Assertions          | pass    | original: 15, converted: 19 (extra from retry blocks)                                                                      |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                             |
| 1d  | Describe blocks     | pass    | dev/prod describes collapsed; e2e harness runs both modes                                                                  |
| 2a  | URL paths           | pass    | `/first` via `next.browser` matches original                                                                               |
| 2b  | Response checks     | pass    | Same `#props` / `#add-query-shallow` / `#to-another` selectors and JSON param/random assertions                            |
| 2c  | FS checks           | na      |                                                                                                                            |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`; click/back/forward preserved                                                                 |
| 2e  | Build output        | na      |                                                                                                                            |
| 2f  | Dynamic logic       | pass    | `runTests()` inlined once; harness provides dev/prod coverage                                                              |
| 3a  | nextTestSetup       | pass    | Imported from `e2e-utils`                                                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                         |
| 3c  | skipStart           | na      | Not a build-only test                                                                                                      |
| 3d  | No manual lifecycle | pass    | No launchApp/killApp/nextBuild imports                                                                                     |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                   |
| 4a  | Directory placement | pass    | `test/e2e/` correct for dev+prod coverage                                                                                  |
| 4b  | Mode guards         | na      | Same behavior in both modes                                                                                                |
| 4c  | Turbopack guards    | na      | Original had no turbopack-only skip                                                                                        |
| 4d  | Dedup guards        | na      | Original's TURBOPACK_DEV/BUILD guards were just dev-vs-prod block separation, now handled by the e2e harness per-mode runs |
| 4e  | No incorrect env    | pass    | No env guards used                                                                                                         |
| 5a  | render              | na      |                                                                                                                            |
| 5b  | fetch               | na      |                                                                                                                            |
| 5c  | browser             | pass    |                                                                                                                            |
| 5d  | check→retry         | pass    | `check(..., /another/)` → `retry` + `expect(...).toMatch(/another/)`                                                       |
| 5e  | File class          | na      |                                                                                                                            |
| 5f  | waitFor             | pass    | All `waitFor(1000)` calls replaced with `retry()` polling                                                                  |
| 5g  | fs operations       | na      |                                                                                                                            |
| 6a  | Fixtures exist      | pass    | `pages/[slug].js` present                                                                                                  |
| 6b  | next.config.js      | na      | Original had none                                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                            |
| 7a  | No dead code        | pass    |                                                                                                                            |
| 7b  | retry over timeout  | pass    |                                                                                                                            |
| 7c  | async/await         | pass    |                                                                                                                            |
| 7d  | eslint              | pass    |                                                                                                                            |

## Issues

None

## Warnings

None
