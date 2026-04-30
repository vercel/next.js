# chunking: PASS

High-fidelity conversion: all 9 tests preserved with equivalent assertions, Turbopack skip guard correctly placed outside `nextTestSetup`, and fixtures/deps (lodash, webpack-bundle-analyzer) properly declared.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                           |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 9, converted: 9                                                                                      |
| 1b  | Assertions          | pass    | original: 9, converted: 9                                                                                      |
| 1c  | Test titles         | pass    | All preserved verbatim                                                                                         |
| 1d  | Describe blocks     | pass    | 'production mode' describe dropped (handled by test/production/ placement); 'Chunking' and 'Serving' preserved |
| 2a  | URL paths           | pass    | /, /page2, /page3 all preserved                                                                                |
| 2b  | Response checks     | pass    | Preload/script/buildManifest checks preserved                                                                  |
| 2c  | FS checks           | pass    | stats.json uses next.readFile; chunks dir uses fs on next.testDir (isolated copy)                              |
| 2d  | Browser checks      | pass    | webdriver → next.browser with identical selectors                                                              |
| 2e  | Build output        | pass    | nextBuild replaced by nextTestSetup lifecycle                                                                  |
| 2f  | Dynamic logic       | na      | Single mode only                                                                                               |
| 3a  | nextTestSetup       | pass    | Used from e2e-utils                                                                                            |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                             |
| 3c  | skipStart           | na      | Server required for browser/render tests                                                                       |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/nextBuild/nextStart                                                                        |
| 3e  | Cleanup             | pass    | No cleanup needed; chunks pre-cleanup obviated by isolated testDir                                             |
| 4a  | Directory placement | pass    | test/production/ matches production-mode-only original                                                         |
| 4b  | Mode guards         | na      | Production only                                                                                                |
| 4c  | Turbopack guards    | pass    | IS_TURBOPACK_TEST skip wraps OUTSIDE nextTestSetup                                                             |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_DEV dedup handled by test/production/ placement + IS_TURBOPACK_TEST outer skip              |
| 4e  | No incorrect env    | pass    | Only IS_TURBOPACK_TEST used                                                                                    |
| 5a  | render              | pass    | renderViaHTTP → next.render$                                                                                   |
| 5b  | fetch               | na      | No fetch usage                                                                                                 |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                       |
| 5d  | check→retry         | na      | No check() calls                                                                                               |
| 5e  | File class          | na      |                                                                                                                |
| 5f  | waitFor             | na      |                                                                                                                |
| 5g  | fs operations       | pass    | Direct fs used only on next.testDir (isolated); stats.json migrated to next.readFile                           |
| 6a  | Fixtures exist      | pass    | pages/{index,page1,page2,page3}.js, components/one.js, next.config.js                                          |
| 6b  | next.config.js      | pass    | Identical to original (BundleAnalyzerPlugin)                                                                   |
| 6c  | Overrides           | na      |                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                |
| 7b  | retry over timeout  | pass    | No polling needed                                                                                              |
| 7c  | async/await         | pass    |                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                |

## Issues

None

## Warnings

None
