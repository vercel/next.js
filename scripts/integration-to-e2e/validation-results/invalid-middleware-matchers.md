# invalid-middleware-matchers: PASS

Clean conversion that preserves both tests across dev and start modes using `isNextDev`/`isNextStart` guards, with fixture-based middleware writes via `next.patchFile()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                    |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 tests (× 2 mode describes), converted: 2 tests (× 2 mode describes)                                                         |
| 1b  | Assertions          | pass    | All 10+ stderr `toContain` assertions preserved in both branches                                                                        |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                                          |
| 1d  | Describe blocks     | pass    | Outer describe + dev/production describes preserved                                                                                     |
| 2a  | URL paths           | pass    | `fetchViaHTTP('/')` → `next.fetch('/')` in dev path                                                                                     |
| 2b  | Response checks     | pass    | stderr assertions preserved; uses `next.cliOutput`                                                                                      |
| 2c  | FS checks           | pass    | Uses `next.patchFile`/`deleteFile` instead of fs-extra                                                                                  |
| 2d  | Browser checks      | na      |                                                                                                                                         |
| 2e  | Build output        | pass    | `nextBuild` → `next.build()` + `next.cliOutput`                                                                                         |
| 2f  | Dynamic logic       | pass    | `runTests(mode)` helper retained; dev/start branches inlined                                                                            |
| 3a  | nextTestSetup       | pass    |                                                                                                                                         |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                      |
| 3c  | skipStart           | pass    | `skipStart: true`; dev path explicitly `next.start()`                                                                                   |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild imports                                                                                                 |
| 3e  | Cleanup             | pass    | `afterEach` deletes middleware + stops server                                                                                           |
| 4a  | Directory placement | pass    | test/e2e, runs in both modes                                                                                                            |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` wrap the describe blocks                                                                                      |
| 4c  | Turbopack guards    | na      | No turbopack-only skip needed                                                                                                           |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup replaced by mode-natural `isNextDev`/`isNextStart` guarding, which dedups equivalently |
| 4e  | No incorrect env    | pass    | Only `isTurbopack` used for branching                                                                                                   |
| 5a  | render              | na      |                                                                                                                                         |
| 5b  | fetch               | pass    |                                                                                                                                         |
| 5c  | browser             | na      |                                                                                                                                         |
| 5d  | check→retry         | na      | Original didn't use `check`                                                                                                             |
| 5e  | File class          | na      | Original used fs-extra directly                                                                                                         |
| 5f  | waitFor             | na      |                                                                                                                                         |
| 5g  | fs operations       | pass    | `fs.writeFile` → `next.patchFile`                                                                                                       |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                                                                                                |
| 6b  | next.config.js      | na      | None in original                                                                                                                        |
| 6c  | Overrides           | na      |                                                                                                                                         |
| 7a  | No dead code        | pass    |                                                                                                                                         |
| 7b  | retry over timeout  | pass    | Uses `retry()` for dev stderr polling                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                                         |
| 7d  | eslint              | pass    |                                                                                                                                         |

## Issues

None

## Warnings

None
