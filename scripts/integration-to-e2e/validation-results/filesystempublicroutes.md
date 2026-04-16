# filesystempublicroutes: PASS

Clean 1:1 conversion using `startCommand` + `serverReadyPattern` for the custom server pattern; all tests, assertions, and fixtures preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 4, converted: 4                                                                             |
| 1b  | Assertions          | pass    | original: 8, converted: 8                                                                             |
| 1c  | Test titles         | pass    | All 4 preserved verbatim                                                                              |
| 1d  | Describe blocks     | pass    | Single describe preserved                                                                             |
| 2a  | URL paths           | pass    | /, /exportpathmap-route (fetch + browser), /hello.txt all present                                     |
| 2b  | Response checks     | pass    | status + body text matching preserved                                                                 |
| 2c  | FS checks           | na      |                                                                                                       |
| 2d  | Browser checks      | pass    | webdriver → next.browser with same selector/assertion                                                 |
| 2e  | Build output        | na      |                                                                                                       |
| 2f  | Dynamic logic       | na      |                                                                                                       |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup with startCommand (custom-server pattern)                                          |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                    |
| 3c  | skipStart           | na      | Custom server, not build-only                                                                         |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/initNextServerScript; custom server exception                                     |
| 3e  | Cleanup             | pass    | nextTestSetup manages the custom server process                                                       |
| 4a  | Directory placement | pass    | test/e2e/ matches original coverage                                                                   |
| 4b  | Mode guards         | na      |                                                                                                       |
| 4c  | Turbopack guards    | na      |                                                                                                       |
| 4d  | Dedup guards        | na      |                                                                                                       |
| 4e  | No incorrect env    | pass    |                                                                                                       |
| 5a  | render              | na      |                                                                                                       |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                             |
| 5c  | browser             | pass    | webdriver → next.browser                                                                              |
| 5d  | check→retry         | na      |                                                                                                       |
| 5e  | File class          | na      |                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                       |
| 5g  | fs operations       | na      |                                                                                                       |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/index.js, pages/exportpathmap-route.js, public/hello.txt, server.js all present |
| 6b  | next.config.js      | pass    | Copied into fixture dir                                                                               |
| 6c  | Overrides           | pass    | server.js adapted to use get-port + `- Local:` ready pattern; dependencies declare get-port           |
| 7a  | No dead code        | pass    |                                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                       |

## Issues

None

## Warnings

None
