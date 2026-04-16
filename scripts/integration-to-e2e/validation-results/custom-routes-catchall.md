Fixtures match. Writing the validation report.

# custom-routes-catchall: PASS

Clean conversion — all 4 tests preserved with identical assertions, fixtures copied verbatim, correct dedup guard for Turbopack dev/build splits.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                     |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 4 (runTests run 2x = 8 executions), converted: 4                                               |
| 1b  | Assertions          | pass    | original: 4 per run, converted: 4                                                                        |
| 1c  | Test titles         | pass    | All 4 titles preserved verbatim                                                                          |
| 1d  | Describe blocks     | pass    | Dev/prod describes flattened into single describe with dedup guard                                       |
| 2a  | URL paths           | pass    | /docs/hello, /docs/\_next/static/{buildId}/\_buildManifest.js, /docs/static/data.json, /docs/another.txt |
| 2b  | Response checks     | pass    | Same toMatch/toContain assertions                                                                        |
| 2c  | FS checks           | pass    | buildId now via next.buildId instead of fs.readFile                                                      |
| 2d  | Browser checks      | na      |                                                                                                          |
| 2e  | Build output        | na      |                                                                                                          |
| 2f  | Dynamic logic       | pass    | runTests() ran same in dev/prod; single set suffices                                                     |
| 3a  | nextTestSetup       | pass    |                                                                                                          |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                       |
| 3c  | skipStart           | na      | Runs in both modes                                                                                       |
| 3d  | No manual lifecycle | pass    |                                                                                                          |
| 3e  | Cleanup             | pass    |                                                                                                          |
| 4a  | Directory placement | pass    | test/e2e/ appropriate (dev+prod)                                                                         |
| 4b  | Mode guards         | na      | Same tests run in both modes                                                                             |
| 4c  | Turbopack guards    | pass    | Outer describe wrapper, not inside setup                                                                 |
| 4d  | Dedup guards        | pass    | (isNextDev && TURBOPACK_BUILD) \|\| (isNextStart && TURBOPACK_DEV) preserves original split              |
| 4e  | No incorrect env    | pass    | Used alongside isNextDev/isNextStart per spec                                                            |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                              |
| 5b  | fetch               | na      |                                                                                                          |
| 5c  | browser             | na      |                                                                                                          |
| 5d  | check→retry         | na      |                                                                                                          |
| 5e  | File class          | na      |                                                                                                          |
| 5f  | waitFor             | na      |                                                                                                          |
| 5g  | fs operations       | pass    | buildId from next.buildId                                                                                |
| 6a  | Fixtures exist      | pass    | pages/, public/, next.config.js all present and identical to original                                    |
| 6b  | next.config.js      | pass    | Copied verbatim                                                                                          |
| 6c  | Overrides           | na      |                                                                                                          |
| 7a  | No dead code        | pass    |                                                                                                          |
| 7b  | retry over timeout  | pass    |                                                                                                          |
| 7c  | async/await         | pass    |                                                                                                          |
| 7d  | eslint              | pass    |                                                                                                          |

## Issues

None

## Warnings

None
