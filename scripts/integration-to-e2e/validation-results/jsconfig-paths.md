# jsconfig-paths: PASS

Conversion preserves all tests, assertions, titles, and describe structure with appropriate mode guards and fixture migration.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                             |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 12 (6×2 via runTests), converted: 12                                                                                                                   |
| 1b  | Assertions          | pass    | original: 20, converted: 20                                                                                                                                      |
| 1c  | Test titles         | pass    | All 6 titles preserved across both describes                                                                                                                     |
| 1d  | Describe blocks     | pass    | Both top-level describes preserved; inner 'default behavior' / 'should build' flattened                                                                          |
| 2a  | URL paths           | pass    | /basic-alias, /resolve-order, /resolve-fallback, /single-alias all covered                                                                                       |
| 2b  | Response checks     | pass    | Cheerio body text checks preserved                                                                                                                               |
| 2c  | FS checks           | pass    | Trace JSON reads via next.readFile instead of fs+appDir                                                                                                          |
| 2d  | Browser checks      | na      | No webdriver usage                                                                                                                                               |
| 2e  | Build output        | pass    | stripAnsi(next.cliOutput) replaces captured stderr/stdout                                                                                                        |
| 2f  | Dynamic logic       | pass    | runTests helper inlined; dev-only module-not-found gated by isNextDev, build test by isNextStart                                                                 |
| 3a  | nextTestSetup       | pass    | Used in both describes                                                                                                                                           |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                               |
| 3c  | skipStart           | pass    | Second describe uses skipStart:true + manual next.start() after patching jsconfig                                                                                |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp/nextBuild in converted                                                                                                             |
| 3e  | Cleanup             | pass    | File is patched back in finally; jsconfig restoration handled by isolation                                                                                       |
| 4a  | Directory placement | pass    | test/e2e/ — runs in both dev and prod with internal guards                                                                                                       |
| 4b  | Mode guards         | pass    | isNextDev for HMR-style error, isNextStart for trace files                                                                                                       |
| 4c  | Turbopack guards    | na      | No turbopack-specific skip                                                                                                                                       |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_DEV ? describe.skip` around prod-build test; converted relies on isNextStart which naturally excludes dev mode — functionally equivalent |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD references                                                                                                                      |
| 5a  | render              | pass    | renderViaHTTP → next.render$/next.render                                                                                                                         |
| 5b  | fetch               | na      | No fetchViaHTTP in original                                                                                                                                      |
| 5c  | browser             | na      |                                                                                                                                                                  |
| 5d  | check→retry         | na      | Original already used retry                                                                                                                                      |
| 5e  | File class          | pass    | File/jsconfig.write replaced with next.readFile+next.patchFile                                                                                                   |
| 5f  | waitFor             | na      | Not used                                                                                                                                                         |
| 5g  | fs operations       | pass    | fs.readJSON/readFile on appDir → next.readFile + JSON.parse                                                                                                      |
| 6a  | Fixtures exist      | pass    | pages/{basic-alias,resolve-order,resolve-fallback,single-alias}.js, components/{hello,world}.js, lib/a                                                           | b, node_modules/mypackage, jsconfig.json, next.config.js all present |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                                                                           |
| 6c  | Overrides           | na      | No overrides used                                                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                                                                  |
| 7b  | retry over timeout  | pass    | retry() used for polling                                                                                                                                         |
| 7c  | async/await         | pass    |                                                                                                                                                                  |
| 7d  | eslint              | pass    |                                                                                                                                                                  |

## Issues

None

## Warnings

- 4d: Original `process.env.TURBOPACK_DEV ? describe.skip : describe` wrapper is replaced by `isNextStart` gating. This is effectively equivalent (the trace test only applies to a production build), but it is not a literal preservation of the dedup guard.
