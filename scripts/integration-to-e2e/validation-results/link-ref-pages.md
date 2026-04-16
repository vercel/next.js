# link-ref-pages: PASS

Clean conversion preserving all 11 tests and behaviors; fixtures fully migrated to `test/e2e/link-ref-pages`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                     |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 11, converted: 11                                                                                              |
| 1b  | Assertions          | pass    | original: 2 expect, converted: 2 expect                                                                                  |
| 1c  | Test titles         | pass    | All preserved verbatim                                                                                                   |
| 1d  | Describe blocks     | pass    | Outer `Invalid hrefs` renamed to `Link ref forwarding` (acceptable), dev/prod preserved                                  |
| 2a  | URL paths           | pass    | `/`, `/click-away-race-condition`, `/function`, `/class`, `/child-ref*` all covered                                      |
| 2b  | Response checks     | pass    | Equivalent DOM/eval assertions                                                                                           |
| 2c  | FS checks           | na      |                                                                                                                          |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser` with same selectors/interactions                                                            |
| 2e  | Build output        | na      |                                                                                                                          |
| 2f  | Dynamic logic       | pass    | `runCommonTests` preserved; dev/prod split via `isNextDev`/`isNextStart`                                                 |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                       |
| 3c  | skipStart           | na      | Not build-only                                                                                                           |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                                                                            |
| 3e  | Cleanup             | pass    | `browser.close()` still present where used                                                                               |
| 4a  | Directory placement | pass    | `test/e2e/` — runs in both dev and start                                                                                 |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` mirror original dev/prod describes                                                             |
| 4c  | Turbopack guards    | na      | Original didn't skip Turbopack outright                                                                                  |
| 4d  | Dedup guards        | na      | Original's `TURBOPACK_DEV`/`TURBOPACK_BUILD` dedup handled implicitly by e2e harness running one mode per invocation     |
| 4e  | No incorrect env    | pass    | No TURBOPACK\_\* env checks                                                                                              |
| 5a  | render              | na      |                                                                                                                          |
| 5b  | fetch               | na      |                                                                                                                          |
| 5c  | browser             | pass    | `webdriver(port, path)` → `next.browser(path)`                                                                           |
| 5d  | check→retry         | na      | Original already used `retry`                                                                                            |
| 5e  | File class          | na      |                                                                                                                          |
| 5f  | waitFor             | pass    | `waitFor(1000)` replaced with `retry()` around `expect(errors).toEqual([])`                                              |
| 5g  | fs operations       | pass    | `appDir` → `next.testDir` for `getClientBuildManifestLoaderChunkUrlPath`                                                 |
| 6a  | Fixtures exist      | pass    | All 7 pages copied: index, function, class, child-ref, child-ref-func, child-ref-func-cleanup, click-away-race-condition |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                                           |
| 6c  | Overrides           | na      |                                                                                                                          |
| 7a  | No dead code        | pass    |                                                                                                                          |
| 7b  | retry over timeout  | pass    | `waitFor(1000)` correctly replaced with `retry()`                                                                        |
| 7c  | async/await         | pass    |                                                                                                                          |
| 7d  | eslint              | pass    |                                                                                                                          |

## Issues

None

## Warnings

None
