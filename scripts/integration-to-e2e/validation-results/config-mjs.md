# config-mjs: PASS

Clean 1:1 conversion of 3 dev-mode tests with fixtures intact.

## Criteria

| #   | Criterion           | Verdict | Note                                                                       |
| --- | ------------------- | ------- | -------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                  |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                  |
| 1c  | Test titles         | pass    | All preserved                                                              |
| 1d  | Describe blocks     | pass    | Single describe renamed appropriately                                      |
| 2a  | URL paths           | pass    | /, /module-only-content, /next-config                                      |
| 2b  | Response checks     | pass    | header, text, env value all preserved                                      |
| 2c  | FS checks           | na      |                                                                            |
| 2d  | Browser checks      | pass    | webdriver → next.browser                                                   |
| 2e  | Build output        | na      |                                                                            |
| 2f  | Dynamic logic       | na      |                                                                            |
| 3a  | nextTestSetup       | pass    |                                                                            |
| 3b  | files param         | pass    | files: \_\_dirname                                                         |
| 3c  | skipStart           | na      | Dev-mode test                                                              |
| 3d  | No manual lifecycle | pass    | launchApp/killApp removed                                                  |
| 3e  | Cleanup             | pass    | beforeAll/afterAll no longer needed                                        |
| 4a  | Directory placement | pass    | Original used launchApp only → test/development/ correct                   |
| 4b  | Mode guards         | na      |                                                                            |
| 4c  | Turbopack guards    | na      |                                                                            |
| 4d  | Dedup guards        | na      |                                                                            |
| 4e  | No incorrect env    | pass    |                                                                            |
| 5a  | render              | pass    | renderViaHTTP → next.render$                                               |
| 5b  | fetch               | pass    | node-fetch → next.fetch                                                    |
| 5c  | browser             | pass    | webdriver → next.browser                                                   |
| 5d  | check→retry         | na      |                                                                            |
| 5e  | File class          | na      |                                                                            |
| 5f  | waitFor             | na      |                                                                            |
| 5g  | fs operations       | na      |                                                                            |
| 6a  | Fixtures exist      | pass    | pages/, components/, node_modules/, next.config.mjs present                |
| 6b  | next.config.js      | pass    | next.config.mjs copied                                                     |
| 6c  | Overrides           | na      |                                                                            |
| 7a  | No dead code        | pass    | Pre-warm renderViaHTTP correctly dropped (nextTestSetup handles readiness) |
| 7b  | retry over timeout  | na      |                                                                            |
| 7c  | async/await         | pass    |                                                                            |
| 7d  | eslint              | pass    |                                                                            |

## Issues

None

## Warnings

None
