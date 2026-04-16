# fallback-route-params: PASS

Clean 1:1 conversion of a simple 2-test suite with matching fixture (`pages/[slug].js`) and equivalent dev+prod coverage via nextTestSetup.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                               |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 (×2 modes), converted: 2 (runs per mode)                                               |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                          |
| 1c  | Test titles         | pass    | Both preserved verbatim                                                                            |
| 1d  | Describe blocks     | pass    | Mode-specific describes flattened; nextTestSetup handles modes                                     |
| 2a  | URL paths           | pass    | /first, /second                                                                                    |
| 2b  | Response checks     | pass    | HTML, **NEXT_DATA**, query, initialSlug all preserved                                              |
| 2c  | FS checks           | na      |                                                                                                    |
| 2d  | Browser checks      | pass    | webdriver → next.browser; same selectors/evals                                                     |
| 2e  | Build output        | na      |                                                                                                    |
| 2f  | Dynamic logic       | pass    | runTests() inlined once; nextTestSetup provides dev+prod                                           |
| 3a  | nextTestSetup       | pass    |                                                                                                    |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                 |
| 3c  | skipStart           | na      | Not build-only                                                                                     |
| 3d  | No manual lifecycle | pass    | killApp/findPort/launchApp/nextBuild/nextStart removed                                             |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                           |
| 4a  | Directory placement | pass    | test/e2e (dev + prod)                                                                              |
| 4b  | Mode guards         | na      | Same behavior both modes                                                                           |
| 4c  | Turbopack guards    | na      |                                                                                                    |
| 4d  | Dedup guards        | pass    | TURBOPACK_DEV/BUILD describe.skip guards unnecessary; nextTestSetup drives mode via NEXT_TEST_MODE |
| 4e  | No incorrect env    | pass    |                                                                                                    |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                        |
| 5b  | fetch               | na      |                                                                                                    |
| 5c  | browser             | pass    | webdriver → next.browser                                                                           |
| 5d  | check→retry         | na      |                                                                                                    |
| 5e  | File class          | na      |                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                    |
| 5g  | fs operations       | pass    | fs.remove removed; nextTestSetup isolates                                                          |
| 6a  | Fixtures exist      | pass    | pages/[slug].js present                                                                            |
| 6b  | next.config.js      | na      | Original had none                                                                                  |
| 6c  | Overrides           | na      |                                                                                                    |
| 7a  | No dead code        | pass    |                                                                                                    |
| 7b  | retry over timeout  | pass    |                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                    |

## Issues

None.

## Warnings

None.
