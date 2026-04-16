# invalid-href: PASS

Clean 1:1 port of the integration suite into a single e2e file with correct dev/prod guard mapping and matching fixtures.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                      |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 15, converted: 15                                                                                                                                               |
| 1b  | Assertions          | pass    | All expect calls preserved                                                                                                                                                |
| 1c  | Test titles         | pass    | All 15 titles match verbatim                                                                                                                                              |
| 1d  | Describe blocks     | pass    | Outer "Invalid hrefs" kept; inner prod/dev describes flattened via isNextDev guards                                                                                       |
| 2a  | URL paths           | pass    | /first, /second, /third, /exotic-href, /invalid-relative, /dynamic-route-mismatch(-manual) all preserved                                                                  |
| 2b  | Response checks     | pass    | `$('#click-me').attr('href')` assertions preserved via `next.render$()`                                                                                                   |
| 2c  | FS checks           | na      | None                                                                                                                                                                      |
| 2d  | Browser checks      | pass    | `webdriver(port, path)` → `next.browser(path)`; browser.eval/click/log preserved                                                                                          |
| 2e  | Build output        | na      |                                                                                                                                                                           |
| 2f  | Dynamic logic       | pass    | `showsError`/`noError` helpers ported intact                                                                                                                              |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup({ files: __dirname })`                                                                                                                                |
| 3b  | files param         | pass    | `__dirname`                                                                                                                                                               |
| 3c  | skipStart           | na      | Test needs running server in both modes                                                                                                                                   |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild/nextStart                                                                                                                                 |
| 3e  | Cleanup             | pass    | nextTestSetup handles lifecycle                                                                                                                                           |
| 4a  | Directory placement | pass    | test/e2e/ correct (runs both dev and prod)                                                                                                                                |
| 4b  | Mode guards         | pass    | `if (!isNextDev)` / `if (isNextDev)` map to original prod/dev describes                                                                                                   |
| 4c  | Turbopack guards    | na      |                                                                                                                                                                           |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_DEV/BUILD dedup handled implicitly by NEXT_TEST_MODE + isNextDev/isNextStart                                                                           |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD references                                                                                                                                         |
| 5a  | render              | pass    | `fetchViaHTTP` for HTML → `next.render$()`                                                                                                                                |
| 5b  | fetch               | na      | No raw fetch remaining                                                                                                                                                    |
| 5c  | browser             | pass    | `webdriver` → `next.browser`                                                                                                                                              |
| 5d  | check→retry         | pass    | `check(...)` in showsError replaced with `retry()` + `expect().toMatch`                                                                                                   |
| 5e  | File class          | na      |                                                                                                                                                                           |
| 5f  | waitFor             | warn    | Replaced `waitFor(500)` with inline `new Promise(r => setTimeout(r, 500))` — behaviorally equivalent to the original fixed delay, but could use `retry()` for async state |
| 5g  | fs operations       | na      |                                                                                                                                                                           |
| 6a  | Fixtures exist      | pass    | All 9 page fixtures present in test/e2e/invalid-href/pages                                                                                                                |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                                                                                            |
| 6c  | Overrides           | na      |                                                                                                                                                                           |
| 7a  | No dead code        | pass    |                                                                                                                                                                           |
| 7b  | retry over timeout  | warn    | See 5f; fixed-delay setTimeouts after clicks remain                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                                                                           |
| 7d  | eslint              | pass    | Duplicate-title disable at file top covers the intentional duplicates                                                                                                     |

## Issues

None

## Warnings

- Inline `new Promise((resolve) => setTimeout(resolve, 500))` mirrors the original `waitFor(500)` but is a fixed delay rather than polling; a `retry()`-based wait on the observable state (caught errors / warn logs) would be more robust. Matches original behavior, so non-blocking.
