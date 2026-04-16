# fetch-polyfill-ky-universal: PASS

Clean conversion preserving dev/prod coverage using `nextTestSetup` with `skipStart`, manual start for env injection, and proper external API server lifecycle via allowlisted `initNextServerScript`/`killApp`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                   |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 6 (3×2), converted: 6                                                        |
| 1b  | Assertions          | pass    | original: 6, converted: 6                                                              |
| 1c  | Test titles         | pass    | Titles preserved with "(dev)"/"(prod)" suffix (minor wording change)                   |
| 1d  | Describe blocks     | pass    | Outer + dev/prod nested preserved                                                      |
| 2a  | URL paths           | pass    | /static, /ssr, /getinitialprops all covered                                            |
| 2b  | Response checks     | pass    | `toMatch(/bar/)` preserved                                                             |
| 2c  | FS checks           | na      | None                                                                                   |
| 2d  | Browser checks      | na      | None                                                                                   |
| 2e  | Build output        | na      | No build assertions                                                                    |
| 2f  | Dynamic logic       | pass    | `runTests()` helper inlined into both describes                                        |
| 3a  | nextTestSetup       | pass    | Used correctly                                                                         |
| 3b  | files param         | pass    | `files: __dirname`                                                                     |
| 3c  | skipStart           | pass    | `skipStart: true`, manual start after env set                                          |
| 3d  | No manual lifecycle | pass    | Only `findPort`/`initNextServerScript`/`killApp` for external API server (allowlisted) |
| 3e  | Cleanup             | pass    | `afterAll` kills external apiServer; Next lifecycle handled by setup                   |
| 4a  | Directory placement | pass    | `test/e2e/` — runs in both dev and prod                                                |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` split preserved                                              |
| 4c  | Turbopack guards    | na      | Original had dedup guards only, no full Turbopack skip                                 |
| 4d  | Dedup guards        | pass    | `isNextDev`/`isNextStart` split achieves the same dedup as TURBOPACK_BUILD/DEV guards  |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD usage                                                           |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                        |
| 5b  | fetch               | na      | Not used                                                                               |
| 5c  | browser             | na      | Not used                                                                               |
| 5d  | check→retry         | na      | Not used                                                                               |
| 5e  | File class          | na      | Not used                                                                               |
| 5f  | waitFor             | na      | Not used                                                                               |
| 5g  | fs operations       | na      | None                                                                                   |
| 6a  | Fixtures exist      | pass    | api-server.js, api/api-route.js, pages/{static,ssr,getinitialprops}.js all present     |
| 6b  | next.config.js      | na      | Original had none                                                                      |
| 6c  | Overrides           | pass    | Dependencies (`ky-universal`, `ky`) provided via `dependencies` option                 |
| 7a  | No dead code        | pass    |                                                                                        |
| 7b  | retry over timeout  | na      | No polling needed                                                                      |
| 7c  | async/await         | pass    |                                                                                        |
| 7d  | eslint              | pass    | Titles unique within their describes                                                   |

## Issues

None

## Warnings

None
