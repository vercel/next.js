# fetch-polyfill: PASS

Conversion faithfully migrates all 5 tests from the integration suite, replacing the external api-server.js script with an inline http server that mirrors its behavior exactly, and uses `skipStart: true` + manual `next.build()/next.start()` to set env vars before startup.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                               |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 5, converted: 5                                                                                          |
| 1b  | Assertions          | pass    | original: 6 expects, converted: 6 expects                                                                          |
| 1c  | Test titles         | pass    | All 5 titles preserved verbatim                                                                                    |
| 1d  | Describe blocks     | pass    | Inner dev/prod describes flattened; mode handled via isNextDev + e2e runner                                        |
| 2a  | URL paths           | pass    | /static, /ssr, /getinitialprops, /api/api-route, /user/a, /user/b all covered                                      |
| 2b  | Response checks     | pass    | Same cheerio selectors and text/match assertions                                                                   |
| 2c  | FS checks           | na      | No fs assertions                                                                                                   |
| 2d  | Browser checks      | na      | No webdriver usage                                                                                                 |
| 2e  | Build output        | pass    | next.build() called in non-dev branch                                                                              |
| 2f  | Dynamic logic       | pass    | runTests() inlined; mode handled via isNextDev guard                                                               |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from 'e2e-utils'                                                                                |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                 |
| 3c  | skipStart           | pass    | skipStart: true, then build/start in beforeAll                                                                     |
| 3d  | No manual lifecycle | pass    | Only findPort used (for auxiliary http server, not Next.js lifecycle)                                              |
| 3e  | Cleanup             | pass    | afterAll closes the auxiliary apiServer                                                                            |
| 4a  | Directory placement | pass    | test/e2e/ correct — runs in both dev and prod                                                                      |
| 4b  | Mode guards         | pass    | isNextDev correctly skips next.build()                                                                             |
| 4c  | Turbopack guards    | na      | No turbopack-only skips needed                                                                                     |
| 4d  | Dedup guards        | na      | Original TURBOPACK_DEV/BUILD guards were mode-splitters, not dedup; not needed since e2e runner runs once per mode |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD usage                                                                                       |
| 5a  | render              | pass    | renderViaHTTP → next.render()                                                                                      |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch()                                                                                        |
| 5c  | browser             | na      |                                                                                                                    |
| 5d  | check→retry         | na      | No check() usage                                                                                                   |
| 5e  | File class          | na      |                                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                                    |
| 5g  | fs operations       | na      |                                                                                                                    |
| 6a  | Fixtures exist      | pass    | pages/static.js, ssr.js, getinitialprops.js, api/api-route.js, user/[username].js all present                      |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                                     |
| 6c  | Overrides           | na      |                                                                                                                    |
| 7a  | No dead code        | pass    |                                                                                                                    |
| 7b  | retry over timeout  | pass    | No setTimeout used                                                                                                 |
| 7c  | async/await         | pass    | All awaits proper                                                                                                  |
| 7d  | eslint              | pass    |                                                                                                                    |

## Issues

None

## Warnings

None
