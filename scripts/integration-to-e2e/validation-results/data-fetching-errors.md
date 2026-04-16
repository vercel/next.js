# data-fetching-errors: PASS

Conversion accurately preserves all tests with proper dev/prod guards and correct API migration.

## Criteria

| #   | Criterion           | Verdict | Note                                                                     |
| --- | ------------------- | ------- | ------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 10 (dev:5, prod:5), converted: 10 (dev:5, prod:5)              |
| 1b  | Assertions          | pass    | original: 11 expects, converted: 11 expects                              |
| 1c  | Test titles         | pass    | Prod titles reworded "show error" → "show build error" (minor)           |
| 1d  | Describe blocks     | pass    | dev + prod describe blocks preserved                                     |
| 2a  | URL paths           | pass    | `/` accessed via `next.render('/')`                                      |
| 2b  | Response checks     | pass    | stderr/cliOutput assertions preserved                                    |
| 2c  | FS checks           | pass    | `fs.writeFile(indexPage, ...)` → `next.patchFile('pages/index.js', ...)` |
| 2d  | Browser checks      | na      |                                                                          |
| 2e  | Build output        | pass    | `nextBuild` → `next.build()` with `cliOutput` check                      |
| 2f  | Dynamic logic       | pass    | `isDev` branch → `isNextDev`/`isNextStart` describe guards               |
| 3a  | nextTestSetup       | pass    | Used in both describes                                                   |
| 3b  | files param         | pass    | `files: __dirname`                                                       |
| 3c  | skipStart           | pass    | Prod describe uses `skipStart: true`                                     |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                            |
| 3e  | Cleanup             | pass    | No manual cleanup required (isolated copy)                               |
| 4a  | Directory placement | pass    | `test/e2e/` with dev/prod guards                                         |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` guard each describe                            |
| 4c  | Turbopack guards    | na      |                                                                          |
| 4d  | Dedup guards        | pass    | Implicit via `isNextDev`/`isNextStart` (run in appropriate CI mode only) |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` in converted                        |
| 5a  | render              | pass    | `renderViaHTTP(port, '/')` → `next.render('/')`                          |
| 5b  | fetch               | na      |                                                                          |
| 5c  | browser             | na      |                                                                          |
| 5d  | check→retry         | pass    | `check()` replaced by `retry()` + `expect()` in Error stack test         |
| 5e  | File class          | na      |                                                                          |
| 5f  | waitFor             | na      |                                                                          |
| 5g  | fs operations       | pass    | `fs.writeFile` → `next.patchFile`                                        |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                                 |
| 6b  | next.config.js      | na      | Original had none                                                        |
| 6c  | Overrides           | na      |                                                                          |
| 7a  | No dead code        | pass    |                                                                          |
| 7b  | retry over timeout  | pass    |                                                                          |
| 7c  | async/await         | pass    |                                                                          |
| 7d  | eslint              | pass    |                                                                          |

## Issues

None

## Warnings

None
