# client-404: PASS

Faithful conversion — all 3 tests, fixtures, API migrations, and mode guards are correctly preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                    |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                                                                               |
| 1b  | Assertions          | pass    | original: ~5 expects + 1 check, converted: 6 expects                                                                                    |
| 1c  | Test titles         | pass    | All three titles preserved verbatim                                                                                                     |
| 1d  | Describe blocks     | pass    | Outer `Client 404` + nested `should show 404 upon client replacestate` preserved; dev/prod blocks correctly flattened via `isNextStart` |
| 2a  | URL paths           | pass    | `/asd`, `/invalid-link`, `/to-missing-link`, and navigation targets all preserved                                                       |
| 2b  | Response checks     | pass    | All element text + URL + eval assertions preserved                                                                                      |
| 2c  | FS checks           | na      | No fs assertions                                                                                                                        |
| 2d  | Browser checks      | pass    | `next.browser()` replaces `webdriver`, identical selectors/clicks/evals                                                                 |
| 2e  | Build output        | na      | No build output checks                                                                                                                  |
| 2f  | Dynamic logic       | pass    | `isProd` branch → `if (isNextStart)` guard                                                                                              |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                                                                   |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                      |
| 3c  | skipStart           | na      | Not a build-only test                                                                                                                   |
| 3d  | No manual lifecycle | pass    | All `findPort`/`launchApp`/`killApp`/`nextBuild`/`nextStart` removed                                                                    |
| 3e  | Cleanup             | pass    | No external resources                                                                                                                   |
| 4a  | Directory placement | pass    | `test/e2e/` — original ran in both dev and prod                                                                                         |
| 4b  | Mode guards         | pass    | `isNextStart` gates the prod-only missing-bundle test                                                                                   |
| 4c  | Turbopack guards    | na      | Original had no Turbopack skips (only dedup guards for dev/prod)                                                                        |
| 4d  | Dedup guards        | na      | Original `TURBOPACK_DEV`/`TURBOPACK_BUILD` guards were jest dev/prod dedup; e2e runs a single mode per invocation so not applicable     |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` usage                                                                                              |
| 5a  | render              | na      | No `renderViaHTTP` outside warmup                                                                                                       |
| 5b  | fetch               | na      | None used                                                                                                                               |
| 5c  | browser             | pass    | `webdriver(port, path)` → `next.browser(path)`                                                                                          |
| 5d  | check→retry         | pass    | `check(..., /404/)` → `retry(() => expect(...).toMatch(/404/))`                                                                         |
| 5e  | File class          | na      |                                                                                                                                         |
| 5f  | waitFor             | na      |                                                                                                                                         |
| 5g  | fs operations       | pass    | `appDir` → `next.testDir` in `getClientBuildManifestLoaderChunkUrlPath`                                                                 |
| 6a  | Fixtures exist      | pass    | `pages/{index,_error,invalid-link,missing,to-missing-link}.js` + `next.config.js` all present                                           |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                                                                                  |
| 6c  | Overrides           | na      |                                                                                                                                         |
| 7a  | No dead code        | pass    |                                                                                                                                         |
| 7b  | retry over timeout  | pass    |                                                                                                                                         |
| 7c  | async/await         | pass    |                                                                                                                                         |
| 7d  | eslint              | pass    |                                                                                                                                         |

## Issues

None.

## Warnings

None.
