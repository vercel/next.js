# not-found-revalidate: WARN

Conversion preserves the 3 tests with correct lifecycle and fixtures, but drops several intermediate SWR-timing assertions that the original made explicit via `waitFor` steps.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                      |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                                                                                                                 |
| 1b  | Assertions          | warn    | original: ~47, converted: ~37. Intermediate 2nd-404 and repeat-200 assertions in fallback-blocking/true were collapsed into retry()s                                      |
| 1c  | Test titles         | pass    | All 3 titles preserved (minor typo fix: "notFund" → "notFound")                                                                                                           |
| 1d  | Describe blocks     | pass    | Outer `SSG notFound revalidate` preserved; inner `production mode` collapsed since placement is `test/production/`                                                        |
| 2a  | URL paths           | pass    | All paths (/initial-not-found, /fallback-blocking/hello, /fallback-true/world) covered                                                                                    |
| 2b  | Response checks     | warn    | Core status/cache-control/body checks preserved; some intermediate SWR-state checks were merged into retry loops                                                          |
| 2c  | FS checks           | pass    | `fs.writeFile(dataFile, ...)` replaced with `next.patchFile('data.txt', ...)`                                                                                             |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser` with `waitForElementByCss('#not-found')`                                                                                                     |
| 2e  | Build output        | na      |                                                                                                                                                                           |
| 2f  | Dynamic logic       | na      | Single runTests() inlined                                                                                                                                                 |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                        |
| 3c  | skipStart           | na      | Not a build-only test                                                                                                                                                     |
| 3d  | No manual lifecycle | pass    | No nextBuild/nextStart/findPort/killApp                                                                                                                                   |
| 3e  | Cleanup             | pass    | data.txt restored in finally; nextTestSetup handles server                                                                                                                |
| 4a  | Directory placement | pass    | `test/production/` matches original production-only scope                                                                                                                 |
| 4b  | Mode guards         | na      |                                                                                                                                                                           |
| 4c  | Turbopack guards    | na      | Original `TURBOPACK_DEV` skip was a dedup guard for an integration suite; irrelevant in `test/production/`                                                                |
| 4d  | Dedup guards        | na      | See 4c                                                                                                                                                                    |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                           |
| 5a  | render              | pass    | Uses `next.render$` for cheerio access                                                                                                                                    |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                                                                                                                             |
| 5c  | browser             | pass    |                                                                                                                                                                           |
| 5d  | check→retry         | pass    | All three `check()` calls converted to `retry() + expect`                                                                                                                 |
| 5e  | File class          | na      |                                                                                                                                                                           |
| 5f  | waitFor             | pass    | Replaced with `retry()`                                                                                                                                                   |
| 5g  | fs operations       | pass    | `next.patchFile`                                                                                                                                                          |
| 6a  | Fixtures exist      | pass    | data.txt, pages/404.js, pages/fallback-blocking/[slug].js, pages/fallback-true/[slug].js, pages/initial-not-found/[slug].js, pages/initial-not-found/index.js all present |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                                                                                            |
| 6c  | Overrides           | na      |                                                                                                                                                                           |
| 7a  | No dead code        | pass    |                                                                                                                                                                           |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                           |
| 7c  | async/await         | pass    |                                                                                                                                                                           |
| 7d  | eslint              | pass    |                                                                                                                                                                           |

## Issues

None.

## Warnings

- **Assertion drop (1b/2b):** The original `fallback-blocking` test made explicit assertions at t=0s (404), t=1s (still 404, verifying stale-while-revalidate), t=2s (200), t=3s (cached 200 — same `random`), t=4s (re-revalidated 200 — different `random`). The converted test collapses steps 1+2 (only one 404 check) and 3+4 (only one "first 200" retry) into retry loops. Same pattern for `fallback-true`. The "eventually becomes 200, eventually random changes" behavior is still verified, but the specific SWR timing/caching behavior (serving stale while revalidating) is no longer asserted.
- **Redundant requests:** Each retry iteration calls both `next.fetch(url)` and `next.render$(url)` — two independent requests for the same URL. For SSG pages this is harmless but slightly wasteful; in theory the two responses could race during revalidation (status from fetch, body from render$). Low risk given retry semantics.
- **Stale `props` capture in fallback-blocking (line 76):** `const props = JSON.parse($('#props').text())` runs after the first retry, where `$` was last reassigned to a 200 response inside the retry — correct by accident. Readability could be improved by capturing inside the retry.
