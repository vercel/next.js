# no-page-props: PASS

Clean 1:1 conversion of an integration test that ran in both dev and prod; all 5 tests, assertions, and fixtures preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                          |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5 (in runTests, used 2x), converted: 5 (runs in dev+prod via nextTestSetup)                         |
| 1b  | Assertions          | pass    | All expects preserved per test                                                                                |
| 1c  | Test titles         | pass    | All 5 titles preserved verbatim                                                                               |
| 1d  | Describe blocks     | pass    | Outer describe preserved; mode-specific describes appropriately collapsed                                     |
| 2a  | URL paths           | pass    | /, /gsp, /gssp, /non-existent                                                                                 |
| 2b  | Response checks     | pass    | All browser assertions preserved                                                                              |
| 2c  | FS checks           | na      |                                                                                                               |
| 2d  | Browser checks      | pass    | webdriver→next.browser with identical selectors                                                               |
| 2e  | Build output        | na      |                                                                                                               |
| 2f  | Dynamic logic       | pass    | runTests() inlined; behavior identical across modes                                                           |
| 3a  | nextTestSetup       | pass    |                                                                                                               |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                            |
| 3c  | skipStart           | na      |                                                                                                               |
| 3d  | No manual lifecycle | pass    |                                                                                                               |
| 3e  | Cleanup             | pass    |                                                                                                               |
| 4a  | Directory placement | pass    | test/e2e/ correct for dual-mode test                                                                          |
| 4b  | Mode guards         | na      | No mode-divergent behavior                                                                                    |
| 4c  | Turbopack guards    | na      |                                                                                                               |
| 4d  | Dedup guards        | warn    | Original had TURBOPACK_DEV/TURBOPACK_BUILD dedup guards; converted relies on nextTestSetup/CI matrix defaults |
| 4e  | No incorrect env    | pass    |                                                                                                               |
| 5a  | render              | na      |                                                                                                               |
| 5b  | fetch               | na      |                                                                                                               |
| 5c  | browser             | pass    | webdriver→next.browser                                                                                        |
| 5d  | check→retry         | na      |                                                                                                               |
| 5e  | File class          | na      |                                                                                                               |
| 5f  | waitFor             | na      |                                                                                                               |
| 5g  | fs operations       | na      |                                                                                                               |
| 6a  | Fixtures exist      | pass    | pages/\_app.js, pages/index.js, pages/gsp.js, pages/gssp.js present                                           |
| 6b  | next.config.js      | na      | Original had none                                                                                             |
| 6c  | Overrides           | na      |                                                                                                               |
| 7a  | No dead code        | pass    |                                                                                                               |
| 7b  | retry over timeout  | pass    |                                                                                                               |
| 7c  | async/await         | pass    |                                                                                                               |
| 7d  | eslint              | pass    |                                                                                                               |

## Issues

None

## Warnings

- 4d: Original used `process.env.TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards on the dev/prod describes. The converted test drops them and relies on `nextTestSetup`'s default dev+prod coverage plus the CI matrix. This is the typical modern pattern but worth flagging since the original explicitly had dedup wiring.
