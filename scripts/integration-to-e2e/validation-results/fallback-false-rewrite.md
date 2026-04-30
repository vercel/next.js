# fallback-false-rewrite: PASS

Clean 1:1 conversion — all 7 tests, assertions, and fixtures preserved with standard API migrations.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                 |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 7 (in runTests, run twice), converted: 7 (runs twice via harness)                          |
| 1b  | Assertions          | pass    | original: 18 per mode, converted: 18 per mode                                                        |
| 1c  | Test titles         | pass    | All 7 preserved verbatim                                                                             |
| 1d  | Describe blocks     | pass    | dev/prod describe blocks flattened; harness handles modes                                            |
| 2a  | URL paths           | pass    | /hello, /hello/world, /first, /second, /[slug] all preserved                                         |
| 2b  | Response checks     | pass    | status/text/cheerio selectors match                                                                  |
| 2c  | FS checks           | na      | none                                                                                                 |
| 2d  | Browser checks      | pass    | webdriver → next.browser                                                                             |
| 2e  | Build output        | na      | none                                                                                                 |
| 2f  | Dynamic logic       | pass    | runTests() inlined; same tests run in both modes via harness                                         |
| 3a  | nextTestSetup       | pass    |                                                                                                      |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                   |
| 3c  | skipStart           | na      | not build-only                                                                                       |
| 3d  | No manual lifecycle | pass    |                                                                                                      |
| 3e  | Cleanup             | pass    | handled by harness                                                                                   |
| 4a  | Directory placement | pass    | test/e2e (runs in both dev and prod)                                                                 |
| 4b  | Mode guards         | na      | same tests in both modes                                                                             |
| 4c  | Turbopack guards    | na      |                                                                                                      |
| 4d  | Dedup guards        | warn    | original had TURBOPACK_DEV/BUILD dedup guards; not carried over (acceptable — harness manages modes) |
| 4e  | No incorrect env    | pass    |                                                                                                      |
| 5a  | render              | na      |                                                                                                      |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                            |
| 5c  | browser             | pass    | webdriver → next.browser                                                                             |
| 5d  | check→retry         | na      |                                                                                                      |
| 5e  | File class          | na      |                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                      |
| 5g  | fs operations       | na      |                                                                                                      |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/[slug].js, pages/another.js present                                            |
| 6b  | next.config.js      | pass    | present                                                                                              |
| 6c  | Overrides           | na      |                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                      |
| 7b  | retry over timeout  | na      |                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                      |

## Issues

None

## Warnings

- Original's `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards weren't preserved as explicit skips. Acceptable since e2e harness selects mode via `NEXT_TEST_MODE`, but CI matrix config should ensure the suite isn't run redundantly.
