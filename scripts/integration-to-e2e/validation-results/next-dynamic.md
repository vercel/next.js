# next-dynamic: PASS

Clean 1:1 conversion of the next/dynamic integration test into a single e2e test with matching fixtures.

## Criteria

| #   | Criterion           | Verdict | Note                                                                            |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 unique (run in dev + prod), converted: 2                            |
| 1b  | Assertions          | pass    | original: 5 unique expects, converted: 5                                        |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                  |
| 1d  | Describe blocks     | pass    | Outer `next/dynamic` preserved; dev/prod describes collapsed (e2e runs both)    |
| 2a  | URL paths           | pass    | `/` via render and browser both preserved                                       |
| 2b  | Response checks     | pass    | HTML regex, element text, window.caughtErrors, logs all preserved               |
| 2c  | FS checks           | na      |                                                                                 |
| 2d  | Browser checks      | pass    | webdriver → next.browser with same selectors                                    |
| 2e  | Build output        | na      |                                                                                 |
| 2f  | Dynamic logic       | na      | runTests ran identically in both modes                                          |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                               |
| 3b  | files param         | pass    | files: \_\_dirname                                                              |
| 3c  | skipStart           | na      |                                                                                 |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextServer/startApp                                       |
| 3e  | Cleanup             | pass    | No custom resources                                                             |
| 4a  | Directory placement | pass    | test/e2e (original ran in both modes)                                           |
| 4b  | Mode guards         | na      | Behavior identical in both modes                                                |
| 4c  | Turbopack guards    | na      | Original guards were dedup, not skip-by-bundler                                 |
| 4d  | Dedup guards        | na      | e2e harness handles mode dedup automatically                                    |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD checks                                                   |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                     |
| 5b  | fetch               | na      |                                                                                 |
| 5c  | browser             | pass    | webdriver → next.browser                                                        |
| 5d  | check→retry         | na      |                                                                                 |
| 5e  | File class          | na      |                                                                                 |
| 5f  | waitFor             | na      |                                                                                 |
| 5g  | fs operations       | na      |                                                                                 |
| 6a  | Fixtures exist      | pass    | pages/index.js, components/{one,two,three,four}.js, apples/index.js all present |
| 6b  | next.config.js      | na      | Original had none either                                                        |
| 6c  | Overrides           | na      |                                                                                 |
| 7a  | No dead code        | pass    |                                                                                 |
| 7b  | retry over timeout  | pass    |                                                                                 |
| 7c  | async/await         | pass    |                                                                                 |
| 7d  | eslint              | pass    |                                                                                 |

## Issues

None

## Warnings

None
