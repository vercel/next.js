# scroll-back-restoration: PASS

Clean 1:1 conversion using `nextTestSetup` with fixtures co-located; all assertions preserved and the `runTests()` helper was inlined correctly.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                            |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 (run in 2 describes), converted: 1 (runs in both modes via nextTestSetup)                                           |
| 1b  | Assertions          | pass    | original: 7 per runTests, converted: 7                                                                                          |
| 1c  | Test titles         | pass    | 'should restore the scroll position on navigating back' preserved                                                               |
| 1d  | Describe blocks     | pass    | dev/prod sub-describes correctly collapsed (nextTestSetup handles both modes)                                                   |
| 2a  | URL paths           | pass    | '/', '/another'                                                                                                                 |
| 2b  | Response checks     | pass    |                                                                                                                                 |
| 2c  | FS checks           | na      |                                                                                                                                 |
| 2d  | Browser checks      | pass    | webdriver → next.browser, all browser.eval preserved                                                                            |
| 2e  | Build output        | na      |                                                                                                                                 |
| 2f  | Dynamic logic       | pass    | no dev/prod-specific logic in runTests                                                                                          |
| 3a  | nextTestSetup       | pass    |                                                                                                                                 |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                              |
| 3c  | skipStart           | na      |                                                                                                                                 |
| 3d  | No manual lifecycle | pass    | removed findPort/launchApp/nextStart/nextBuild/killApp                                                                          |
| 3e  | Cleanup             | pass    | afterAll removed (handled by nextTestSetup)                                                                                     |
| 4a  | Directory placement | pass    | test/e2e/ — runs both dev+prod                                                                                                  |
| 4b  | Mode guards         | na      | test is mode-agnostic                                                                                                           |
| 4c  | Turbopack guards    | na      |                                                                                                                                 |
| 4d  | Dedup guards        | na      | original dedup was due to separate dev/prod describes; nextTestSetup runs only one mode per CI job so dedup is no longer needed |
| 4e  | No incorrect env    | pass    | no TURBOPACK_DEV/TURBOPACK_BUILD usage                                                                                          |
| 5a  | render              | na      |                                                                                                                                 |
| 5b  | fetch               | na      |                                                                                                                                 |
| 5c  | browser             | pass    | webdriver(appPort, '/') → next.browser('/')                                                                                     |
| 5d  | check→retry         | na      | original already used retry()                                                                                                   |
| 5e  | File class          | na      |                                                                                                                                 |
| 5f  | waitFor             | na      |                                                                                                                                 |
| 5g  | fs operations       | na      |                                                                                                                                 |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/another.js, next.config.js present                                                                        |
| 6b  | next.config.js      | pass    | present                                                                                                                         |
| 6c  | Overrides           | na      |                                                                                                                                 |
| 7a  | No dead code        | pass    | stray console.log from original was removed                                                                                     |
| 7b  | retry over timeout  | pass    |                                                                                                                                 |
| 7c  | async/await         | pass    |                                                                                                                                 |
| 7d  | eslint              | pass    |                                                                                                                                 |

## Issues

None

## Warnings

None
