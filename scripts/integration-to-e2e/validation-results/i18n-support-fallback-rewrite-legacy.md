# i18n-support-fallback-rewrite-legacy: PASS

Clean conversion: both tests, fixtures, and behavior preserved; `waitFor(1000)` correctly replaced with `retry()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                           |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                           |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                      |
| 1d  | Describe blocks     | pass    | dev/prod describes flattened into single e2e describe (handled by nextTestSetup)                    |
| 2a  | URL paths           | pass    | All 12 path/query combinations preserved                                                            |
| 2b  | Response checks     | pass    | Identical expect shapes                                                                             |
| 2c  | FS checks           | na      | None in original                                                                                    |
| 2d  | Browser checks      | pass    | webdriver → next.browser with same selectors                                                        |
| 2e  | Build output        | na      | Not checked in original                                                                             |
| 2f  | Dynamic logic       | na      | runTests() ran identically in both modes                                                            |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                                                   |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                  |
| 3c  | skipStart           | na      | Not build-only                                                                                      |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/launchApp                                                                       |
| 3e  | Cleanup             | pass    | No extra cleanup needed; nextConfig.restore() unnecessary in isolated copy                          |
| 4a  | Directory placement | pass    | test/e2e/ correct for dev+prod                                                                      |
| 4b  | Mode guards         | na      | Tests identical in both modes                                                                       |
| 4c  | Turbopack guards    | na      | Not Turbopack-specific                                                                              |
| 4d  | Dedup guards        | na      | e2e-utils runs one mode per CI job; original describe-skip guards naturally subsumed                |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD usage                                                                        |
| 5a  | render              | na      |                                                                                                     |
| 5b  | fetch               | na      |                                                                                                     |
| 5c  | browser             | pass    | webdriver → next.browser                                                                            |
| 5d  | check→retry         | na      | No check() in original                                                                              |
| 5e  | File class          | pass    | `new File(next.config.js)` + nextConfig.restore() dropped (isolated copy makes restore unnecessary) |
| 5f  | waitFor             | pass    | waitFor(1000) replaced with retry() polling                                                         |
| 5g  | fs operations       | pass    | fs.remove(.next) dropped (isolated copy)                                                            |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/another.js, pages/dynamic/[slug].js, next.config.js all present               |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                              |
| 6c  | Overrides           | na      |                                                                                                     |
| 7a  | No dead code        | pass    |                                                                                                     |
| 7b  | retry over timeout  | pass    |                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                     |

## Issues

None

## Warnings

None
