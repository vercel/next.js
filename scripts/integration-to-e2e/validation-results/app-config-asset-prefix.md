Fixtures match. Writing result.

# app-config-asset-prefix: PASS

Clean conversion of a single-test dev-only suite; fixtures and assertions fully preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                              |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                         |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                         |
| 1c  | Test titles         | pass    | preserved verbatim                                                                |
| 1d  | Describe blocks     | pass    | single describe preserved                                                         |
| 2a  | URL paths           | pass    | `/` preserved                                                                     |
| 2b  | Response checks     | pass    | title text assertion preserved                                                    |
| 2c  | FS checks           | na      |                                                                                   |
| 2d  | Browser checks      | pass    | webdriver→next.browser, elementById preserved                                     |
| 2e  | Build output        | na      |                                                                                   |
| 2f  | Dynamic logic       | na      |                                                                                   |
| 3a  | nextTestSetup       | pass    |                                                                                   |
| 3b  | files param         | pass    | `__dirname`                                                                       |
| 3c  | skipStart           | na      | dev-mode test                                                                     |
| 3d  | No manual lifecycle | pass    |                                                                                   |
| 3e  | Cleanup             | pass    | try/finally browser.close dropped — handled by harness                            |
| 4a  | Directory placement | pass    | test/development correct (original used launchApp only)                           |
| 4b  | Mode guards         | na      |                                                                                   |
| 4c  | Turbopack guards    | na      |                                                                                   |
| 4d  | Dedup guards        | na      |                                                                                   |
| 4e  | No incorrect env    | pass    |                                                                                   |
| 5a  | render              | na      |                                                                                   |
| 5b  | fetch               | na      |                                                                                   |
| 5c  | browser             | pass    |                                                                                   |
| 5d  | check→retry         | na      |                                                                                   |
| 5e  | File class          | na      |                                                                                   |
| 5f  | waitFor             | pass    | removed `waitFor(2000)` — waitForNoRedbox already polls                           |
| 5g  | fs operations       | na      |                                                                                   |
| 6a  | Fixtures exist      | pass    | app/layout.js, app/page.js, next.config.js present and byte-identical to original |
| 6b  | next.config.js      | pass    | identical                                                                         |
| 6c  | Overrides           | na      |                                                                                   |
| 7a  | No dead code        | pass    |                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                   |
| 7c  | async/await         | pass    |                                                                                   |
| 7d  | eslint              | pass    |                                                                                   |

## Issues

None

## Warnings

None
