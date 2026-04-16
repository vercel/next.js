# 404-page: PASS

Clean conversion: all 18 original tests preserved, assertions maintained, proper nextTestSetup split (live + skipStart build validation describes), and correct mode guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                       |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 18 it(), converted: 18 it()                                                                      |
| 1b  | Assertions          | pass    | original: ~26, converted: ~30                                                                              |
| 1c  | Test titles         | pass    | All 18 preserved verbatim                                                                                  |
| 1d  | Describe blocks     | pass    | Flattened via isNextDev/isNextStart guards; build-only tests split into second describe with skipStart     |
| 2a  | URL paths           | pass    | /abc, /invalidExtension, /404, /err, /\_next/abc all covered                                               |
| 2b  | Response checks     | pass    | Status, Cache-Control header, body text all checked                                                        |
| 2c  | FS checks           | pass    | next.readJSON/hasFile replace fs.pathExists and getPageFileFromPagesManifest                               |
| 2d  | Browser checks      | na      | No webdriver used                                                                                          |
| 2e  | Build output        | pass    | next.build() exitCode + next.cliOutput replaces nextBuild stderr/code                                      |
| 2f  | Dynamic logic       | pass    | runTests(mode) inlined with isNextDev/isNextStart guards                                                   |
| 3a  | nextTestSetup       | pass    | Both describes use nextTestSetup                                                                           |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                         |
| 3c  | skipStart           | pass    | Build validation describe uses skipStart: true with explicit next.build()/next.start()                     |
| 3d  | No manual lifecycle | pass    | No killApp/findPort/launchApp                                                                              |
| 3e  | Cleanup             | pass    | Uses try/finally with patchFile restore; no external resources                                             |
| 4a  | Directory placement | pass    | test/e2e/ correct for mixed dev+prod                                                                       |
| 4b  | Mode guards         | pass    | isNextDev/isNextStart guards match original's dev/server branches                                          |
| 4c  | Turbopack guards    | na      | No Turbopack-specific skips needed                                                                         |
| 4d  | Dedup guards        | pass    | Original's TURBOPACK_DEV/TURBOPACK_BUILD dedup is naturally handled by NEXT_TEST_MODE-driven nextTestSetup |
| 4e  | No incorrect env    | pass    | Uses isNextDev/isNextStart                                                                                 |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                                |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                                  |
| 5c  | browser             | na      |                                                                                                            |
| 5d  | check→retry         | pass    | check(() => stderr, gip404Err) → retry + expect(next.cliOutput)                                            |
| 5e  | File class          | na      |                                                                                                            |
| 5f  | waitFor             | pass    | waitFor(1000) replaced with retry()                                                                        |
| 5g  | fs operations       | pass    | fs.readJSON/fs.pathExists → next.readJSON/next.hasFile                                                     |
| 6a  | Fixtures exist      | pass    | pages/404.js, pages/err.js, pages/index.js, pages/invalidExtension.d.ts, next.config.js all present        |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                     |
| 6c  | Overrides           | na      |                                                                                                            |
| 7a  | No dead code        | pass    | No commented-out tests or unused imports                                                                   |
| 7b  | retry over timeout  | pass    | retry() used; no setTimeout                                                                                |
| 7c  | async/await         | pass    | All async ops awaited                                                                                      |
| 7d  | eslint              | pass    | No obvious violations                                                                                      |

## Issues

None

## Warnings

None
