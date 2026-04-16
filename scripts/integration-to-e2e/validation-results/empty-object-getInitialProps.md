# empty-object-getInitialProps: PASS

Clean conversion: all 3 tests preserved with equivalent behavior, correct dev-only placement, and proper API migration.

## Criteria

| #   | Criterion           | Verdict | Note                                                      |
| --- | ------------------- | ------- | --------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                 |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                 |
| 1c  | Test titles         | pass    | All preserved (minor wording, "It should"→"should")       |
| 1d  | Describe blocks     | pass    | Single describe, renamed to suite name                    |
| 2a  | URL paths           | pass    | '/', '/static', '/another' all exercised                  |
| 2b  | Response checks     | pass    | cliOutput match/not-match preserved                       |
| 2c  | FS checks           | na      |                                                           |
| 2d  | Browser checks      | pass    | next.browser used equivalently                            |
| 2e  | Build output        | na      |                                                           |
| 2f  | Dynamic logic       | na      |                                                           |
| 3a  | nextTestSetup       | pass    |                                                           |
| 3b  | files param         | pass    | files: \_\_dirname                                        |
| 3c  | skipStart           | na      | Dev server test                                           |
| 3d  | No manual lifecycle | pass    |                                                           |
| 3e  | Cleanup             | pass    | Handled by setup                                          |
| 4a  | Directory placement | pass    | test/development/ correct (launchApp = dev-only)          |
| 4b  | Mode guards         | na      |                                                           |
| 4c  | Turbopack guards    | na      |                                                           |
| 4d  | Dedup guards        | na      |                                                           |
| 4e  | No incorrect env    | pass    |                                                           |
| 5a  | render              | pass    | renderViaHTTP → next.render                               |
| 5b  | fetch               | na      |                                                           |
| 5c  | browser             | pass    | webdriver → next.browser                                  |
| 5d  | check→retry         | pass    | check() replaced with retry+expect                        |
| 5e  | File class          | na      |                                                           |
| 5f  | waitFor             | pass    | Replaced with retry()                                     |
| 5g  | fs operations       | na      |                                                           |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/another.js, pages/static.js present |
| 6b  | next.config.js      | na      | Original had none                                         |
| 6c  | Overrides           | na      |                                                           |
| 7a  | No dead code        | pass    |                                                           |
| 7b  | retry over timeout  | pass    |                                                           |
| 7c  | async/await         | pass    |                                                           |
| 7d  | eslint              | pass    |                                                           |

## Issues

None

## Warnings

None
