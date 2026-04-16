# dynamic-optional-routing: WARN

Solid conversion preserving all render/api/gsp tests and invalid-page scenarios, but the original's Turbopack dedup guards were dropped.

## Criteria

| #   | Criterion             | Verdict | Note                                                                                                                           |
| --- | --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count            | pass    | original: 29 `it()` (24 in runTests + 4 invalid + 1 prod-only); converted: 33 (24 render + 4 dev-invalid + 5 build-validation) |
| 1b  | Assertions            | pass    | converted has >= original expects                                                                                              |
| 1c  | Test titles           | pass    | All 24 render titles preserved; invalid-pages titles slightly reworded but semantically equivalent                             |
| 1d  | Describe blocks       | pass    | Flattened appropriately; mode-specific blocks replaced with isNextDev guard + skipStart describe                               |
| 2a  | URL paths             | pass    | All 24 paths preserved via next.render/next.fetch                                                                              |
| 2b  | Response checks       | pass    | status, json, HTML selectors preserved                                                                                         |
| 2c  | FS checks             | pass    | fs.outputFile/fs.unlink replaced with next.patchFile/next.deleteFile                                                           |
| 2d  | Browser checks        | na      | No webdriver use                                                                                                               |
| 2e  | Build output          | pass    | nextBuild+stderr replaced with next.build()+next.cliOutput                                                                     |
| 2f  | Dynamic logic         | pass    | dev-only invalid tests wrapped in `if (isNextDev)`; build validation uses skipStart                                            |
| 3a  | nextTestSetup         | pass    | Both describes use nextTestSetup                                                                                               |
| 3b  | files param           | pass    | `files: __dirname`                                                                                                             |
| 3c  | skipStart             | pass    | Build-validation describe uses skipStart: true                                                                                 |
| 3d  | No manual lifecycle   | pass    | No findPort/killApp/launchApp/nextBuild imports                                                                                |
| 3e  | Cleanup               | pass    | try/finally deleteFile in dev block; build validation doesn't need cleanup (isolated dir)                                      |
| 4a  | Directory placement   | pass    | test/e2e/ appropriate since original ran in both dev and prod                                                                  |
| 4b  | Mode guards           | pass    | isNextDev used for dev-only invalid tests                                                                                      |
| 4c  | Turbopack skip guards | na      | Not a Turbopack-only/webpack-only suite                                                                                        |
| 4d  | Dedup guards          | warn    | Original had `process.env.TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards on dev/prod describes; not preserved in converted      |
| 4e  | No incorrect env      | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD usage                                                                                         |
| 5a  | render                | pass    |                                                                                                                                |
| 5b  | fetch                 | pass    |                                                                                                                                |
| 5c  | browser               | na      |                                                                                                                                |
| 5d  | check→retry           | pass    | `check(() => stderr, regex)` replaced with `retry(() => expect(next.cliOutput).toMatch(...))`                                  |
| 5e  | File class            | na      | Not used                                                                                                                       |
| 5f  | waitFor               | na      | Not used                                                                                                                       |
| 5g  | fs operations         | pass    | appDir fs calls replaced with next.patchFile/deleteFile                                                                        |
| 6a  | Fixtures exist        | pass    | next.config.js, all pages, api route, and gsp variants present                                                                 |
| 6b  | next.config.js        | pass    | Present                                                                                                                        |
| 6c  | Overrides             | na      | None used                                                                                                                      |
| 7a  | No dead code          | pass    |                                                                                                                                |
| 7b  | retry over timeout    | pass    |                                                                                                                                |
| 7c  | async/await           | pass    |                                                                                                                                |
| 7d  | eslint                | pass    |                                                                                                                                |

## Issues

None

## Warnings

- 4d: Original wrapped dev describe with `process.env.TURBOPACK_BUILD ? describe.skip` and prod describe with `process.env.TURBOPACK_DEV ? describe.skip` to dedupe CI runs. The converted test doesn't carry equivalent dedup guards, which may cause redundant runs in Turbopack CI jobs.
