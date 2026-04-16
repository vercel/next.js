# critical-css: PASS

Clean, faithful conversion of a production-mode CSS optimization test; all 4 tests and assertions preserved with correct fixture layout and API migration.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 4, converted: 4                                                                                                                                           |
| 1b  | Assertions          | pass    | original: 6, converted: 6                                                                                                                                           |
| 1c  | Test titles         | pass    | All 4 titles preserved verbatim                                                                                                                                     |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner "production mode" collapsed appropriately since dir is test/production/                                                             |
| 2a  | URL paths           | pass    | '/' and '/another' preserved                                                                                                                                        |
| 2b  | Response checks     | pass    | Same regex matchers preserved                                                                                                                                       |
| 2c  | FS checks           | pass    | Uses next.readJSON and glob on next.testDir instead of appDir                                                                                                       |
| 2d  | Browser checks      | na      | No webdriver in original                                                                                                                                            |
| 2e  | Build output        | na      | No build-output assertions                                                                                                                                          |
| 2f  | Dynamic logic       | na      | No runTests(mode) branching                                                                                                                                         |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from 'e2e-utils'                                                                                                                                 |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                                  |
| 3c  | skipStart           | na      | Test starts server to render HTML                                                                                                                                   |
| 3d  | No manual lifecycle | pass    | No killApp/findPort/nextBuild imports                                                                                                                               |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup; static next.config.js replaces dynamic write/remove                                                                                       |
| 4a  | Directory placement | pass    | test/production/ matches original's production-only coverage                                                                                                        |
| 4b  | Mode guards         | na      | Production-only, no dev path                                                                                                                                        |
| 4c  | Turbopack guards    | na      | Not a webpack/turbopack-only test                                                                                                                                   |
| 4d  | Dedup guards        | warn    | Original used `process.env.TURBOPACK_DEV ? describe.skip : describe`; not carried over. Acceptable since test/production/ only runs in start mode, but worth noting |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD skip logic used                                                                                                                              |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                                                                                         |
| 5b  | fetch               | na      | No fetchViaHTTP                                                                                                                                                     |
| 5c  | browser             | na      | No webdriver                                                                                                                                                        |
| 5d  | check→retry         | na      | No check() usage                                                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                                                                                     |
| 5g  | fs operations       | pass    | fs.readJSON(appDir,...) → next.readJSON(...)                                                                                                                        |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/another.js, pages/\_app.js, components/hello.js, styles/\*, next.config.js all present                                                        |
| 6b  | next.config.js      | pass    | Static file with `experimental.optimizeCss: true` replaces dynamic beforeAll write                                                                                  |
| 6c  | Overrides           | pass    | disableAutoSkewProtection passed into nextTestSetup                                                                                                                 |
| 7a  | No dead code        | pass    |                                                                                                                                                                     |
| 7b  | retry over timeout  | pass    | No timers used                                                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                                                                                     |

## Issues

None.

## Warnings

- 4d: Original wrapped the production-mode describe with `process.env.TURBOPACK_DEV ? describe.skip : describe` as a dedup guard. The converted file omits this, which is benign for test/production/ (does not execute in turbopack dev anyway) but worth documenting if CI later runs production tests under that flag.
